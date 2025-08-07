import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const ocrSpaceApiKey = Deno.env.get('OCR_SPACE_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 OCR Function started, method:', req.method);

  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Reading request...');
    const { photoId, imageUrl } = await req.json();
    console.log('📋 Request data:', { photoId, imageUrl });

    if (!photoId || !imageUrl) {
      throw new Error('Photo ID and image URL are required');
    }

    if (!ocrSpaceApiKey) {
      throw new Error('OCR_SPACE_API_KEY environment variable is not set');
    }

    console.log('🔑 API key available:', ocrSpaceApiKey.slice(-4));
    console.log('🖼️ Processing image:', imageUrl);

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Extract text using OCR.space
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('apikey', ocrSpaceApiKey);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    console.log('📡 Calling OCR.space API...');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    console.log('📊 OCR Response status:', ocrResponse.status);

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('❌ OCR API Error:', errorText);
      throw new Error(`OCR API returned ${ocrResponse.status}: ${errorText}`);
    }

    const ocrData = await ocrResponse.json();
    console.log('📄 OCR Response:', JSON.stringify(ocrData, null, 2));
    
    if (ocrData.OCRExitCode !== 1) {
      const errorMessage = ocrData.ErrorMessage || 'OCR processing failed';
      console.error('❌ OCR Error:', errorMessage);
      throw new Error(`OCR Error: ${errorMessage}`);
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    console.log('📝 Extracted text length:', extractedText.length);
    console.log('📝 Extracted text preview:', extractedText.substring(0, 200));
    
    if (!extractedText.trim()) {
      throw new Error('No text could be extracted from the image');
    }

    // Parse the extracted text
    const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const allText = extractedText.toLowerCase();
    
    let extractedInfo = {
      title: lines[0] || 'Unknown Title',
      author: null,
      publisher: null,
      publication_year: null,
      isbn: null,
      genre: 'book',
      condition_assessment: 'good',
      suggested_price: 15.0,
      confidence_score: 0.7,
      issue_number: null,
      issue_date: null
    };

    // Enhanced parsing
    const isMagazine = allText.includes('magazine') || allText.includes('issue') || allText.includes('vol.');
    
    if (isMagazine) {
      extractedInfo.genre = 'magazine';
      extractedInfo.suggested_price = 8.0;
    }

    // Look for author
    for (const line of lines.slice(1, 5)) {
      if (line.toLowerCase().includes('by ') || /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line)) {
        extractedInfo.author = line.replace(/^by\s+/i, '');
        break;
      }
    }

    // Look for year
    for (const line of lines) {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        extractedInfo.publication_year = parseInt(yearMatch[0]);
        break;
      }
    }

    console.log('📚 Final extracted info:', extractedInfo);

    // Update inventory item
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .update({
        title: extractedInfo.title,
        author: extractedInfo.author,
        publisher: extractedInfo.publisher,
        publication_year: extractedInfo.publication_year,
        isbn: extractedInfo.isbn,
        genre: extractedInfo.genre,
        condition_assessment: extractedInfo.condition_assessment,
        suggested_price: extractedInfo.suggested_price,
        confidence_score: extractedInfo.confidence_score,
        issue_number: extractedInfo.issue_number,
        issue_date: extractedInfo.issue_date,
        status: 'analyzed',
        extracted_text: extractedText
      })
      .eq('photo_id', photoId)
      .select()
      .single();

    if (inventoryError) {
      console.error('❌ Database error:', inventoryError);
      throw new Error(`Database error: ${inventoryError.message}`);
    }

    console.log('✅ Successfully updated inventory item');

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedInfo,
      rawText: extractedText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Function error:', error.message);
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