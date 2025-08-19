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
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME") ?? "";

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

    const stateDecoded = b64urlToStr(state);
    let userId = "";
    let returnTo: string | null = null;
    try {
      const parsed = JSON.parse(stateDecoded);
      userId = parsed.u || "";
      returnTo = parsed.r || null;
    } catch {
      // Backward compatibility with old state format
      userId = stateDecoded.split(":")[0];
    }
    if (!userId) {
      return new Response("Invalid state", { status: 400, headers: corsHeaders });
    }

    const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);

    // The redirect_uri used here MUST match what was sent in the authorize step.
    const directCallbackUrl = `https://yfynlpwzrxoxcwntigjv.supabase.co/functions/v1/ebay-oauth-callback`;
    const redirectForToken = EBAY_REDIRECT_RUNAME || directCallbackUrl;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectForToken,
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

    const expires_at = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase.from("oauth_tokens").upsert({
      provider: "ebay",
      access_token,
      refresh_token: refresh_token ?? null,
      user_id: userId,
      scope: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.browse.readonly",
      expires_at,
    }, {
      onConflict: 'user_id,provider'
    });

    if (error) {
      console.error("Failed to store tokens", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get the origin from the referer header or use a fallback
    const referer = req.headers.get("referer");
    const origin = referer ? new URL(referer).origin : "https://id-preview--8df2d048-f9db-4afe-90c6-9827cababee3.lovable.app";
    const redirectTo = returnTo || url.searchParams.get("redirect_to") || `${origin}/?ebay=connected`;
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectTo } });
  } catch (e) {
    console.error("ebay-oauth-callback error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
