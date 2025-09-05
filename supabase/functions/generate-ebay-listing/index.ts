import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemData, userId } = await req.json();

    if (!itemData) {
      throw new Error('Item data is required');
    }

    const { title, author, publisher, publication_year, condition, category, isbn, genre, issue_number, issue_date } = itemData;

    // Get user preferences for title additions
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let userPreferences = null;
    if (userId) {
      const { data } = await supabase
        .from('user_profiles')
        .select('title_prefixes, title_suffixes, custom_title_text')
        .eq('id', userId)
        .maybeSingle();
      userPreferences = data;
    }

    // Create a detailed prompt for eBay listing optimization
    const isMagazine = genre?.toLowerCase().includes('magazine') || category?.toLowerCase().includes('magazine');
    
    const prompt = `Create an SEO-optimized eBay listing for this ${isMagazine ? 'magazine' : 'item'}:

Title: ${title || 'Unknown'}
${isMagazine ? 'Issue Number:' : 'Author:'} ${isMagazine ? (issue_number || 'Unknown') : (author || 'Unknown')}
Publisher: ${publisher || 'Unknown'}
${isMagazine ? 'Issue Date:' : 'Year:'} ${isMagazine ? (issue_date || publication_year || 'Unknown') : (publication_year || 'Unknown')}
Condition: ${condition || 'Good'}
Category: ${category || (isMagazine ? 'Magazine' : 'Book')}
ISBN: ${isbn || 'Not available'}
Genre: ${genre || 'Unknown'}

Please generate:
1. An eBay title (max 80 characters) that includes key searchable terms and follows eBay best practices
   ${isMagazine ? '- For magazines: Include magazine name, issue number/date, and year for maximum searchability' : '- For books: Include title, author, and key descriptive terms'}
   - Use relevant keywords that collectors and buyers search for
   - Include condition if space allows
   ${userPreferences?.title_prefixes?.length ? `- MUST include these prefixes: ${userPreferences.title_prefixes.join(', ')}` : ''}
   ${userPreferences?.title_suffixes?.length ? `- MUST include these suffixes: ${userPreferences.title_suffixes.join(', ')}` : ''}
   ${userPreferences?.custom_title_text ? `- MUST include this text: "${userPreferences.custom_title_text}"` : ''}
2. A compelling description (200-300 words) that:
   - Highlights key selling points
   ${isMagazine ? '- Mentions issue details and any special features (cover stories, interviews, etc.)' : '- Includes author credentials and book highlights'}
   - Includes condition details and any flaws
   - Uses relevant keywords for eBay search
   - Has a professional, trustworthy tone
   - Appeals to collectors and enthusiasts
   - Mentions shipping and return policy basics

Format your response as JSON with "title" and "description" fields. Do not include pricing in your response as that will be calculated separately.`;

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
          { role: 'user', content: prompt }
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

    // Parse the JSON response
    let optimizedListing;
    try {
      optimizedListing = JSON.parse(generatedContent);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      optimizedListing = {
        title: title || 'Item for Sale',
        description: generatedContent
      };
    }

    // Generate market-based pricing using ebay-app-search function
    const marketPrice = await getMarketBasedPricing(itemData);
    if (marketPrice) {
      optimizedListing.price = marketPrice;
    }

    return new Response(JSON.stringify({ 
      success: true,
      optimizedListing
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
async function getMarketBasedPricing(itemData: any): Promise<number | null> {
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

    // Call the ebay-app-search edge function
    const base = Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co");
    const pricingUrl = `${base}/ebay-app-search`;
    
    const response = await fetch(pricingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isbn: isbn || undefined,
        query: !isbn ? searchQuery : undefined
      })
    });

    if (!response.ok) {
      console.error('eBay pricing function error:', response.status, response.statusText);
      return null;
    }

    const pricingData = await response.json();
    
    if (pricingData.success && pricingData.suggestedPrice) {
      console.log('Got pricing from eBay:', pricingData.suggestedPrice);
      return pricingData.suggestedPrice;
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
function calculateFallbackPrice(itemData: any): number {
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