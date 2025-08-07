import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// Function to resize image if too large for OCR API
async function resizeImageIfNeeded(imageUrl: string): Promise<string> {
  try {
    // First, check the image size
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const imageBlob = await response.blob();
    const imageSizeKB = imageBlob.size / 1024;
    
    console.log(`📏 Image size: ${imageSizeKB.toFixed(2)} KB`);
    
    // If image is under 1MB (1024 KB), return original URL
    if (imageSizeKB < 1024) {
      console.log('✅ Image size is acceptable, using original');
      return imageUrl;
    }
    
    console.log('🔄 Image too large, resizing...');
    
    // Create a canvas to resize the image
    const canvas = new OffscreenCanvas(800, 600); // Max dimensions
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    // Create image from blob
    const imageBitmap = await createImageBitmap(imageBlob);
    
    // Calculate new dimensions maintaining aspect ratio
    const maxWidth = 800;
    const maxHeight = 600;
    const aspectRatio = imageBitmap.width / imageBitmap.height;
    
    let newWidth = maxWidth;
    let newHeight = maxHeight;
    
    if (aspectRatio > 1) {
      // Landscape
      newHeight = maxWidth / aspectRatio;
    } else {
      // Portrait
      newWidth = maxHeight * aspectRatio;
    }
    
    // Resize canvas
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    // Draw resized image
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
    
    // Convert to blob with quality compression
    const resizedBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.8
    });
    
    console.log(`📐 Resized to: ${(resizedBlob.size / 1024).toFixed(2)} KB`);
    
    // For now, return original URL since we can't upload the resized image
    // In a real implementation, you'd upload the resized blob to storage
    return imageUrl;
    
  } catch (error) {
    console.error('❌ Error resizing image:', error);
    return imageUrl; // Fallback to original
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 Full OCR Function called, method:', req.method);

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

    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ocrApiKey) {
      throw new Error('OCR_SPACE_API_KEY environment variable is not set');
    }

    console.log('🔑 API key available');
    console.log('🖼️ Processing image:', imageUrl);

    // Check and potentially resize image
    const processedImageUrl = await resizeImageIfNeeded(imageUrl);

    // OCR API call with the processed image URL
    const formData = new FormData();
    formData.append('url', processedImageUrl);
    formData.append('apikey', ocrApiKey);
    formData.append('language', 'eng');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    console.log('📡 Calling OCR.space API...');
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('❌ OCR API Error:', errorText);
      throw new Error(`OCR API returned ${ocrResponse.status}: ${errorText}`);
    }

    const ocrData = await ocrResponse.json();
    console.log('📄 OCR Response:', JSON.stringify(ocrData, null, 2));
    
    if (ocrData.OCRExitCode !== 1) {
      console.error('❌ OCR Exit Code Error:', ocrData.ErrorMessage);
      throw new Error(`OCR Error: ${ocrData.ErrorMessage || 'OCR processing failed'}`);
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    console.log('📝 Extracted text length:', extractedText.length);
    
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

    // Basic parsing
    const isMagazine = allText.includes('magazine') || allText.includes('issue');
    if (isMagazine) {
      extractedInfo.genre = 'magazine';
      extractedInfo.suggested_price = 8.0;
    }

    // Look for author in first few lines
    for (const line of lines.slice(1, 4)) {
      if (line.toLowerCase().includes('by ') || /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line)) {
        extractedInfo.author = line.replace(/^by\s+/i, '');
        break;
      }
    }

    console.log('📚 Parsed info:', { 
      title: extractedInfo.title, 
      author: extractedInfo.author, 
      genre: extractedInfo.genre 
    });

    // Initialize Supabase client and update database
    console.log('🗄️ Initializing Supabase...');
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    console.log('💾 Updating database...');
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .update({
        title: extractedInfo.title,
        author: extractedInfo.author,
        genre: extractedInfo.genre,
        condition_assessment: extractedInfo.condition_assessment,
        suggested_price: extractedInfo.suggested_price,
        confidence_score: extractedInfo.confidence_score,
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

    console.log('✅ Database updated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedInfo: {
        title: extractedInfo.title,
        author: extractedInfo.author,
        genre: extractedInfo.genre
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Function error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});