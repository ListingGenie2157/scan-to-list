// Deno/Supabase Edge — no OAuth required; uses your App ID (Client ID)
const APP_ID = Deno.env.get("EBAY_CLIENT_ID") ?? ""; // eBay App ID
if (!APP_ID) throw new Error("EBAY_CLIENT_ID missing");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Req = {
  query?: string;           // keywords fallback
  upc?: string;             // preferred
  ean?: string;
  isbn?: string;
  categoryId?: string;
  condition?: "New" | "Used";
  fixedOnly?: boolean;      // default true
};

function p(num: number) { return Math.round(num * 100) / 100; }
function to99(x: number) { return Math.max(0.99, Math.floor(x) + 0.99); }

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Req;
    const {
      query = "",
      upc, ean, isbn,
      categoryId,
      condition = "Used",
      fixedOnly = true,
    } = body;

    console.log("Processing eBay comps request:", { query, upc, ean, isbn, condition });

    const url = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
    url.searchParams.set("OPERATION-NAME", "findCompletedItems");
    url.searchParams.set("SERVICE-VERSION", "1.13.0");
    url.searchParams.set("SECURITY-APPNAME", APP_ID);
    url.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
    url.searchParams.set("REST-PAYLOAD", "");
    if (categoryId) url.searchParams.set("categoryId", categoryId);
    if (upc)        { url.searchParams.set("productId.@type", "UPC");  url.searchParams.set("productId", upc); }
    else if (ean)   { url.searchParams.set("productId.@type", "EAN");  url.searchParams.set("productId", ean); }
    else if (isbn)  { url.searchParams.set("productId.@type", "ISBN"); url.searchParams.set("productId", isbn); }
    else            { url.searchParams.set("keywords", query); }

    url.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
    url.searchParams.set("itemFilter(0).value", "true");
    url.searchParams.set("itemFilter(1).name", "Condition");
    url.searchParams.set("itemFilter(1).value", condition);
    if (fixedOnly) {
      url.searchParams.set("itemFilter(2).name", "ListingType");
      url.searchParams.set("itemFilter(2).value", "FixedPrice");
    }
    url.searchParams.set("paginationInput.entriesPerPage", "100");
    url.searchParams.set("sortOrder", "EndTimeSoonest");

    console.log("Making request to eBay Finding API:", url.toString());

    const r = await fetch(url.toString(), { method: "GET" });
    if (!r.ok) {
      console.error("eBay API error:", r.status, await r.text());
      return new Response(await r.text(), { status: r.status, headers: corsHeaders });
    }

    const j = await r.json();
    const items = j?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];

    console.log(`Found ${items.length} completed items`);

    // Build price array (price + shipping), drop obvious junk
    const vals: number[] = [];
    for (const it of items) {
      const title: string = it.title?.[0] ?? "";
      if (/lot\b|bundle\b/i.test(title)) continue; // optional: skip lots
      const price = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "NaN");
      const ship  = parseFloat(
        it.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ ??
        (it.shippingInfo?.[0]?.shippingType?.[0] === "Free" ? "0" : "0")
      );
      if (!isFinite(price)) continue;
      vals.push(price + (isFinite(ship) ? ship : 0));
    }
    vals.sort((a,b)=>a-b);
    
    if (!vals.length) {
      console.log("No valid price data found");
      return new Response(JSON.stringify({ count: 0, comps: [], suggestion: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Trim outliers (IQR)
    const q = (arr:number[], q:number) => {
      const pos = (arr.length - 1) * q;
      const base = Math.floor(pos), rest = pos - base;
      return arr[base] + (arr[base+1] - arr[base] || 0) * rest;
    };
    const Q1 = q(vals, 0.25), Q3 = q(vals, 0.75), IQR = Q3 - Q1;
    const low = Q1 - 1.5*IQR, high = Q3 + 1.5*IQR;
    const clean = vals.filter(v => v >= low && v <= high);
    clean.sort((a,b)=>a-b);

    const P50 = q(clean, 0.50), P60 = q(clean, 0.60), P70 = q(clean, 0.70), P30 = q(clean, 0.30);
    const suggestion = {
      fast:  to99(p(P30)),                 // quick sale
      fair:  to99(p(P50)),                 // median
      high:  to99(p(P60)),                 // competitive BIN
      max:   to99(p(P70)),                 // stretch ask
      count: clean.length,
    };

    console.log("Pricing analysis complete:", suggestion);

    return new Response(JSON.stringify({ 
      count: vals.length, 
      used: clean.length, 
      P50: p(P50), 
      suggestion, 
      samples: clean.slice(0,10) 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Error in eBay comps function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});