import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("eBay pricing function called");

    const requestBody = await req.json().catch(() => ({
      isbn: undefined,
      query: undefined
    }));

    const { isbn, query } = requestBody;
    console.log("Request parameters:", { isbn, query });

    if (!isbn && !query) {
      return json({ error: "Provide isbn or query" }, 400);
    }

    // Check for environment variables
    const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
    const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");
    
    if (!EBAY_CLIENT_ID) {
      return json({ error: "EBAY_CLIENT_ID environment variable not set" }, 400);
    }
    if (!EBAY_CLIENT_SECRET) {
      return json({ error: "EBAY_CLIENT_SECRET environment variable not set" }, 400);
    }

    // Get eBay app token
    const auth = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
    
    const tokenResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
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

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      const errorMsg = tokenData.error_description || tokenData.error || `HTTP ${tokenResponse.status}`;
      return json({ error: `eBay authentication failed: ${errorMsg}` }, 401);
    }

    console.log("eBay token obtained successfully");
    
    // For now, return a simple success response for testing
    return json({
      success: true,
      message: "eBay connection test successful",
      suggestedPrice: 15.00,
      analytics: {
        count: 1,
        median: 15.00,
        average: 15.00,
        confidence: "medium"
      },
      items: []
    });

  } catch (e) {
    console.error("eBay pricing function error:", e);
    return json({ error: String(e) }, 500);
  }
});