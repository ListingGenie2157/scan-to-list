import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
// PROD ONLY endpoints
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") ?? "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") ?? "";
const EBAY_APP_SCOPE = Deno.env.get("EBAY_APP_SCOPE") ?? "https://api.ebay.com/oauth/api_scope";
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}
function soldCompsLink(q) {
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", q);
  u.searchParams.set("LH_Sold", "1");
  u.searchParams.set("LH_Complete", "1");
  return u.toString();
}
function activeSearchLink(q) {
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", q);
  u.searchParams.set("rt", "nc");
  return u.toString();
}
async function getAppToken() {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", EBAY_APP_SCOPE);
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!resp.ok) throw new Error(`App token failed: ${await resp.text()}`);
  const j = await resp.json();
  return j.access_token;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: corsHeaders
  });
  try {
    const { isbn, query, condition, limit, includeShipping } = await req.json().catch(()=>({}));
    const q = (isbn || query || "").toString().trim();
    if (!q) {
      return new Response(JSON.stringify({
        error: "isbn or query required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const token = await getAppToken();
    const params = new URLSearchParams();
    params.set("q", q);
    params.set("category_ids", "267");
    params.set("limit", String(Math.min(100, Math.max(10, Number(limit ?? 50)))));
    params.set("sort", "price");
    params.set("filter", `conditions:{${String(condition ?? "Used").toUpperCase()}},buyingOptions:{FIXED_PRICE|AUCTION}`);
    const resp = await fetch(`${BROWSE_SEARCH_URL}?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({
        error: "Browse search failed",
        detail: await resp.text()
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const data = await resp.json();
    const prices = [];
    for (const it of data.itemSummaries ?? []){
      const p = parseFloat(it.price?.value ?? "NaN");
      const s = parseFloat(it.shippingOptions?.[0]?.shippingCost?.value ?? "0");
      if (isFinite(p)) prices.push(p + (includeShipping && isFinite(s) ? s : 0));
    }
    prices.sort((a, b)=>a - b);
    if (!prices.length) {
      return new Response(JSON.stringify({
        count: 0,
        analytics: null,
        suggestedPrice: 7.99,
        links: {
          soldComps: soldCompsLink(q),
          activeSearch: activeSearchLink(q)
        },
        env: "prod"
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const avg = prices.reduce((a, b)=>a + b, 0) / prices.length;
    const med = quantile(prices, 0.5);
    const p10 = quantile(prices, 0.10);
    const p25 = quantile(prices, 0.25);
    const p50 = quantile(prices, 0.50);
    const p75 = quantile(prices, 0.75);
    const p90 = quantile(prices, 0.90);
    const suggested = quantile(prices, 0.40);
    return new Response(JSON.stringify({
      count: prices.length,
      analytics: {
        average: +avg.toFixed(2),
        median: +med.toFixed(2),
        min: +prices[0].toFixed(2),
        max: +prices[prices.length - 1].toFixed(2),
        P10: +p10.toFixed(2),
        P25: +p25.toFixed(2),
        P50: +p50.toFixed(2),
        P75: +p75.toFixed(2),
        P90: +p90.toFixed(2)
      },
      suggestedPrice: +suggested.toFixed(2),
      links: {
        soldComps: soldCompsLink(q),
        activeSearch: activeSearchLink(q)
      },
      env: "prod"
    }), {
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
