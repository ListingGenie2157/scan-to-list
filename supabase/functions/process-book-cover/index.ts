import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🔧 Test function called, method:', req.method);

  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Reading request body...');
    const requestData = await req.json();
    console.log('📋 Received data:', requestData);

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
      throw new Error('OCR_SPACE_API_KEY not found');
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: "Test function working",
      hasApiKey: !!ocrApiKey,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Test function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});