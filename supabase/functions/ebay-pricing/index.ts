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
// eBay Finding API uses the App ID (Client ID)
const EBAY_APP_ID = Deno.env.get("EBAY_CLIENT_ID") || Deno.env.get("EBAY_APP_ID") || "";

type PricingRequest = {
  isbn?: string;
  query?: string;
  soldOnly?: boolean;        // if true, only sold comps (EndedWithSales). Default: false (all completed)
  pages?: number;            // number of pages to fetch (1-3). Default: 2
  entriesPerPage?: number;   // 1-100 per page. Default: 100
  conditionIds?: number[];   // eBay condition IDs to filter
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (!n) return null;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  const a = sorted[n / 2 - 1];
  const b = sorted[n / 2];
  return (a + b) / 2;
}

function percentile(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (!n) return null;
  const idx = Math.floor((n - 1) * p);
  return sorted[idx];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EBAY_APP_ID) {
      const missing: string[] = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
      if (!EBAY_APP_ID) missing.push("EBAY_CLIENT_ID/EBAY_APP_ID");
      return json({ error: "Server configuration error", missing }, 500);
    }

    // Require signed-in user (aligns with verify_jwt = true)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as PricingRequest;
    const isbn = (body.isbn || "").toString().trim();
    const query = (body.query || "").toString().trim();
    const soldOnly = body.soldOnly ?? false; // default: completed (sold + unsold)
    const pages = Math.max(1, Math.min(3, body.pages ?? 2));
    const entriesPerPage = Math.max(1, Math.min(100, body.entriesPerPage ?? 100));
    const conditionIds = Array.isArray(body.conditionIds) ? body.conditionIds.slice(0, 10) : [];

    if (!isbn && !query) return json({ error: "Provide isbn or query" }, 400);

    // Build base params for Finding API findCompletedItems
    const baseParams = new URLSearchParams({
      "OPERATION-NAME": "findCompletedItems",
      "SERVICE-VERSION": "1.13.0",
      "SECURITY-APPNAME": EBAY_APP_ID,
      "RESPONSE-DATA-FORMAT": "JSON",
      "REST-PAYLOAD": "true",
      "paginationInput.entriesPerPage": String(entriesPerPage),
      "sortOrder": "EndTimeSoonest",
    });

    // Keywords: prefer ISBN if present, else query
    if (isbn) {
      baseParams.set("keywords", isbn);
      // Also attempt explicit ISBN filter when supported
      baseParams.set("itemFilter(0).name", "ISBN");
      baseParams.set("itemFilter(0).value", isbn);
    } else {
      baseParams.set("keywords", query);
    }

    let filterIndex = isbn ? 1 : 0;
    // Country filter for US marketplace
    baseParams.set(`itemFilter(${filterIndex}).name`, "LocatedIn");
    baseParams.set(`itemFilter(${filterIndex}).value`, "US");
    filterIndex++;

    // Optional condition filters
    if (conditionIds.length) {
      baseParams.set(`itemFilter(${filterIndex}).name`, "Condition");
      conditionIds.forEach((cid, i) => {
        baseParams.set(`itemFilter(${filterIndex}).value(${i})`, String(cid));
      });
      filterIndex++;
    }

    // Sold-only filter when requested
    if (soldOnly) {
      baseParams.set(`itemFilter(${filterIndex}).name`, "SoldItemsOnly");
      baseParams.set(`itemFilter(${filterIndex}).value`, "true");
      filterIndex++;
    }

    // Accumulate up to N pages for better pricing
    const endpoint = "https://svcs.ebay.com/services/search/FindingService/v1";
    const allItems: any[] = [];

    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams(baseParams);
      params.set("paginationInput.pageNumber", String(page));
      const url = `${endpoint}?${params.toString()}`;

      const resp = await fetch(url, {
        method: "GET",
        headers: { "X-EBAY-SOA-GLOBAL-ID": "EBAY-US" },
      });
      const jsonResp = await resp.json();

      const searchResult = jsonResp?.findCompletedItemsResponse?.[0]?.searchResult?.[0];
      const items = (searchResult?.item ?? []) as any[];
      allItems.push(...items);

      // Stop early if no items returned
      if (!items.length) break;
    }

    // Map and filter items
    const mapped = allItems.map((item) => {
      const selling = item?.sellingStatus?.[0] ?? {};
      const state: string | undefined = selling?.sellingState?.[0];
      const priceStr: string | undefined = (selling?.currentPrice?.[0]?.__value__ ?? selling?.convertedCurrentPrice?.[0]?.__value__);
      const price = priceStr ? Number(priceStr) : NaN;

      return {
        title: item?.title?.[0] ?? null,
        price,
        currency: selling?.currentPrice?.[0]?.['@currencyId'] ?? selling?.convertedCurrentPrice?.[0]?.['@currencyId'] ?? null,
        sellingState: state ?? null, // EndedWithSales | EndedWithoutSales
        conditionId: item?.condition?.[0]?.conditionId?.[0] ?? null,
        conditionName: item?.condition?.[0]?.conditionDisplayName?.[0] ?? null,
        viewItemUrl: item?.viewItemURL?.[0] ?? null,
        image: item?.galleryURL?.[0] ?? null,
        listingType: item?.listingInfo?.[0]?.listingType?.[0] ?? null,
        categoryName: item?.primaryCategory?.[0]?.categoryName?.[0] ?? null,
      };
    });

    // Filter invalid
    const completed = mapped.filter((m) => Number.isFinite(m.price) && m.price > 0);
    const soldFiltered = soldOnly
      ? completed.filter((m) => m.sellingState === "EndedWithSales")
      : completed; // include both sold and unsold

    // Extract prices and sort
    const prices = soldFiltered.map((m) => m.price).sort((a, b) => a - b);

    // Compute quartiles and IQR for outlier removal
    const q1 = percentile(prices, 0.25);
    const q3 = percentile(prices, 0.75);
    const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
    const lowerFence = iqr !== null && q1 !== null ? q1 - 1.5 * iqr : null;
    const upperFence = iqr !== null && q3 !== null ? q3 + 1.5 * iqr : null;

    const trimmed = (lowerFence !== null && upperFence !== null)
      ? prices.filter((p) => p >= lowerFence && p <= upperFence)
      : prices.slice();

    const stats = {
      count: prices.length,
      median: median(prices),
      average: prices.length ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)) : null,
      min: prices.length ? prices[0] : null,
      max: prices.length ? prices[prices.length - 1] : null,
      q1,
      q3,
      iqr,
      trimmed: {
        count: trimmed.length,
        median: median(trimmed),
        average: trimmed.length ? Number((trimmed.reduce((a, b) => a + b, 0) / trimmed.length).toFixed(2)) : null,
        min: trimmed.length ? trimmed[0] : null,
        max: trimmed.length ? trimmed[trimmed.length - 1] : null,
      },
    };

    // Suggest trimmed median when available, else raw median
    const suggestedPrice = (stats.trimmed.median ?? stats.median) ?? null;

    // Limit items for payload size
    const items = soldFiltered.slice(0, 100).map((m) => ({
      title: m.title,
      price: m.price,
      currency: m.currency,
      condition: m.conditionName ?? m.conditionId,
      sellingState: m.sellingState,
      itemWebUrl: m.viewItemUrl,
      image: m.image,
      listingType: m.listingType,
      category: m.categoryName,
    }));

    return json({
      suggestedPrice,
      analytics: stats,
      items,
      basis: soldOnly ? "completed_sold_only" : "completed_all",
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
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
    console.log("eBay pricing function called");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log("User lookup result:", { user: user?.id, error: userError });
    
    if (!user) {
      console.log("No user found - unauthorized");
      return json({ error: "Unauthorized" }, 401);
    }

    const requestBody = await req.json().catch((e) => {
      console.log("JSON parse error:", e);
      return { isbn: undefined, query: undefined };
    });
    
    const { isbn, query } = requestBody;
    console.log("Request parameters:", { isbn, query });
    
    if (!isbn && !query) {
      console.log("Missing required parameters");
      return json({ error: "Provide isbn or query" }, 400);
    }

    // Get latest ebay token
    console.log("Looking up eBay tokens for user:", user.id);
    const { data: tokens, error: tErr } = await supabase
      .from("oauth_tokens")
      .select("id, access_token, refresh_token, expires_at")
      .eq("provider", "ebay")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    console.log("Token lookup result:", { tokens: tokens?.length, error: tErr });
    if (tErr) {
      console.log("Token lookup error:", tErr);
      return json({ error: tErr.message }, 500);
    }
    
    const token = tokens?.[0];
    if (!token) {
      console.log("No eBay token found for user");
      return json({ error: "Connect eBay first" }, 401);
    }
    
    console.log("Found token, checking expiry...", { 
      hasAccessToken: !!token.access_token, 
      hasRefreshToken: !!token.refresh_token,
      expiresAt: token.expires_at 
    });

    const exp = token.expires_at ? new Date(token.expires_at).getTime() : 0;
    let accessToken = token.access_token as string;

    if (!accessToken || exp - Date.now() < 60_000) {
      // refresh
      console.log("Token needs refresh");
      if (!token.refresh_token) {
        console.log("No refresh token available");
        return json({ error: "Token expired and no refresh token available" }, 401);
      }
      
      console.log("Refreshing eBay token...");
      const basic = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/buy.browse.readonly",
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
      console.log("Token refresh response:", { ok: resp.ok, status: resp.status });
      
      if (!resp.ok) {
        console.log("Token refresh failed:", j);
        return json({ error: "Refresh failed", details: j }, 401);
      }

      accessToken = j.access_token;
      const newExpires = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();

      console.log("Updating token in database...");
      await supabase
        .from("oauth_tokens")
        .update({ access_token: accessToken, expires_at: newExpires, refresh_token: j.refresh_token ?? token.refresh_token })
        .eq("id", token.id);
    }

    console.log("Building eBay API request...");
    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("limit", "50"); // More results for better pricing data
    
    // Filter for COMPLETED items (sold + unsold but ended)
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    url.searchParams.set("filter", `buyingOptions:{FIXED_PRICE|AUCTION},deliveryCountry:US,itemLocationCountry:US,conditionIds:{1000|1500|2000|2500|3000|4000|5000|6000},itemEndDate:[${lastYear}-01-01T00:00:00.000Z..${currentYear}-12-31T23:59:59.999Z]`);
    
    if (isbn) {
      url.searchParams.set("filter", url.searchParams.get("filter") + `,gtin:${isbn}`);
    } else if (query) {
      url.searchParams.set("q", query);
    }
    
    console.log("Final eBay API URL:", url.toString());
    
    // Add completed listings filter using itemEndDate for past listings
    // Note: eBay Browse API limitations - for true sold data we'd need Finding API or Shopping API
    // This approach gets recently ended listings which includes sold items

    console.log("Making eBay API request...");
    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    console.log("eBay API response:", { ok: resp.ok, status: resp.status });
    const data = await resp.json();
    
    if (!resp.ok) {
      console.log("eBay API error:", data);
      return json({ error: "Browse error", details: data }, 500);
    }

    const items = (data.itemSummaries || []) as any[];
    
    // Extract pricing data with more details - filter for actually sold items when available
    const validItems = items.filter(item => {
      const hasPrice = item?.price?.value && parseFloat(item.price.value) > 0;
      // Additional filter for sold state if available in the response
      const isSoldOrCompleted = !item.sellingState || item.sellingState === 'ENDED' || item.sellingState === 'COMPLETED';
      return hasPrice && isSoldOrCompleted;
    });
    const prices = validItems
      .map(item => parseFloat(item.price.value))
      .sort((a, b) => a - b);
    
    // Calculate comprehensive pricing analytics
    const analytics = {
      count: prices.length,
      median: prices.length ? prices[Math.floor(prices.length / 2)] : null,
      average: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      range: prices.length ? Math.max(...prices) - Math.min(...prices) : null,
      // Price distribution
      q1: prices.length ? prices[Math.floor(prices.length * 0.25)] : null,
      q3: prices.length ? prices[Math.floor(prices.length * 0.75)] : null,
    };
    
    // Enhanced item data for UI
    const processedItems = validItems.map(item => ({
      title: item.title,
      price: parseFloat(item.price.value),
      currency: item.price.currency,
      condition: item.condition,
      sellingState: item.sellingState,
      listingMarketplaceId: item.listingMarketplaceId,
      itemWebUrl: item.itemWebUrl,
      image: item.image?.imageUrl,
      seller: item.seller?.username,
      categories: item.categories?.map((c: any) => c.categoryName),
    }));

    return json({ 
      suggestedPrice: analytics.median, // Use median as primary suggestion
      analytics,
      items: processedItems,
      confidence: prices.length >= 3 ? 'high' : prices.length >= 1 ? 'medium' : 'low'
    });
  } catch (e) {
    console.error("ebay-pricing error", e);
    return json({ error: String(e) }, 500);
  }
});
