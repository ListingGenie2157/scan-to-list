// /browse_actives/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EBAY_BASE = "https://api.ebay.com";
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json"
    }
  });
}
function norm(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function quantiles(nums) {
  nums = nums.filter((n)=>Number.isFinite(n)).sort((a, b)=>a - b);
  if (!nums.length) return {
    p25: null,
    p50: null,
    p75: null,
    min: null,
    max: null,
    count: 0
  };
  const q = (p)=>{
    const idx = (nums.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (idx - lo);
  };
  return {
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    min: nums[0],
    max: nums[nums.length - 1],
    count: nums.length
  };
}
async function ebaySearchActives(token, q, opts) {
  const params = new URLSearchParams({
    q,
    limit: "100",
    sort: "price",
    offset: "0"
  });
  const filter = [];
  filter.push("priceCurrency:USD");
  filter.push("itemLocationCountry:US");
  if (opts.conditionIds) filter.push(`conditionIds:{${opts.conditionIds}}`);
  if (opts.cat) params.set("category_ids", opts.cat);
  params.set("filter", filter.join(","));
  const url = `${EBAY_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`;
  const r = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Accept": "application/json"
    }
  });
  if (r.status === 401 || r.status === 403) throw new Error(`EBAY_AUTH_${r.status}`);
  if (!r.ok) throw new Error(`EBAY_${r.status}`);
  return await r.json();
}
async function getUserToken(supabase, userId) {
  const { data, error } = await supabase.from("ebay_tokens").select("*").eq("user_id", userId).single();
  if (error || !data) throw new Error("NO_TOKEN");
  const now = Date.now();
  if (new Date(data.access_expires_at).getTime() - now < 60_000) {
    // refresh
    const rt = data.refresh_token;
    const id = Deno.env.get("EBAY_CLIENT_ID");
    const secret = Deno.env.get("EBAY_CLIENT_SECRET");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: rt,
      scope: "https://api.ebay.com/oauth/api_scope/buy.item.summary.readonly"
    });
    const r = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${id}:${secret}`),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!r.ok) throw new Error("REFRESH_FAIL");
    const j = await r.json();
    await supabase.from("ebay_tokens").update({
      access_token: j.access_token,
      access_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString()
    }).eq("user_id", userId);
    return j.access_token;
  }
  return data.access_token;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: cors
  });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id"); // pass your authed user id
    const qRaw = url.searchParams.get("q") || "";
    if (!userId || !qRaw) return json({
      error: "user_id and q required"
    }, 400);
    const q = norm(qRaw);
    const conditionIds = url.searchParams.get("conditionIds") || ""; // e.g., 3000 (Used), 1000 (New)
    const cat = url.searchParams.get("cat") || "";
    // simple 6h cache
    const cacheKey = `v1|${q}|${conditionIds}|${cat}`;
    const { data: cached } = await supabase.from("comps_cache_actives").select("payload,created_at").eq("cache_key", cacheKey).gte("created_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString()).maybeSingle();
    if (cached?.payload) return json(cached.payload);
    const token = await getUserToken(supabase, userId);
    const res = await ebaySearchActives(token, q, {
      conditionIds,
      cat
    });
    const rows = (res.itemSummaries ?? []).map((x)=>{
      const price = Number(x.price?.value ?? 0);
      const ship = Number(x.shippingOptions?.[0]?.shippingCost?.value ?? 0);
      return {
        id: x.itemId,
        title: x.title,
        price,
        ship,
        priceShip: price + ship,
        url: x.itemWebUrl,
        image: x.image?.imageUrl ?? null,
        buyItNow: (x.buyingOptions ?? []).includes("FIXED_PRICE")
      };
    }).filter((r)=>r.priceShip > 0);
    // Down-weight auctions for stats (keep them, but they won’t drive P50 much since sorted)
    const stats = quantiles(rows.filter((r)=>r.buyItNow).map((r)=>r.priceShip));
    const lowestBIN = rows.filter((r)=>r.buyItNow).slice(0, 1)[0] ?? null;
    const payload = {
      q,
      stats,
      lowestBIN,
      sampleCount: rows.length,
      samplePreview: rows.slice(0, 6)
    };
    await supabase.from("comps_cache_actives").upsert({
      cache_key: cacheKey,
      q,
      payload
    });
    return json(payload);
  } catch (e) {
    return json({
      error: String(e?.message ?? e)
    }, 500);
  }
}); // Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
console.info('server started');
Deno.serve(async (req)=>{
  const { name } = await req.json();
  const data = {
    message: `Hello ${name}!`
  };
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive'
    }
  });
});
