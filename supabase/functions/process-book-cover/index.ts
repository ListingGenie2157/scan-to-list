import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 OCR Test Function called, method:', req.method);

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
    if (!ocrApiKey) {
      throw new Error('OCR_SPACE_API_KEY environment variable is not set');
    }

    console.log('🔑 API key available, ending in:', ocrApiKey.slice(-4));
    console.log('🖼️ Processing image:', imageUrl);

    // Test OCR.space API call
    console.log('📡 Creating FormData...');
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('apikey', ocrApiKey);
    formData.append('language', 'eng');

    console.log('📡 Calling OCR.space API...');
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    console.log('📊 OCR Response status:', ocrResponse.status);

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('❌ OCR API Error:', errorText);
      return new Response(JSON.stringify({ 
        success: false,
        error: `OCR API returned ${ocrResponse.status}: ${errorText}`,
        step: 'ocr_api_call'
      }), {
        status: 200, // Return 200 so we can see the error
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ocrData = await ocrResponse.json();
    console.log('📄 OCR Response received');
    
    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    console.log('📝 Extracted text length:', extractedText.length);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: "OCR API test successful",
      extractedTextLength: extractedText.length,
      extractedTextPreview: extractedText.substring(0, 100),
      ocrExitCode: ocrData.OCRExitCode,
      step: 'ocr_complete'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      step: 'function_error'
    }), {
      status: 200, // Return 200 so we can see the error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});