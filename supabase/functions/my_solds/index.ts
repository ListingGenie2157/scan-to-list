import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0?target=deno&dts";
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
function quantiles(nums) {
  nums = nums.filter(Number.isFinite).sort((a, b)=>a - b);
  if (!nums.length) return {
    p25: null,
    p50: null,
    p75: null,
    count: 0
  };
  const q = (p)=>{
    const i = (nums.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (i - lo);
  };
  return {
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    count: nums.length
  };
}
async function getToken(supabase, userId, scope) {
  const { data, error } = await supabase.from("ebay_tokens").select("*").eq("user_id", userId).single();
  if (error || !data) throw new Error("NO_TOKEN");
  const exp = new Date(data.access_expires_at).getTime();
  if (exp - Date.now() < 60000) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      scope
    });
    const r = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${Deno.env.get("EBAY_CLIENT_ID")}:${Deno.env.get("EBAY_CLIENT_SECRET")}`),
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
async function fetchOrders(token, startISO) {
  const out = [];
  let offset = 0;
  while(true){
    const u = new URL(`${EBAY_BASE}/sell/fulfillment/v1/order`);
    u.searchParams.set("limit", "200");
    u.searchParams.set("offset", String(offset));
    const endISO = new Date().toISOString().slice(0, 19) + "Z";
    u.searchParams.set("filter", `creationdate:[${startISO}..${endISO}],orderfulfillmentstatus:{FULFILLED|SHIPPED|DELIVERED}`);
    const r = await fetch(u.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    });
    if (!r.ok) throw new Error(`FULFILL_${r.status}`);
    const j = await r.json();
    out.push(...j.orders ?? []);
    if (!j.next) break;
    offset += 200;
    if (offset > 2000) break;
  }
  return out;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers: cors
  });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const days = Number(url.searchParams.get("days") ?? "365");
    if (!userId) return json({
      error: "user_id required"
    }, 400);
    const scope = "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly";
    const token = await getToken(supabase, userId, scope);
    const start = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 19) + "Z";
    const orders = await fetchOrders(token, start);
    const prices = [];
    for (const o of orders)for (const li of o.lineItems ?? []){
      const v = Number(li.lineItemCost?.value ?? 0);
      if (v) prices.push(v);
    }
    const stats = quantiles(prices);
    return json({
      stats,
      count: prices.length
    });
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
