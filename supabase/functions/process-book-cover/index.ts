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
    
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      throw new Error('Invalid JSON in request body');
    }
    
    const { photoId, imageUrl } = requestData;
    console.log('📋 Request data:', { photoId, imageUrl });

    if (!photoId || !imageUrl) {
      console.error('❌ Missing required fields');
      throw new Error('Photo ID and image URL are required');
    }

    if (!openAIApiKey) {
      console.error('❌ OpenAI API key not found');
      return await handleMissingAPIKey(photoId, supabaseUrl, supabaseServiceKey);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Supabase credentials not found');
      return new Response(JSON.stringify({ 
        error: 'Supabase credentials not configured',
        success: false
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🖼️ Processing image with OpenAI Vision:', imageUrl);
    console.log('🔑 API key available:', !!openAIApiKey);

    // Initialize Supabase client
    console.log('🗄️ Initializing Supabase...');
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Enhanced OCR-focused prompt
    const visionPrompt = `You are an expert at reading text from book and magazine covers. Please carefully read ALL visible text on this image and extract the following information. 

CRITICAL: Focus on OCR accuracy - read every piece of text you can see, no matter how small or faded.

Look for:
- Main title (usually largest text)
- Subtitle (smaller text under main title)
- Author name(s) (often below title or at bottom)
- Publisher information (small text, often at bottom)
- Issue numbers for magazines (like "Vol 5 No 3" or "#25")
- Dates (month/year for magazines, year for books)
- ISBN numbers (usually on back, but sometimes visible on spine)
- Series information
- Edition information

Return ONLY valid JSON in this exact format:
{
  "all_visible_text": "list every piece of text you can read, separated by | symbols",
  "title": "exact main title as written",
  "subtitle": "subtitle if present, null if not",
  "author": "author name if visible, null if not",
  "publisher": "publisher name if visible, null if not",
  "publication_year": "4-digit year if visible, null if not",
  "isbn": "ISBN numbers only, no dashes, null if not visible",
  "genre": "book or magazine",
  "issue_number": "issue/volume number for magazines, null for books",
  "issue_date": "Month Year format for magazines, null for books",
  "series_title": "series name if this is part of a series, null if not",
  "edition": "edition information if visible, null if not",
  "condition_assessment": "mint, excellent, good, or fair based on visible wear/damage",
  "confidence_score": "decimal 0.1-1.0 based on text clarity and how much you could read",
  "ocr_quality": "excellent, good, poor, or failed"
}

If you cannot read any text clearly, set "ocr_quality" to "failed" and "confidence_score" to 0.1.`;

    console.log('📡 Calling OpenAI API...');
    
    // Try multiple model names in case one doesn't work
    const modelNames = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview'];
    let response;
    let modelUsed;
    
    for (const model of modelNames) {
      try {
        console.log(`🔍 Trying model: ${model}`);
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: visionPrompt },
                  { 
                    type: 'image_url', 
                    image_url: { 
                      url: imageUrl,
                      detail: "high" // Request high detail for better OCR
                    } 
                  }
                ]
              }
            ],
            max_tokens: 1000, // Increased for more detailed extraction
            temperature: 0.0, // Zero temperature for consistent OCR
          }),
        });
        
        if (response.ok) {
          modelUsed = model;
          console.log(`✅ Successfully used model: ${model}`);
          break;
        } else {
          console.log(`❌ Model ${model} failed with status:`, response.status);
        }
      } catch (modelError) {
        console.log(`❌ Model ${model} error:`, modelError.message);
        continue;
      }
    }

    if (!response || !response.ok) {
      console.error('❌ All OpenAI models failed');
      const errorText = response ? await response.text() : 'No response';
      console.error('Error details:', errorText);
      
      return await handleAPIError(photoId, supabase, `All models failed: ${errorText}`);
    }

    let data;
    let extractedContent;
    try {
      data = await response.json();
      extractedContent = data.choices?.[0]?.message?.content;
      
      if (!extractedContent) {
        console.error('❌ No content in OpenAI response:', data);
        return await handleAPIError(photoId, supabase, 'No content in OpenAI response');
      }
    } catch (jsonError) {
      console.error('❌ Failed to parse OpenAI API response as JSON:', jsonError);
      const responseText = await response.text();
      console.error('Raw response:', responseText);
      return await handleAPIError(photoId, supabase, `OpenAI API returned invalid JSON: ${responseText}`);
    }
    
    console.log('✅ OpenAI Vision Response:', extractedContent);
    console.log('🤖 Model used:', modelUsed);

    // Parse the extracted content with multiple fallback strategies
    let extractedInfo;
    try {
      // Strategy 1: Try parsing as-is
      extractedInfo = JSON.parse(extractedContent);
    } catch (parseError1) {
      console.log('❌ Strategy 1 failed, trying to extract JSON block...');
      try {
        // Strategy 2: Extract JSON from code blocks or markdown
        const jsonMatch = extractedContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || 
                         extractedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonString = jsonMatch[1] || jsonMatch[0];
          extractedInfo = JSON.parse(jsonString);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError2) {
        console.error('❌ Strategy 2 failed, trying manual extraction...');
        // Strategy 3: Manual extraction of key information
        return await handleJSONParseError(photoId, supabase, extractedContent);
      }
    }

    // Validate OCR quality
    if (extractedInfo.ocr_quality === 'failed' || extractedInfo.confidence_score < 0.3) {
      console.log('⚠️ Low OCR quality detected, may need manual review');
    }

    // Enhanced data cleaning with better validation
    const cleanedInfo = {
      title: extractedInfo.title && extractedInfo.title !== 'null' ? extractedInfo.title.trim() : null,
      subtitle: extractedInfo.subtitle && extractedInfo.subtitle !== 'null' ? extractedInfo.subtitle.trim() : null,
      author: extractedInfo.author && extractedInfo.author !== 'null' ? extractedInfo.author.trim() : null,
      publisher: extractedInfo.publisher && extractedInfo.publisher !== 'null' ? extractedInfo.publisher.trim() : null,
      publication_year: extractedInfo.publication_year ? parseInt(String(extractedInfo.publication_year)) : null,
      isbn: extractedInfo.isbn && extractedInfo.isbn !== 'null' ? extractedInfo.isbn.replace(/[^\d]/g, '') : null,
      genre: extractedInfo.genre || 'book',
      condition_assessment: extractedInfo.condition_assessment || 'good',
      confidence_score: Math.max(0.1, Math.min(1.0, parseFloat(extractedInfo.confidence_score) || 0.7)),
      issue_number: extractedInfo.issue_number && extractedInfo.issue_number !== 'null' ? extractedInfo.issue_number.trim() : null,
      issue_date: extractedInfo.issue_date && extractedInfo.issue_date !== 'null' ? extractedInfo.issue_date.trim() : null,
      series_title: extractedInfo.series_title && extractedInfo.series_title !== 'null' ? extractedInfo.series_title.trim() : null,
      edition: extractedInfo.edition && extractedInfo.edition !== 'null' ? extractedInfo.edition.trim() : null,
      all_visible_text: extractedInfo.all_visible_text || '',
      ocr_quality: extractedInfo.ocr_quality || 'unknown',
      model_used: modelUsed
    };

    // Enhanced pricing logic
    const suggested_price = calculatePrice(cleanedInfo);
    cleanedInfo.suggested_price = suggested_price;

    console.log('🧹 Cleaned extracted info:', cleanedInfo);

    // Update inventory item with more comprehensive data
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .update({
        title: cleanedInfo.title,
        subtitle: cleanedInfo.subtitle,
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
        series_title: cleanedInfo.series_title,
        edition: cleanedInfo.edition,
        status: 'photographed',
        extracted_text: extractedContent,
        all_visible_text: cleanedInfo.all_visible_text,
        ocr_quality: cleanedInfo.ocr_quality,
        model_used: cleanedInfo.model_used,
        processed_at: new Date().toISOString()
      })
      .eq('photo_id', photoId)
      .select()
      .single();

    if (inventoryError) {
      console.error('❌ Database error:', inventoryError);
      throw new Error(`Database error: ${inventoryError.message}`);
    }

    console.log('✅ Successfully saved inventory item:', inventoryItem);

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedInfo: cleanedInfo,
      debug: {
        modelUsed,
        ocrQuality: cleanedInfo.ocr_quality,
        confidence: cleanedInfo.confidence_score,
        visibleText: cleanedInfo.all_visible_text
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in process-book-cover function:', error);
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

// Helper functions
async function handleMissingAPIKey(photoId: string, supabaseUrl: string, supabaseServiceKey: string) {
  const fallbackInfo = {
    title: 'API Key Missing - Manual Review Needed',
    author: null,
    publisher: null,
    publication_year: null,
    isbn: null,
    genre: 'book',
    condition_assessment: 'good',
    confidence_score: 0.1,
    issue_number: null,
    issue_date: null,
    suggested_price: 10.0,
    ocr_quality: 'failed'
  };
  
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
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
    message: 'OpenAI API key not configured'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleAPIError(photoId: string, supabase: any, errorMessage: string) {
  const fallbackInfo = {
    title: 'OCR Processing Failed - Manual Review Needed',
    author: null,
    publisher: null,
    publication_year: null,
    isbn: null,
    genre: 'book',
    condition_assessment: 'good',
    confidence_score: 0.1,
    issue_number: null,
    issue_date: null,
    suggested_price: 10.0,
    ocr_quality: 'failed'
  };
  
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
    message: `OCR failed: ${errorMessage}`
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleJSONParseError(photoId: string, supabase: any, rawContent: string) {
  // Try to extract some basic info even if JSON parsing failed
  const titleMatch = rawContent.match(/title['":\s]+([^'",\n]+)/i);
  const authorMatch = rawContent.match(/author['":\s]+([^'",\n]+)/i);
  
  const fallbackInfo = {
    title: titleMatch ? titleMatch[1].trim() : 'JSON Parse Failed - Manual Review Needed',
    author: authorMatch ? authorMatch[1].trim() : null,
    publisher: null,
    publication_year: null,
    isbn: null,
    genre: 'book',
    condition_assessment: 'good',
    confidence_score: 0.2,
    issue_number: null,
    issue_date: null,
    suggested_price: 10.0,
    ocr_quality: 'poor',
    all_visible_text: rawContent
  };
  
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
    message: 'JSON parsing failed but extracted some info'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function calculatePrice(info: any): number {
  const isMagazine = info.genre?.toLowerCase().includes('magazine');
  const isVintage = info.publication_year && info.publication_year < 1990;
  
  let basePrice = isMagazine ? 8.0 : 15.0;
  
  // Adjust for condition
  const conditionMultiplier = {
    'mint': 1.5,
    'excellent': 1.2,
    'good': 1.0,
    'fair': 0.6
  };
  
  basePrice *= conditionMultiplier[info.condition_assessment] || 1.0;
  
  // Vintage bonus
  if (isVintage) {
    basePrice *= 1.3;
  }
  
  // Series bonus
  if (info.series_title) {
    basePrice *= 1.1;
  }
  
  return Math.round(basePrice * 100) / 100;
}