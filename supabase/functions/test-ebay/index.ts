import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
    const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");

    // Basic diagnostics
    const diagnostics = {
      hasClientId: !!EBAY_CLIENT_ID,
      hasClientSecret: !!EBAY_CLIENT_SECRET,
      clientIdLength: EBAY_CLIENT_ID?.length || 0,
      secretLength: EBAY_CLIENT_SECRET?.length || 0,
      timestamp: new Date().toISOString()
    };

    // If we have credentials, test them
    if (EBAY_CLIENT_ID && EBAY_CLIENT_SECRET) {
      const auth = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      
      try {
        const tokRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${auth}`
          },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "https://api.ebay.com/oauth/api_scope/buy.browse"
          }).toString()
        });

        const tokenResult = await tokRes.json();
        diagnostics.ebayTokenTest = {
          status: tokRes.status,
          ok: tokRes.ok,
          hasAccessToken: !!tokenResult.access_token,
          error: tokenResult.error || null
        };
      } catch (tokenError) {
        diagnostics.ebayTokenTest = {
          error: tokenError.message
        };
      }
    }

    return new Response(JSON.stringify({
      success: true,
      diagnostics
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ 
      error: e.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});