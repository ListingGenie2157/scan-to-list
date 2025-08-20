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
