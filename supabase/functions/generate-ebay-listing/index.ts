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
    const { itemData } = await req.json();

    if (!itemData) {
      throw new Error('Item data is required');
    }

    const { title, author, publisher, publication_year, condition, category, isbn, genre } = itemData;

    // Create a detailed prompt for eBay listing optimization
    const prompt = `Create an SEO-optimized eBay listing for this item:

Title: ${title || 'Unknown'}
Author: ${author || 'Unknown'}
Publisher: ${publisher || 'Unknown'}
Year: ${publication_year || 'Unknown'}
Condition: ${condition || 'Good'}
Category: ${category || 'Book'}
ISBN: ${isbn || 'Not available'}
Genre: ${genre || 'Unknown'}

Please generate:
1. An eBay title (max 80 characters) that includes key searchable terms and follows eBay best practices
2. A compelling description (200-300 words) that:
   - Highlights key selling points
   - Includes condition details
   - Uses relevant keywords for eBay search
   - Has a professional, trustworthy tone
   - Mentions shipping and return policy basics

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