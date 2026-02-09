// XHR polyfill removed - not needed for fetch-based calls
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert ALL CAPS or inconsistent casing to proper Title Case
function toTitleCase(str: string): string {
  if (!str) return '';
  if (str === str.toUpperCase() && str.length > 3) {
    str = str.toLowerCase();
  }
  const minorWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet'];
  
  return str
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || !minorWords.includes(lower)) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    })
    .join(' ');
}

// Format month from date string for display
function formatMonthYear(dateStr: string | null, year?: number | null): string | null {
  if (!dateStr && !year) return null;
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  if (dateStr) {
    const monthYearMatch = dateStr.match(/([a-zA-Z]+)\s*(\d{4})/i);
    if (monthYearMatch) {
      return `${toTitleCase(monthYearMatch[1])} ${monthYearMatch[2]}`;
    }
    const isoMatch = dateStr.match(/(\d{4})-(\d{2})/);
    if (isoMatch) {
      const monthIndex = parseInt(isoMatch[2], 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${monthNames[monthIndex]} ${isoMatch[1]}`;
      }
    }
  }
  
  if (year) return year.toString();
  return null;
}

// Deterministic magazine title builder - no AI, no creative rewriting
function buildMagazineTitle(itemData: ItemInfo, userPrefs?: UserPreferences): string {
  const MAX_LENGTH = 80;

  // Build parts in priority order
  const parts: (string | null)[] = [
    itemData.title ? toTitleCase(itemData.title.replace(/\s*magazine\s*/i, ' ').trim()) + ' Magazine' : 'Magazine',
    itemData.issue_title ? toTitleCase(itemData.issue_title) : null,
    itemData.issue_number ? `Issue ${itemData.issue_number.replace(/^0+/, '').replace(/issue\s*/i, '')}` : null,
    formatMonthYear(itemData.issue_date, itemData.publication_year),
    itemData.promotional_hook || null,
    itemData.included_items || null,
  ];

  // Remove nulls and empty strings
  const validParts = parts.filter((p): p is string => p !== null && p.trim() !== '');

  // Remove consecutive duplicate words only (e.g., "Magazine Magazine" → "Magazine")
  let title = validParts
    .join(' ')
    .split(' ')
    .filter((word, i, arr) => {
      if (i === 0) return true;
      return word.toLowerCase() !== arr[i - 1].toLowerCase();
    })
    .join(' ');

  // Append user preference keywords if they fit
  const extras = [
    ...(userPrefs?.title_keywords || []),
    ...(userPrefs?.shipping_keywords || []),
  ];
  for (const kw of extras) {
    const next = `${title} ${kw}`;
    if (next.length <= MAX_LENGTH) {
      title = next;
    } else {
      break;
    }
  }

  // Truncate on word boundary
  if (title.length > MAX_LENGTH) {
    const words = title.split(' ');
    let truncated = '';
    for (const word of words) {
      const next = truncated ? `${truncated} ${word}` : word;
      if (next.length <= MAX_LENGTH) {
        truncated = next;
      } else {
        break;
      }
    }
    title = truncated;
  }

  return title || 'Magazine';
}

interface UserPreferences {
  title_prefixes?: string[];
  title_suffixes?: string[];
  custom_title_text?: string;
  title_keywords?: string[];
  shipping_keywords?: string[];
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

    const { title, author, publisher, publication_year, condition, category, isbn, genre, issue_number, issue_date, issue_title, topic, promotional_hook, included_items } = itemData;

    // Get user preferences for title additions
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let userPreferences: UserPreferences | null = null;
    if (userId) {
      const { data } = await supabase
        .from('user_profiles')
        .select('title_prefixes, title_suffixes, custom_title_text, title_keywords, shipping_keywords')
        .eq('id', userId)
        .maybeSingle();
      userPreferences = data;
    }

    // Detect if this is a magazine
    const isMagazine = 
      genre?.toLowerCase().includes('magazine') || 
      category?.toLowerCase().includes('magazine') || 
      title?.toLowerCase().includes('magazine') ||
      issue_number || 
      issue_date ||
      /\b(vol\.?|volume|issue|no\.?|number)\s*\d/i.test(title || '') ||
      /\b(weekly|monthly|quarterly|annual)\b/i.test(genre || '');
    
    console.log('Magazine detection:', { isMagazine, genre, category, title, issue_number, issue_date });
    
    let optimizedTitle: string;
    let descriptionPrompt: string;
    
    if (isMagazine) {
      optimizedTitle = buildMagazineTitle(
        { title, issue_title, issue_number, issue_date, publication_year, promotional_hook, included_items },
        userPreferences || undefined
      );
      
      console.log('Generated magazine title:', optimizedTitle);
      
      descriptionPrompt = `Create a compelling eBay description (200-300 words) for this magazine:

Magazine: ${title || 'Unknown'}
Issue Title: ${issue_title || 'Not specified'}
Issue Number: ${issue_number || 'Unknown'}
Issue Date: ${issue_date || 'Unknown'}
Year: ${publication_year || 'Unknown'}
Condition: ${condition || 'Good'}
Genre: ${genre || 'Not specified'}
Topic: ${topic || 'Not specified'}

The description should:
- Highlight key selling points and any special features (cover stories, interviews, notable articles)
- Include condition details
- Use relevant keywords for eBay search
- Have a professional, trustworthy tone
- Appeal to magazine collectors and enthusiasts
- Mention that shipping and handling will be done carefully

Respond with ONLY the description text, no JSON or formatting.`;
    } else {
      // Build keyword instructions based on user preferences
      const keywordInstructions = [];
      if (userPreferences?.title_keywords?.length) {
        keywordInstructions.push(`- MUST include these condition keywords: ${userPreferences.title_keywords.join(', ')}`);
      }
      if (userPreferences?.shipping_keywords?.length) {
        keywordInstructions.push(`- MUST include these shipping keywords: ${userPreferences.shipping_keywords.join(', ')}`);
      }
      if (userPreferences?.title_prefixes?.length) {
        keywordInstructions.push(`- MUST include these prefixes: ${userPreferences.title_prefixes.join(', ')}`);
      }
      if (userPreferences?.title_suffixes?.length) {
        keywordInstructions.push(`- MUST include these suffixes: ${userPreferences.title_suffixes.join(', ')}`);
      }
      if (userPreferences?.custom_title_text) {
        keywordInstructions.push(`- MUST include this text: "${userPreferences.custom_title_text}"`);
      }
      // If no keywords selected, tell AI not to add filler keywords
      if (!userPreferences?.title_keywords?.length) {
        keywordInstructions.push(`- Do NOT add condition descriptors like "New", "Vintage", "Rare", "Collectible" unless they are factually accurate for this specific item`);
      }

      const fullPrompt = `Create an SEO-optimized eBay listing for this item:

Title: ${title || 'Unknown'}
Author: ${author || 'Unknown'}
Publisher: ${publisher || 'Unknown'}
Year: ${publication_year || 'Unknown'}
Condition: ${condition || 'Good'}
Category: ${category || 'Book'}
ISBN: ${isbn || 'Not available'}
Genre: ${genre || 'Unknown'}
Topic: ${topic || 'Not specified'}

Please generate:
1. An eBay title that is EXACTLY 80 characters or less (prefer 76-80) that includes:
   - Book title and author
   - Include key descriptive terms
   - Use relevant keywords that collectors and buyers search for
   - Include condition if space allows
   ${keywordInstructions.join('\n   ')}
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
        let contentToParse = generatedContent;
        if (contentToParse.includes('```json')) {
          contentToParse = contentToParse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (contentToParse.includes('```')) {
          contentToParse = contentToParse.replace(/```\s*/g, '');
        }
        contentToParse = contentToParse.trim();
        
        const parsed = JSON.parse(contentToParse);
        optimizedTitle = parsed.title || title || 'Item for Sale';
        
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
  topic?: string;
  promotional_hook?: string;
  included_items?: string;
}

async function getMarketBasedPricing(itemData: ItemInfo): Promise<number | null> {
  const { title, author, isbn } = itemData;
  
  try {
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

function calculateFallbackPrice(itemData: ItemInfo): number {
  const { condition, category, publication_year } = itemData;
  const isMagazine = category?.toLowerCase().includes('magazine');
  
  let basePrice = isMagazine ? 8.0 : 15.0;
  
  const conditionMultiplier = {
    'new': 1.5,
    'like-new': 1.3,
    'good': 1.0,
    'fair': 0.7,
    'poor': 0.5
  };
  
  basePrice *= conditionMultiplier[condition] || 1.0;
  
  if (!isMagazine && publication_year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - publication_year;
    if (age > 20) {
      basePrice *= 1.2;
    }
  }
  
  return Math.round(basePrice * 100) / 100;
}
