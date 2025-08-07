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
    console.log('🚀 Function called with method:', req.method);
    
    const { photoId, imageUrl } = await req.json();
    console.log('📋 Request data:', { photoId, imageUrl });

    if (!photoId || !imageUrl) {
      console.error('❌ Missing required fields');
      throw new Error('Photo ID and image URL are required');
    }

    if (!openAIApiKey) {
      console.error('❌ OpenAI API key not found');
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Supabase credentials not found');
      throw new Error('Supabase environment variables not set');
    }

    console.log('🖼️ Processing image with OpenAI Vision:', imageUrl);
    console.log('🔑 API key available:', !!openAIApiKey);

    // Initialize Supabase client
    console.log('🗄️ Initializing Supabase...');
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Use OpenAI GPT-4 Vision to analyze the book/magazine cover
    const visionPrompt = `Analyze this book or magazine cover image and extract the following information. Respond with valid JSON only:

{
  "title": "exact title as written on cover",
  "author": "author name if visible (for books) or null for magazines",
  "publisher": "publisher name if visible",
  "publication_year": "year if visible (number only)",
  "isbn": "ISBN if visible (numbers only, no dashes)",
  "genre": "book or magazine",
  "issue_number": "issue number if it's a magazine",
  "issue_date": "issue date if it's a magazine (Month Year format)",
  "condition_assessment": "mint, excellent, good, or fair based on visible condition",
  "confidence_score": "decimal from 0.1 to 1.0 based on text clarity"
}

Look carefully at all text on the cover. For magazines, pay special attention to issue numbers, dates, and volume numbers. For books, focus on title, author, and any publisher information. If you can't read something clearly, use null for that field.`;

    console.log('📡 Calling OpenAI API...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1, // Low temperature for more consistent extraction
      }),
    });

    console.log('📊 OpenAI Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API Error:', response.status, errorText);
      
      // Return a fallback response instead of throwing
      const fallbackInfo = {
        title: 'Processing Failed - Manual Review Needed',
        author: null,
        publisher: null,
        publication_year: null,
        isbn: null,
        genre: 'book',
        condition_assessment: 'good',
        confidence_score: 0.1,
        issue_number: null,
        issue_date: null,
        suggested_price: 10.0
      };
      
      // Update database with fallback
      const { data: inventoryItem } = await supabase
        .from('inventory_items')
        .update(fallbackInfo)
        .eq('photo_id', photoId)
        .select()
        .maybeSingle();

      return new Response(JSON.stringify({ 
        success: true, 
        inventoryItem,
        extractedInfo: fallbackInfo,
        message: `OpenAI API error: ${response.status}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const extractedContent = data.choices[0].message.content;
    
    console.log('OpenAI Vision Response:', extractedContent);

    // Parse the JSON response
    let extractedInfo;
    try {
      extractedInfo = JSON.parse(extractedContent);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', extractedContent);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate and clean the extracted info
    const cleanedInfo = {
      title: extractedInfo.title || null,
      author: extractedInfo.author || null,
      publisher: extractedInfo.publisher || null,
      publication_year: extractedInfo.publication_year ? parseInt(extractedInfo.publication_year) : null,
      isbn: extractedInfo.isbn || null,
      genre: extractedInfo.genre || 'book',
      condition_assessment: extractedInfo.condition_assessment || 'good',
      confidence_score: extractedInfo.confidence_score || 0.7,
      issue_number: extractedInfo.issue_number || null,
      issue_date: extractedInfo.issue_date || null,
    };

    // Estimate pricing based on genre and condition
    let suggested_price = 10.0; // Default
    const isMagazine = cleanedInfo.genre?.toLowerCase().includes('magazine');
    
    switch (cleanedInfo.condition_assessment) {
      case 'mint':
        suggested_price = isMagazine ? 15.0 : 25.0;
        break;
      case 'excellent':
        suggested_price = isMagazine ? 10.0 : 20.0;
        break;
      case 'good':
        suggested_price = isMagazine ? 8.0 : 15.0;
        break;
      case 'fair':
        suggested_price = isMagazine ? 5.0 : 8.0;
        break;
    }
    
    cleanedInfo.suggested_price = suggested_price;

    console.log('Cleaned extracted info:', cleanedInfo);

    // Create or update inventory item
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .update({
        title: cleanedInfo.title,
        author: cleanedInfo.author,
        publisher: cleanedInfo.publisher,
        publication_year: cleanedInfo.publication_year,
        isbn: cleanedInfo.isbn,
        genre: cleanedInfo.genre,
        condition_assessment: cleanedInfo.condition_assessment,
        suggested_price: cleanedInfo.suggested_price,
        confidence_score: cleanedInfo.confidence_score,
        issue_number: cleanedInfo.issue_number,
        issue_date: cleanedInfo.issue_date,
        status: 'photographed', // Keep existing valid status
        extracted_text: extractedContent // Store AI response for debugging
      })
      .eq('photo_id', photoId)
      .select()
      .single();

    if (inventoryError) {
      console.error('Database error:', inventoryError);
      throw new Error(`Database error: ${inventoryError.message}`);
    }

    console.log('Successfully saved inventory item:', inventoryItem);

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedInfo: cleanedInfo
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-book-cover function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});