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
function roundEnding(val, mode) {
  // Why: retail-friendly endings; avoids cognitive overhead for the seller
  if (mode === ".99") return Math.max(0.99, Math.floor(val) + 0.99);
  return Math.round(val * 100) / 100;
}
function clamp(val, floor, ceiling) {
  let v = val;
  if (typeof floor === "number") v = Math.max(floor, v);
  if (typeof ceiling === "number") v = Math.min(ceiling, v);
  return v;
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
async function priceFromActive(token, q, condition, limit, includeShipping) {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("category_ids", "267");
  params.set("limit", String(Math.min(100, Math.max(10, limit))));
  params.set("sort", "price");
  params.set("filter", `conditions:{${condition.toUpperCase()}},buyingOptions:{FIXED_PRICE|AUCTION}`);
  const r = await fetch(`${BROWSE_SEARCH_URL}?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!r.ok) return {
    note: `Browse error: ${await r.text()}`
  };
  const data = await r.json();
  const prices = [];
  for (const it of data.itemSummaries ?? []){
    const p = parseFloat(it.price?.value ?? "NaN");
    const s = parseFloat(it.shippingOptions?.[0]?.shippingCost?.value ?? "0");
    if (isFinite(p)) prices.push(p + (includeShipping && isFinite(s) ? s : 0));
  }
  prices.sort((a, b)=>a - b);
  if (!prices.length) return {
    note: "No active results"
  };
  const avg = prices.reduce((a, b)=>a + b, 0) / prices.length;
  const med = quantile(prices, 0.5);
  const analytics = {
    min: +prices[0].toFixed(2),
    max: +prices[prices.length - 1].toFixed(2),
    average: +avg.toFixed(2),
    median: +med.toFixed(2),
    P10: +quantile(prices, 0.10).toFixed(2),
    P25: +quantile(prices, 0.25).toFixed(2),
    P50: +quantile(prices, 0.50).toFixed(2),
    P75: +quantile(prices, 0.75).toFixed(2),
    P90: +quantile(prices, 0.90).toFixed(2)
  };
  const suggested = quantile(prices, 0.40); // conservative to move inventory
  return {
    analytics,
    price: +suggested.toFixed(2)
  };
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: corsHeaders
  });
  try {
    const body = await req.json();
    if (!Array.isArray(body.items) || !body.items.length) {
      return new Response(JSON.stringify({
        error: "items required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const cfg = body.config ?? {};
    const includeShipping = !!cfg.includeShipping;
    const limit = Math.min(100, Math.max(10, cfg.limitPerItem ?? 50));
    let token = "";
    if ([
      "ACTIVE_LISTINGS",
      "MIN_OF"
    ].includes(body.strategy)) token = await getAppToken();
    const results = [];
    for(let i = 0; i < body.items.length; i++){
      const item = body.items[i];
      const q = (item.isbn || item.issn || item.title || "").toString().trim();
      const condition = item.condition ?? "Used";
      const links = {
        soldComps: soldCompsLink(q || "book"),
        activeSearch: activeSearchLink(q || "book")
      };
      let activePrice;
      let analytics;
      const notes: string[] = [];
      if (token && (body.strategy === "ACTIVE_LISTINGS" || body.strategy === "MIN_OF")) {
        const r = await priceFromActive(token, q, condition, limit, includeShipping);
        if (typeof r.price === "number") activePrice = r.price;
        if (r.analytics) analytics = r.analytics;
        if (r.note) notes.push(r.note);
      }
      let coverPriceBased;
      if ((body.strategy === "COVER_MULTIPLIER" || body.strategy === "MIN_OF") && typeof item.coverPrice === "number" && typeof cfg.multiplier === "number") {
        coverPriceBased = item.coverPrice * cfg.multiplier;
      }
      let flatBased;
      if ((body.strategy === "FLAT" || body.strategy === "MIN_OF") && typeof cfg.flat === "number") {
        flatBased = cfg.flat;
      }
      const candidates = [
        activePrice,
        coverPriceBased,
        flatBased
      ].filter((n)=>typeof n === "number" && isFinite(n));
      let chosen = 7.99; // safe fallback for books/mags
      let source = "FALLBACK";
      if (body.strategy === "ACTIVE_LISTINGS" && typeof activePrice === "number") {
        chosen = activePrice;
        source = "ACTIVE_LISTINGS";
      } else if (body.strategy === "COVER_MULTIPLIER" && typeof coverPriceBased === "number") {
        chosen = coverPriceBased;
        source = "COVER_MULTIPLIER";
      } else if (body.strategy === "FLAT" && typeof flatBased === "number") {
        chosen = flatBased;
        source = "FLAT";
      } else if (body.strategy === "MIN_OF" && candidates.length) {
        chosen = Math.min(...candidates);
        source = "MIN_OF";
      }
      chosen = clamp(chosen, cfg.floor, cfg.ceiling);
      chosen = roundEnding(chosen, cfg.rounding ?? ".99");
      results.push({
        index: i,
        input: item,
        price: +chosen.toFixed(2),
        source,
        analytics,
        links,
        note: notes.join(" | ") || undefined
      });
    }
    return new Response(JSON.stringify({
      results,
      meta: {
        strategyUsed: body.strategy,
        env: "prod"
      }
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
