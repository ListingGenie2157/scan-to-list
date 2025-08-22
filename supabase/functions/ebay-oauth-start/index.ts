import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || "";
const EBAY_SCOPES = Deno.env.get("EBAY_SCOPES") || "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/buy.browse.readonly";
function b64url(input) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: corsHeaders
  });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EBAY_CLIENT_ID) {
      const missing = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      return new Response(JSON.stringify({
        error: "Server configuration error",
        missing
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: "No authorization header"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const supabase1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: userError } = await supabase1.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Parse optional returnUrl
    let returnUrl = "";
    try {
      const body = await req.json();
      if (body && typeof body.returnUrl === "string" && /^https?:\/\//.test(body.returnUrl)) {
        returnUrl = body.returnUrl;
      }
    } catch  {
    // ignore
    }
    // Use direct Supabase callback (must match in callback function)
    const callbackUrl = new URL("/functions/v1/ebay-oauth-callback", SUPABASE_URL).toString();
    // Encode state with user + optional return URL
    const statePayload = JSON.stringify({
      u: user.id,
      r: returnUrl || null,
      t: Date.now()
    });
    const state = b64url(statePayload);
    const authorizeUrl = new URL("https://auth.ebay.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", EBAY_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
    authorizeUrl.searchParams.set("scope", EBAY_SCOPES);
    authorizeUrl.searchParams.set("state", state);
    return new Response(JSON.stringify({
      authorizeUrl: authorizeUrl.toString()
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
