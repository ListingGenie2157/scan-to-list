import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || "";
const EBAY_SCOPES =
  Deno.env.get("EBAY_SCOPES") ||
  "https://api.ebay.com/oauth/api_scope/sell.inventory";

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EBAY_CLIENT_ID) {
      const missing: string[] = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      return new Response(JSON.stringify({ error: "Server configuration error", missing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional returnUrl
    let returnUrl = "";
    try {
      const body = await req.json();
      if (body && typeof body.returnUrl === "string" && /^https?:\/\//.test(body.returnUrl)) {
        returnUrl = body.returnUrl;
      }
    } catch {
      // ignore
    }

    // Use direct Supabase callback (must match in callback function)
    const callbackUrl = new URL("/functions/v1/ebay-oauth-callback", SUPABASE_URL).toString();

    // Encode state with user + optional return URL
    const statePayload = JSON.stringify({ u: user.id, r: returnUrl || null, t: Date.now() });
    const state = b64url(statePayload);

    const authorizeUrl = new URL("https://auth.ebay.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", EBAY_CLIENT_ID);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
    authorizeUrl.searchParams.set("scope", EBAY_SCOPES);
    authorizeUrl.searchParams.set("state", state);

    return new Response(JSON.stringify({ authorizeUrl: authorizeUrl.toString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
supabase/functions/ebay-oauth-callback/index.ts
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") || "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || ""; // optional safety fallback

function b64urlToStr(input: string): string {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return atob(input);
}

function addParam(urlStr: string, key: string, value: string) {
  const u = new URL(urlStr);
  u.searchParams.set(key, value);
  return u.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
      const missing: string[] = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      if (!EBAY_CLIENT_ID) missing.push("EBAY_CLIENT_ID");
      if (!EBAY_CLIENT_SECRET) missing.push("EBAY_CLIENT_SECRET");
      return new Response(JSON.stringify({ error: "Server configuration error", missing }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);

    // eBay error short-circuit
    const err = url.searchParams.get("error");
    if (err) {
      const desc = url.searchParams.get("error_description") || err;
      // Try to decode state for returnUrl
      let target = "";
      const state = url.searchParams.get("state");
      if (state) {
        try {
          const decoded = JSON.parse(b64urlToStr(state));
          if (decoded?.r && /^https?:\/\//.test(decoded.r)) {
            target = decoded.r;
          }
        } catch {
          // ignore
        }
      }
      if (!target) {
        const referer = req.headers.get("referer");
        target = referer ? new URL(referer).origin + "/" : (APP_ORIGIN ? APP_ORIGIN + "/" : "/");
      }
      const redirect = addParam(target, "ebay", "error") + `&message=${encodeURIComponent(desc)}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirect } });
    }

    // Success path
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response("Missing authorization code or state", { status: 400, headers: corsHeaders });
    }

    // Decode state (JSON { u, r, t } or legacy "userId:timestamp")
    let userId = "";
    let returnUrl = "";
    try {
      const decodedStr = b64urlToStr(state);
      try {
        const parsed = JSON.parse(decodedStr);
        userId = parsed?.u || "";
        if (parsed?.r && /^https?:\/\//.test(parsed.r)) {
          returnUrl = parsed.r;
        }
      } catch {
        // legacy
        userId = decodedStr.split(":")[0] || "";
      }
    } catch {
      return new Response("Invalid state parameter", { status: 400, headers: corsHeaders });
    }
    if (!userId) {
      return new Response("Invalid state (no user)", { status: 400, headers: corsHeaders });
    }

    // Fallback return target if none provided
    if (!returnUrl) {
      const referer = req.headers.get("referer");
      const origin = referer ? new URL(referer).origin : (APP_ORIGIN || "");
      returnUrl = origin ? origin + "/" : "/";
    }

    // MUST match start function redirect_uri
    const callbackUrl = new URL("/functions/v1/ebay-oauth-callback", SUPABASE_URL).toString();

    // Exchange code for token
    const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
    });
    const tokenResp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const tokenJson = await tokenResp.json();

    if (!tokenResp.ok) {
      const redirect = addParam(returnUrl, "ebay", "error") + `&message=${encodeURIComponent("Token exchange failed")}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirect } });
    }

    const access_token: string = tokenJson.access_token;
    const refresh_token: string | undefined = tokenJson.refresh_token;
    const expires_in: number = tokenJson.expires_in ?? 0;
    const expires_at = new Date(Date.now() + Math.max(0, expires_in - 60) * 1000).toISOString();

    // Store tokens
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: dbError } = await supabase
      .from("oauth_tokens")
      .upsert(
        {
          provider: "ebay",
          access_token,
          refresh_token: refresh_token ?? null,
          user_id: userId,
          scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
          expires_at,
        },
        { onConflict: "user_id,provider" },
      );

    if (dbError) {
      const redirect = addParam(returnUrl, "ebay", "error") + `&message=${encodeURIComponent("Failed to store tokens")}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirect } });
    }

    // Success
    const success = addParam(returnUrl, "ebay", "connected");
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: success } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});