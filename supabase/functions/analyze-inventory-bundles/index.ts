import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { userId } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📊 Fetching inventory for user:', userId);

    // Fetch user's inventory items
    const { data: inventoryItems, error } = await supabase
      .from('inventory_items')
      .select(`
        id, title, author, publisher, genre, series_title, 
        publication_year, condition_assessment, suggested_price,
        status, created_at
      `)
      .eq('user_id', userId)
      .eq('status', 'photographed')
      .not('title', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch inventory: ${error.message}`);
    }

    if (!inventoryItems || inventoryItems.length < 2) {
      return new Response(JSON.stringify({ 
        success: true,
        suggestions: [],
        message: "Need at least 2 items to suggest bundles"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📚 Analyzing ${inventoryItems.length} items for bundle opportunities`);

    // Prepare inventory data for AI analysis
    const inventoryForAnalysis = inventoryItems.map(item => ({
      id: item.id,
      title: item.title,
      author: item.author,
      publisher: item.publisher,
      genre: item.genre,
      series: item.series_title,
      year: item.publication_year,
      condition: item.condition_assessment,
      price: item.suggested_price
    }));

    const prompt = `Analyze this inventory and suggest bundle opportunities. Look for:

1. **Series Bundles**: Books from the same series (e.g., "Harry Potter Complete Set")
2. **Author Bundles**: Multiple books by the same author (e.g., "Stephen King Horror Collection")
3. **Genre Bundles**: Books in the same genre/category (e.g., "Science Fiction Paperback Bundle")
4. **Publisher Bundles**: Books from same publisher/imprint (e.g., "Penguin Classics Collection")
5. **Era Bundles**: Books from similar time periods (e.g., "1980s Fantasy Collection")
6. **Condition Bundles**: Group similar condition items for different market tiers

For each bundle suggestion, provide:
- bundle_type: "series" | "author" | "genre" | "publisher" | "era" | "condition"
- bundle_name: Catchy, searchable title (e.g., "Stephen King Horror Collection - 8 Books")
- item_ids: Array of inventory item IDs to include
- estimated_bundle_price: Suggested price (consider bulk discount)
- individual_total: Sum of individual suggested prices
- savings_percentage: How much buyers save vs individual purchase
- target_market: Who would buy this (collectors, readers, etc.)
- selling_points: Why this bundle is attractive

Inventory data:
${JSON.stringify(inventoryForAnalysis, null, 2)}

Return JSON array of bundle suggestions, maximum 10 suggestions, prioritize most valuable/obvious bundles.`;

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
            content: 'You are an expert marketplace seller who identifies profitable bundle opportunities. Focus on bundles that would appeal to collectors, readers, and bargain hunters. Respond with valid JSON only.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('🤖 AI bundle analysis response:', aiResponse);

    // Parse the JSON response
    let bundleSuggestions;
    try {
      bundleSuggestions = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      bundleSuggestions = [];
    }

    // Validate that item_ids exist in our inventory
    const validSuggestions = bundleSuggestions.filter(suggestion => {
      if (!suggestion.item_ids || !Array.isArray(suggestion.item_ids)) return false;
      const validIds = suggestion.item_ids.filter(id => 
        inventoryItems.some(item => item.id === id)
      );
      suggestion.item_ids = validIds;
      return validIds.length >= 2; // Must have at least 2 items
    });

    console.log(`✅ Generated ${validSuggestions.length} valid bundle suggestions`);

    return new Response(JSON.stringify({ 
      success: true,
      suggestions: validSuggestions,
      total_items_analyzed: inventoryItems.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-inventory-bundles function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});