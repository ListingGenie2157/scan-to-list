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

    // Extract text using OCR.space
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('apikey', ocrSpaceApiKey!);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'false');
    formData.append('scale', 'true');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    if (!ocrResponse.ok) {
      throw new Error('Failed to extract text from image');
    }

    const ocrData = await ocrResponse.json();
    
    if (ocrData.OCRExitCode !== 1) {
      throw new Error(ocrData.ErrorMessage || 'OCR processing failed');
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    
    // Parse the extracted text to identify book information
    const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let extractedInfo = {
      title: null,
      author: null,
      publisher: null,
      publication_year: null,
      isbn: null,
      genre: null,
      condition_assessment: 'good',
      suggested_price: null,
      confidence_score: 0.7
    };

    // Simple parsing logic - can be enhanced
    if (lines.length > 0) {
      // Usually the title is the largest text or first significant line
      extractedInfo.title = lines[0];
      
      // Look for author patterns
      for (const line of lines) {
        if (line.toLowerCase().includes('by ') || 
            line.toLowerCase().includes('author') ||
            /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line)) {
          extractedInfo.author = line.replace(/^by\s+/i, '');
          break;
        }
      }
      
      // Look for ISBN
      for (const line of lines) {
        const isbnMatch = line.match(/ISBN[:\s]*(\d{10}|\d{13}|\d{1,5}-\d{1,7}-\d{1,7}-\d{1,7}-\d{1})/i);
        if (isbnMatch) {
          extractedInfo.isbn = isbnMatch[1];
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