import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 OCR Function called, method:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Processing request...');
    const requestData = await req.json();
    console.log('📋 Request data received:', requestData);

    const { photoId, imageUrl } = requestData;
    
    if (!photoId || !imageUrl) {
      console.error('❌ Missing data:', { photoId: !!photoId, imageUrl: !!imageUrl });
      throw new Error('Photo ID and image URL are required');
    }

    // Check environment variables
    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('🔑 Environment check:', {
      ocrApiKey: !!ocrApiKey,
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!supabaseServiceKey
    });

    if (!ocrApiKey) {
      throw new Error('OCR_SPACE_API_KEY not found in environment');
    }

    // Initialize Supabase
    console.log('🗄️ Initializing Supabase...');
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Test OCR API call
    console.log('🔍 Starting OCR processing for URL:', imageUrl);
    const formData = new FormData();
    formData.append('url', imageUrl);
    formData.append('apikey', ocrApiKey);
    formData.append('language', 'eng');

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    console.log('📡 OCR API response status:', ocrResponse.status);
    
    if (!ocrResponse.ok) {
      throw new Error(`OCR API returned status ${ocrResponse.status}`);
    }

    const ocrData = await ocrResponse.json();
    console.log('📄 OCR response:', ocrData);

    if (ocrData.OCRExitCode !== 1) {
      throw new Error(`OCR failed: ${ocrData.ErrorMessage || 'Unknown OCR error'}`);
    }

    const extractedText = ocrData.ParsedResults?.[0]?.ParsedText || '';
    console.log('📝 Extracted text length:', extractedText.length);

    // Simple title extraction (just use first non-empty line)
    const lines = extractedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const title = lines[0] || 'Unknown Title';
    
    console.log('📚 Extracted title:', title);

    // Update inventory item
    console.log('💾 Updating inventory item...');
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('inventory_items')
      .update({
        title: title,
        status: 'analyzed',
        extracted_text: { fullText: extractedText }
      })
      .eq('photo_id', photoId)
      .select()
      .single();

    if (inventoryError) {
      console.error('❌ Database error:', inventoryError);
      throw new Error(`Database update failed: ${inventoryError.message}`);
    }

    console.log('✅ Success! Updated inventory item:', inventoryItem.id);

    return new Response(JSON.stringify({ 
      success: true, 
      inventoryItem,
      extractedTitle: title
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Function error:', error.message);
    console.error('💥 Full error:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});