import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Use production credentials (both must match)
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!; // Production client ID
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME")!; // Production RuName
const EBAY_SCOPES = Deno.env.get("EBAY_SCOPES")!; // Application-specific scopes

function b64url(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

serve(async (req) => {
  console.log("Function called with method:", req.method);
  
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting eBay OAuth flow");
    
    // Check environment variables first
    const envCheck = {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
      EBAY_CLIENT_ID: !!EBAY_CLIENT_ID,
      EBAY_REDIRECT_RUNAME: !!EBAY_REDIRECT_RUNAME,
      EBAY_SCOPES: !!EBAY_SCOPES,
      CLIENT_ID_PREFIX: EBAY_CLIENT_ID ? EBAY_CLIENT_ID.substring(0, 10) + "..." : "MISSING",
      REDIRECT_URI: EBAY_REDIRECT_RUNAME || "MISSING",
      SCOPES_PREFIX: EBAY_SCOPES ? EBAY_SCOPES.substring(0, 50) + "..." : "MISSING"
    };
    console.log("Environment variables check:", envCheck);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EBAY_CLIENT_ID || !EBAY_REDIRECT_RUNAME || !EBAY_SCOPES) {
      const missing = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      if (!EBAY_REDIRECT_RUNAME) missing.push("EBAY_REDIRECT_RUNAME");
      if (!EBAY_SCOPES) missing.push("EBAY_SCOPES");
      
      console.error("Missing environment variables:", missing);
      return new Response(JSON.stringify({ error: "Server not configured", missing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Creating Supabase client");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    console.log("Getting user from auth");
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error("User authentication error:", userError);
      return new Response(JSON.stringify({ error: "Authentication failed", details: userError.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user) {
      console.error("No user found");
      return new Response(JSON.stringify({ error: "Unauthorized - no user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("User authenticated:", user.id);

    // Use both scopes for complete access
    const scopes = "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/buy.browse.readonly";
    const state = b64url(`${user.id}:${Date.now()}`);
    
    console.log("Generated state:", state);
    console.log("Using scopes:", scopes);
    console.log("Redirect URI:", EBAY_REDIRECT_RUNAME);

    const authorizeUrl = new URL("https://auth.ebay.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", EBAY_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", EBAY_REDIRECT_RUNAME);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("state", state);

    console.log("Generated authorization URL:", authorizeUrl.toString());

    return new Response(JSON.stringify({ authorizeUrl: authorizeUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ebay-oauth-start error", e);
    return new Response(JSON.stringify({ error: String(e), stack: e.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
