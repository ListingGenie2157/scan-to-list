import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME")!;

function b64url(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("Environment variables check:", {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
      EBAY_CLIENT_ID: !!EBAY_CLIENT_ID,
      EBAY_REDIRECT_RUNAME: !!EBAY_REDIRECT_RUNAME,
    });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EBAY_CLIENT_ID || !EBAY_REDIRECT_RUNAME) {
      const missing = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      if (!EBAY_REDIRECT_RUNAME) missing.push("EBAY_REDIRECT_RUNAME");
      
      console.error("Missing environment variables:", missing);
      return new Response(JSON.stringify({ error: "Server not configured", missing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scopes = [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/buy.browse.readonly",
    ].join(" ");

    const state = b64url(`${user.id}:${crypto.randomUUID()}`);

    const authorizeUrl = new URL("https://auth.ebay.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", EBAY_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", EBAY_REDIRECT_RUNAME);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ authorizeUrl: authorizeUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ebay-oauth-start error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
