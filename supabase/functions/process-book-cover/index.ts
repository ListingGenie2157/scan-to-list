import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { photoId, imageUrl } = await req.json();

    if (!photoId || !imageUrl) {
      throw new Error('Photo ID and image URL are required');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Analyze the book cover with OpenAI Vision
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing book covers and extracting bibliographic information. Extract the following information from book cover images: title, author, publisher, publication year, ISBN (if visible), genre, condition assessment, and suggest a fair market price. Return the information as a JSON object with these exact keys: title, author, publisher, publication_year, isbn, genre, condition_assessment, suggested_price, confidence_score (0-1). If information is not clearly visible, use null for that field.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please analyze this book cover and extract all visible bibliographic information.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to analyze image');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse the JSON response from OpenAI
    let extractedInfo;
    try {
      extractedInfo = JSON.parse(content);
    } catch (e) {
      // If JSON parsing fails, extract info manually
      extractedInfo = {
        title: null,
        author: null,
        publisher: null,
        publication_year: null,
        isbn: null,
        genre: null,
        condition_assessment: 'good',
        suggested_price: null,
        confidence_score: 0.5
      };
    }

    // Create or update inventory item
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .upsert({
        photo_id: photoId,
        title: extractedInfo.title,
        author: extractedInfo.author,
        publisher: extractedInfo.publisher,
        publication_year: extractedInfo.publication_year,
        isbn: extractedInfo.isbn,
        genre: extractedInfo.genre,
        condition_assessment: extractedInfo.condition_assessment,
        suggested_price: extractedInfo.suggested_price,
        confidence_score: extractedInfo.confidence_score,
        status: 'analyzed',
        extracted_text: extractedInfo
      }, {
        onConflict: 'photo_id'
      })
      .select()
      .single();

    if (inventoryError) {
      throw new Error(`Database error: ${inventoryError.message}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedInfo 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-book-cover function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});