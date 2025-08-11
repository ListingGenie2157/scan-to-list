import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!; // for refresh
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!; // for refresh

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { isbn, query } = await req.json().catch(() => ({ isbn: undefined, query: undefined }));
    if (!isbn && !query) return json({ error: "Provide isbn or query" }, 400);

    // Get latest ebay token
    const { data: tokens, error: tErr } = await supabase
      .from("oauth_tokens")
      .select("id, access_token, refresh_token, expires_at")
      .eq("provider", "ebay")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (tErr) return json({ error: tErr.message }, 500);
    const token = tokens?.[0];
    if (!token) return json({ error: "Connect eBay first" }, 401);

    const exp = token.expires_at ? new Date(token.expires_at).getTime() : 0;
    let accessToken = token.access_token as string;

    if (!accessToken || exp - Date.now() < 60_000) {
      // refresh
      if (!token.refresh_token) return json({ error: "Token expired and no refresh token available" }, 401);
      const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        scope: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.browse.readonly",
      });
      const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const j = await resp.json();
      if (!resp.ok) return json({ error: "Refresh failed", details: j }, 401);

      accessToken = j.access_token;
      const newExpires = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();

      await supabase
        .from("oauth_tokens")
        .update({ access_token: accessToken, expires_at: newExpires, refresh_token: j.refresh_token ?? token.refresh_token })
        .eq("id", token.id);
    }

    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("limit", "20");
    if (isbn) {
      url.searchParams.set("filter", `gtin:${isbn}`);
    } else if (query) {
      url.searchParams.set("q", query);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    const data = await resp.json();
    if (!resp.ok) return json({ error: "Browse error", details: data }, 500);

    const items = (data.itemSummaries || []) as any[];
    const prices = items
      .map((i) => parseFloat(i?.price?.value))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const mid = prices.length ? prices[Math.floor(prices.length / 2)] : null;

    return json({ suggestedPrice: mid, items });
  } catch (e) {
    console.error("ebay-pricing error", e);
    return json({ error: String(e) }, 500);
  }
});
