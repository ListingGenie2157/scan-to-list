import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!;
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME")!;

function b64urlToStr(input: string) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return atob(input);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const err = url.searchParams.get("error");
    if (err) {
      const message = url.searchParams.get("error_description") || err;
      return new Response(`Authorization failed: ${message}`, { status: 400, headers: corsHeaders });
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
    }

    // Support both legacy colon-delimited and JSON state
    const stateDecoded = b64urlToStr(state);
    let userId = "";
    let returnUrl: string | null = null;
    try {
      const parsed = JSON.parse(stateDecoded);
      userId = parsed.userId || "";
      returnUrl = parsed.returnUrl || null;
    } catch {
      userId = stateDecoded.split(":")[0];
    }
    if (!userId) {
      return new Response("Invalid state", { status: 400, headers: corsHeaders });
    }

    const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      // Must match exactly the RuName registered for the app and used in the authorize call
      redirect_uri: EBAY_REDIRECT_RUNAME,
    });

    const tokenResp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      console.error("Token exchange failed", tokenJson);
      return new Response(JSON.stringify(tokenJson), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const access_token: string = tokenJson.access_token;
    const refresh_token: string | undefined = tokenJson.refresh_token;
    const expires_in: number = tokenJson.expires_in;
    const returned_scope: string = Array.isArray(tokenJson.scope) ? tokenJson.scope.join(" ") : (tokenJson.scope || "");

    const expires_at = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase.from("oauth_tokens").upsert({
      provider: "ebay",
      access_token,
      refresh_token: refresh_token ?? null,
      user_id: userId,
      scope: returned_scope,
      expires_at,
    }, {
      onConflict: 'user_id,provider'
    });

    if (error) {
      console.error("Failed to store tokens", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Redirect back to app
    const referer = req.headers.get("referer");
    const origin = referer ? new URL(referer).origin : undefined;
    const fallback = origin ? `${origin}/?ebay=connected` : `/?ebay=connected`;
    const redirectTo = url.searchParams.get("redirect_to") || returnUrl || fallback;
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectTo } });
  } catch (e) {
    console.error("ebay-oauth-callback error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
