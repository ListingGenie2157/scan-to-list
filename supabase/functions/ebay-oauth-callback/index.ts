import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") || "";
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME") || "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || ""; // Your frontend URL
const EBAY_SCOPES = Deno.env.get("EBAY_SCOPES") || "https://api.ebay.com/oauth/api_scope/sell.inventory";

function b64urlToStr(input: string): string {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return atob(input);
}

// Fixed version that properly handles multiple params
function buildRedirectUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

// Simple redirect validation (add more origins as needed)
function isValidRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    // Only allow http(s) protocols
    if (!["http:", "https:"].includes(u.protocol)) return false;
    // Add your allowed domains here
    const allowedHosts = [
      "localhost",
      "lovable.dev",
      // Add your production domain
    ];
    return allowedHosts.some(host => u.hostname.includes(host));
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Check configuration
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
      const missing: string[] = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      if (!EBAY_CLIENT_SECRET) missing.push("EBAY_CLIENT_SECRET");
      
      return new Response(JSON.stringify({ error: "Server configuration error", missing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const url = new URL(req.url);
    
    // Handle eBay error
    const error = url.searchParams.get("error");
    if (error) {
      const errorDesc = url.searchParams.get("error_description") || error;
      
      // Try to get return URL from state
      let target = "";
      const state = url.searchParams.get("state");
      if (state) {
        try {
          const decoded = JSON.parse(b64urlToStr(state));
          if (decoded?.r && isValidRedirect(decoded.r)) {
            target = decoded.r;
          }
        } catch {
          // Invalid state, ignore
        }
      }
      
      // Fallback to referer or APP_ORIGIN
      if (!target) {
        const referer = req.headers.get("referer");
        if (referer && isValidRedirect(referer)) {
          target = new URL(referer).origin + "/";
        } else if (APP_ORIGIN) {
          target = APP_ORIGIN + "/";
        } else {
          target = "/";
        }
      }
      
      const redirect = buildRedirectUrl(target, {
        ebay: "error",
        message: errorDesc
      });
      
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: redirect }
      });
    }

    // Success path
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    
    if (!code || !state) {
      return new Response("Missing authorization code or state", {
        status: 400,
        headers: corsHeaders
      });
    }

    // Decode state
    let userId = "";
    let returnUrl = "";
    
    try {
      const decodedStr = b64urlToStr(state);
      const parsed = JSON.parse(decodedStr);
      userId = parsed?.u || "";
      
      if (parsed?.r && isValidRedirect(parsed.r)) {
        returnUrl = parsed.r;
      }
      
      // Check timestamp (optional security)
      if (parsed?.t) {
        const age = Date.now() - parsed.t;
        if (age > 10 * 60 * 1000) { // 10 minutes
          console.warn("State expired:", age, "ms old");
        }
      }
    } catch {
      return new Response("Invalid state parameter", {
        status: 400,
        headers: corsHeaders
      });
    }

    if (!userId) {
      return new Response("Invalid state (no user)", {
        status: 400,
        headers: corsHeaders
      });
    }

    // Fallback return URL
    if (!returnUrl) {
      const referer = req.headers.get("referer");
      if (referer && isValidRedirect(referer)) {
        returnUrl = new URL(referer).origin + "/";
      } else if (APP_ORIGIN) {
        returnUrl = APP_ORIGIN + "/";
      } else {
        returnUrl = "/";
      }
    }

    // MUST match oauth-start redirect_uri exactly (RUName preferred)
    const callbackUrl = new URL("/functions/v1/ebay-oauth-callback", SUPABASE_URL).toString();
    const redirectForToken = EBAY_REDIRECT_RUNAME || callbackUrl;

    // Exchange code for tokens
    const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl
    });

    const tokenResp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectForToken,
      }).toString()
    });

    const tokenJson = await tokenResp.json();
    
    if (!tokenResp.ok) {
      console.error("Token exchange failed:", tokenJson);
      const redirect = buildRedirectUrl(returnUrl, {
        ebay: "error",
        message: "Token exchange failed"
      });
      
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: redirect }
      });
    }

    const access_token = tokenJson.access_token;
    const refresh_token = tokenJson.refresh_token;
    const expires_in = tokenJson.expires_in || 7200;
    const expires_at = new Date(Date.now() + Math.max(0, expires_in - 60) * 1000).toISOString();

    // Store tokens
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: dbError } = await supabase
      .from("oauth_tokens")
      .upsert({
        provider: "ebay",
        access_token,
        refresh_token: refresh_token || null,
        user_id: userId,
        scope: EBAY_SCOPES, // Use the same scope that was requested
        expires_at
      }, {
        onConflict: "user_id,provider"
      });

    if (dbError) {
      console.error("Failed to store tokens:", dbError);
      const redirect = buildRedirectUrl(returnUrl, {
        ebay: "error",
        message: "Failed to store credentials"
      });
      
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: redirect }
      });
    }

    // Success!
    console.log("Successfully stored tokens for user:", userId);
    const successRedirect = buildRedirectUrl(returnUrl, {
      ebay: "connected"
    });
    
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: successRedirect }
    });
    
  } catch (e) {
    console.error("Unexpected error in callback:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
