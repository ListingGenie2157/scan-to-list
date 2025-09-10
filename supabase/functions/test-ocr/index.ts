// Simple diagnostic function to test OCR dependencies
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        OPENAI_API_KEY: Deno.env.get('OPENAI_API_KEY') ? 'SET' : 'MISSING',
        SUPABASE_URL: Deno.env.get('SUPABASE_URL') ? 'SET' : 'MISSING',
        SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
      },
      request: {
        method: req.method,
        url: req.url,
      }
    };

    // Test OpenAI API key if available
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (openAIKey) {
      try {
        const testResponse = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${openAIKey}`,
          }
        });
        
        diagnostics.openai_test = {
          status: testResponse.status,
          ok: testResponse.ok,
          message: testResponse.ok ? 'API key valid' : 'API key invalid'
        };
      } catch (error) {
        diagnostics.openai_test = {
          error: error.message,
          message: 'Failed to test OpenAI API'
        };
      }
    }

    return new Response(JSON.stringify(diagnostics, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});