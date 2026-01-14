import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Magazine title template builder - creates structured, SEO-optimized titles
function buildMagazineTitle(itemData: ItemInfo, userPrefs?: UserPreferences): string {
  const MAX_LENGTH = 80;
  const parts: string[] = [];
  
  // 1. Always start with "New"
  parts.push("New");
  
  // 2. Publication name + Magazine (ensure "Magazine" is always included)
  let pubName = itemData.title || '';
  // Remove "magazine" if already in the title to avoid duplication
  pubName = pubName.replace(/\s*magazine\s*/i, ' ').trim();
  // Also clean up common patterns like "- " at the end
  pubName = pubName.replace(/[-–—]\s*$/, '').trim();
  
  if (pubName) {
    parts.push(`${pubName} Magazine`);
  } else {
    parts.push("Magazine");
  }
  
  // 3. Issue title (if available and different from publication name)
  if (itemData.issue_title && itemData.issue_title.toLowerCase() !== pubName.toLowerCase()) {
    parts.push(`- ${itemData.issue_title}`);
  }
  
  // 4. Issue number OR month/year
  if (itemData.issue_number) {
    parts.push(`#${itemData.issue_number}`);
  }
  
  // Format issue date (month/year)
  if (itemData.issue_date) {
    parts.push(itemData.issue_date);
  } else if (itemData.publication_year) {
    parts.push(itemData.publication_year.toString());
  }
  
  // 5. Build initial title and check length
  let title = parts.join(' ');
  
  // 6. Add SEO keywords if there's room
  const seoKeywords = ['Vintage', 'Collectible', 'Rare', 'Classic', 'Original', 'Print'];
  
  for (const keyword of seoKeywords) {
    const potentialTitle = `${title} ${keyword}`;
    if (potentialTitle.length <= MAX_LENGTH) {
      title = potentialTitle;
    } else {
      break;
    }
  }
  
  // 7. Apply user preferences if available and there's room
  if (userPrefs?.title_suffixes?.length) {
    for (const suffix of userPrefs.title_suffixes) {
      const potentialTitle = `${title} ${suffix}`;
      if (potentialTitle.length <= MAX_LENGTH) {
        title = potentialTitle;
        break;
      }
    }
  }
  
  // 8. Smart truncation if still over limit
  if (title.length > MAX_LENGTH) {
    const words = title.split(' ');
    let truncated = '';
    for (const word of words) {
      const nextTruncated = truncated ? `${truncated} ${word}` : word;
      if (nextTruncated.length <= MAX_LENGTH) {
        truncated = nextTruncated;
      } else {
        break;
      }
    }
    title = truncated;
  }
  
  return title;
}

interface UserPreferences {
  title_prefixes?: string[];
  title_suffixes?: string[];
  custom_title_text?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemData, userId } = await req.json();

    if (!itemData) {
      throw new Error('Item data is required');
    }

    const { title, author, publisher, publication_year, condition, category, isbn, genre, issue_number, issue_date, issue_title } = itemData;

    // Get user preferences for title additions
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let userPreferences: UserPreferences | null = null;
    if (userId) {
      const { data } = await supabase
        .from('user_profiles')
        .select('title_prefixes, title_suffixes, custom_title_text')
        .eq('id', userId)
        .maybeSingle();
      userPreferences = data;
    }

    // Detect if this is a magazine
    const isMagazine = genre?.toLowerCase().includes('magazine') || 
                       category?.toLowerCase().includes('magazine') || 
                       issue_number || 
                       issue_date;
    
    let optimizedTitle: string;
    let descriptionPrompt: string;
    
    if (isMagazine) {
      // For magazines: Use template-based title generation (not AI)
      optimizedTitle = buildMagazineTitle(
        { title, issue_title, issue_number, issue_date, publication_year },
        userPreferences || undefined
      );
      
      // AI generates description only for magazines
      descriptionPrompt = `Create a compelling eBay description (200-300 words) for this magazine:

Magazine: ${title || 'Unknown'}
Issue Title: ${issue_title || 'Not specified'}
Issue Number: ${issue_number || 'Unknown'}
Issue Date: ${issue_date || 'Unknown'}
Year: ${publication_year || 'Unknown'}
Condition: ${condition || 'Good'}

The description should:
- Highlight key selling points and any special features (cover stories, interviews, notable articles)
- Include condition details
- Use relevant keywords for eBay search (vintage, collectible, rare, etc.)
- Have a professional, trustworthy tone
- Appeal to magazine collectors and enthusiasts
- Mention that shipping and handling will be done carefully

Respond with ONLY the description text, no JSON or formatting.`;
    } else {
      // For non-magazines: Use AI for both title and description
      const fullPrompt = `Create an SEO-optimized eBay listing for this item:

Title: ${title || 'Unknown'}
Author: ${author || 'Unknown'}
Publisher: ${publisher || 'Unknown'}
Year: ${publication_year || 'Unknown'}
Condition: ${condition || 'Good'}
Category: ${category || 'Book'}
ISBN: ${isbn || 'Not available'}
Genre: ${genre || 'Unknown'}

Please generate:
1. An eBay title that is EXACTLY 80 characters or less (prefer 76-80) that includes:
   - Book title and author
   - Include key descriptive terms
   - Use relevant keywords that collectors and buyers search for
   - Include condition if space allows
   ${userPreferences?.title_prefixes?.length ? `- MUST include these prefixes: ${userPreferences.title_prefixes.join(', ')}` : ''}
   ${userPreferences?.title_suffixes?.length ? `- MUST include these suffixes: ${userPreferences.title_suffixes.join(', ')}` : ''}
   ${userPreferences?.custom_title_text ? `- MUST include this text: "${userPreferences.custom_title_text}"` : ''}
2. A compelling description (200-300 words) that:
   - Highlights key selling points
   - Includes author credentials and book highlights
   - Includes condition details and any flaws
   - Uses relevant keywords for eBay search
   - Has a professional, trustworthy tone
   - Appeals to collectors and enthusiasts
   - Mentions shipping and return policy basics

CRITICAL: Ensure the title is exactly 80 characters or less. Count characters carefully.
Format your response as JSON with "title" and "description" fields.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: 'You are an expert eBay listing optimizer. Generate compelling, SEO-friendly titles and descriptions that maximize visibility and sales potential. Always respond with valid JSON.' 
            },
            { role: 'user', content: fullPrompt }
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const generatedContent = data.choices[0].message.content;

      try {
        const parsed = JSON.parse(generatedContent);
        optimizedTitle = parsed.title || title || 'Item for Sale';
        
        // Truncate title if needed
        if (optimizedTitle.length > 80) {
          const words = optimizedTitle.split(' ');
          let truncated = '';
          for (const word of words) {
            if ((truncated + ' ' + word).trim().length <= 80) {
              truncated = (truncated + ' ' + word).trim();
            } else {
              break;
            }
          }
          optimizedTitle = truncated;
        }
        
        // Return early for non-magazines
        const marketPrice = await getMarketBasedPricing(itemData);
        return new Response(JSON.stringify({ 
          success: true,
          optimizedListing: {
            title: optimizedTitle,
            description: parsed.description,
            price: marketPrice
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        optimizedTitle = title || 'Item for Sale';
        descriptionPrompt = generatedContent;
      }
    }

    // For magazines: Generate description with AI
    const descResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert eBay listing writer specializing in magazine descriptions. Write compelling, SEO-friendly descriptions that appeal to collectors.' 
          },
          { role: 'user', content: descriptionPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!descResponse.ok) {
      throw new Error(`OpenAI API error: ${descResponse.statusText}`);
    }

    const descData = await descResponse.json();
    const generatedDescription = descData.choices[0].message.content;

    // Generate market-based pricing
    const marketPrice = await getMarketBasedPricing(itemData);

    return new Response(JSON.stringify({ 
      success: true,
      optimizedListing: {
        title: optimizedTitle,
        description: generatedDescription,
        price: marketPrice
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-ebay-listing function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
// Function to get market-based pricing using the ebay-app-search edge function
interface ItemInfo {
  title?: string;
  author?: string;
  isbn?: string;
  condition?: string;
  category?: string;
  publication_year?: number;
  issue_title?: string;
  issue_number?: string;
  issue_date?: string;
}

async function getMarketBasedPricing(itemData: ItemInfo): Promise<number | null> {
  const { title, author, isbn } = itemData;
  
  try {
    // Create search query for eBay pricing function
    let searchQuery = '';
    if (isbn) {
      searchQuery = isbn;
    } else if (title && author) {
      searchQuery = `${title} ${author}`.trim();
    } else if (title) {
      searchQuery = title;
    } else {
      console.log('No search data available for pricing');
      return null;
    }

    // Call the ebay-app-search edge function using Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: response, error: pricingError } = await supabase.functions.invoke('ebay-app-search', {
      body: {
        isbn: isbn || undefined,
        query: !isbn ? searchQuery : undefined
      }
    });

    if (pricingError) {
      console.error('eBay pricing function error:', pricingError);
      return null;
    }

    if (response?.success && response?.suggestedPrice) {
      console.log('Got pricing from eBay:', response.suggestedPrice);
      return response.suggestedPrice;
    } else {
      console.log('No pricing data returned from eBay function');
      return null;
    }
    
  } catch (error) {
    console.error('Error calling eBay pricing function:', error);
    return null;
  }
}

// Fallback pricing function
function calculateFallbackPrice(itemData: ItemInfo): number {
  const { condition, category, publication_year } = itemData;
  const isMagazine = category?.toLowerCase().includes('magazine');
  
  let basePrice = isMagazine ? 8.0 : 15.0;
  
  // Condition multipliers
  const conditionMultiplier = {
    'new': 1.5,
    'like-new': 1.3,
    'good': 1.0,
    'fair': 0.7,
    'poor': 0.5
  };
  
  basePrice *= conditionMultiplier[condition] || 1.0;
  
  // Age adjustment for books
  if (!isMagazine && publication_year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - publication_year;
    if (age > 20) {
      basePrice *= 1.2; // Vintage books may be worth more
    }
  }
  
  return Math.round(basePrice * 100) / 100;
}

// Removed old eBay API functions - now using ebay-app-search edge function