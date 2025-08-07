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

    // Check if API key exists
    if (!ocrSpaceApiKey) {
      throw new Error('OCR_SPACE_API_KEY environment variable is not set');
    }

    console.log('Processing image:', imageUrl);
    console.log('Using API key ending in:', ocrSpaceApiKey.slice(-4));

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Extract text using OCR.space with enhanced error handling
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('apikey', ocrSpaceApiKey);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true'); // Changed to true for better accuracy
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Use engine 2 for better accuracy

    console.log('Sending request to OCR.space API...');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    console.log('OCR Response status:', ocrResponse.status);
    console.log('OCR Response headers:', Object.fromEntries(ocrResponse.headers.entries()));

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('OCR API Error Response:', errorText);
      throw new Error(`OCR API returned ${ocrResponse.status}: ${errorText}`);
    }

    const ocrData = await ocrResponse.json();
    console.log('OCR Response data:', JSON.stringify(ocrData, null, 2));
    
    if (ocrData.OCRExitCode !== 1) {
      const errorMessage = ocrData.ErrorMessage || 'OCR processing failed';
      console.error('OCR Processing Error:', errorMessage);
      throw new Error(`OCR Error: ${errorMessage}`);
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    console.log('Extracted text:', extractedText);
    
    if (!extractedText.trim()) {
      throw new Error('No text could be extracted from the image');
    }

    // Parse the extracted text to identify magazine/book information
    const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const allText = extractedText.toLowerCase();
    
    let extractedInfo = {
      title: null,
      author: null,
      publisher: null,
      publication_year: null,
      isbn: null,
      genre: null,
      condition_assessment: 'good',
      suggested_price: null,
      confidence_score: 0.7,
      issue_number: null,
      issue_date: null
    };

    // Enhanced parsing logic for magazines and books
    if (lines.length > 0) {
      // Detect if it's a magazine
      const isMagazine = allText.includes('magazine') || 
                        allText.includes('issue') || 
                        allText.includes('vol.') ||
                        allText.includes('volume') ||
                        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(allText);
      
      console.log('Detected as magazine:', isMagazine);
      
      if (isMagazine) {
        extractedInfo.genre = 'magazine';
        
        // Find magazine title (usually the largest/most prominent text)
        extractedInfo.title = lines[0];
        
        // Look for issue information
        for (const line of lines) {
          // Issue number patterns
          const issueMatch = line.match(/(?:issue|no\.?\s*|#)(\d+)/i);
          if (issueMatch) {
            extractedInfo.issue_number = issueMatch[1];
          }
          
          // Volume patterns
          const volumeMatch = line.match(/(?:vol\.?\s*|volume\s*)(\d+)/i);
          if (volumeMatch && !extractedInfo.issue_number) {
            extractedInfo.issue_number = volumeMatch[1];
          }
          
          // Date patterns (month year)
          const monthYearMatch = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(19|20)\d{2}\b/i);
          if (monthYearMatch) {
            extractedInfo.issue_date = monthYearMatch[0];
            extractedInfo.publication_year = parseInt(monthYearMatch[2] + monthYearMatch[0].slice(-2));
          }
        }
      } else {
        // Book processing
        extractedInfo.genre = 'book';
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
        
        // Look for publisher
        for (const line of lines) {
          if (line.toLowerCase().includes('publish') ||
              line.toLowerCase().includes('press') ||
              line.toLowerCase().includes('books') ||
              line.toLowerCase().includes('edition')) {
            extractedInfo.publisher = line;
            break;
          }
        }
      }
      
      // Look for ISBN (applicable to both)
      for (const line of lines) {
        const isbnMatch = line.match(/ISBN[:\s]*(\d{10}|\d{13}|\d{1,5}-\d{1,7}-\d{1,7}-\d{1,7}-\d{1})/i);
        if (isbnMatch) {
          extractedInfo.isbn = isbnMatch[1];
          break;
        }
      }
      
      // Look for year if not found in magazine date
      if (!extractedInfo.publication_year) {
        for (const line of lines) {
          const yearMatch = line.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            extractedInfo.publication_year = parseInt(yearMatch[0]);
            break;
          }
        }
      }
      
      // Estimate condition and price based on content
      if (allText.includes('mint') || allText.includes('perfect')) {
        extractedInfo.condition_assessment = 'mint';
        extractedInfo.suggested_price = isMagazine ? 15.0 : 25.0;
      } else if (allText.includes('excellent') || allText.includes('very fine')) {
        extractedInfo.condition_assessment = 'excellent';
        extractedInfo.suggested_price = isMagazine ? 10.0 : 20.0;
      } else if (allText.includes('fair') || allText.includes('worn')) {
        extractedInfo.condition_assessment = 'fair';
        extractedInfo.suggested_price = isMagazine ? 5.0 : 8.0;
      } else {
        extractedInfo.condition_assessment = 'good';
        extractedInfo.suggested_price = isMagazine ? 8.0 : 15.0;
      }

      // Increase confidence if we found good information
      if (extractedInfo.title && extractedInfo.title.length > 3) {
        extractedInfo.confidence_score = 0.8;
      }
      if (extractedInfo.author || extractedInfo.issue_number) {
        extractedInfo.confidence_score = 0.9;
      }
    }

    console.log('Final extracted info:', extractedInfo);

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
        issue_number: extractedInfo.issue_number,
        issue_date: extractedInfo.issue_date,
        status: 'analyzed',
        extracted_text: extractedText // Store raw text for debugging
      }, {
        onConflict: 'photo_id'
      })
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
      extractedInfo,
      rawText: extractedText // Include for debugging
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