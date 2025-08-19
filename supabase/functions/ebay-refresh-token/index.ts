import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!;
const EBAY_SCOPES = Deno.env.get("EBAY_SCOPES") || "https://api.ebay.com/oauth/api_scope/sell.inventory";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate caller
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch latest token for this user
    const { data: tokens, error: tErr } = await supabase
      .from("oauth_tokens")
      .select("id, access_token, refresh_token, expires_at")
      .eq("provider", "ebay")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (tErr) return json({ error: tErr.message }, 500);

    const token = tokens?.[0];
    if (!token) return json({});

    const nowMs = Date.now();
    const expMs = token.expires_at ? new Date(token.expires_at).getTime() : 0;
    let accessToken = token.access_token as string | null;

    // Refresh if missing or expiring soon
    if (!accessToken || expMs - nowMs < 60_000) {
      if (!token.refresh_token) return json({});

      const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        scope: EBAY_SCOPES,
      });

      const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const j = await resp.json();
      if (!resp.ok) return json({ error: "refresh_failed", details: j }, 500);

      accessToken = j.access_token as string;
      const newExpires = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();
      await supabase
        .from("oauth_tokens")
        .update({ access_token: accessToken, expires_at: newExpires, refresh_token: j.refresh_token ?? token.refresh_token })
        .eq("id", token.id);
    }

    return json({ access_token: accessToken });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

