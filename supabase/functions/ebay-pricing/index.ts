import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// No Supabase client needed for this function

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// We no longer require service role or OAuth for pricing via Finding API
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || ""; // May equal App ID
const EBAY_APP_ID = Deno.env.get("EBAY_APP_ID") || EBAY_CLIENT_ID; // Use explicit APP ID if provided

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

    // Build eBay Finding API request (does not require OAuth browse scope)
    console.log("Building eBay Finding API request...");
    if (!EBAY_APP_ID) {
      return json({ error: "Missing EBAY_APP_ID or EBAY_CLIENT_ID environment variable" }, 500);
    }

    const findingParams = new URLSearchParams({
      "OPERATION-NAME": "findCompletedItems",
      "SERVICE-VERSION": "1.13.0",
      "SECURITY-APPNAME": EBAY_APP_ID,
      "RESPONSE-DATA-FORMAT": "JSON",
      "REST-PAYLOAD": "true",
      "paginationInput.entriesPerPage": "50",
      // Books category to reduce noise
      "categoryId": "267",
    });

    // Use ISBN as keyword if present; otherwise use provided query
    if (isbn) {
      findingParams.set("keywords", String(isbn));
    } else if (query) {
      findingParams.set("keywords", String(query));
    }

    const url = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
    url.search = findingParams.toString();
    
    console.log("Final eBay API URL:", url.toString());
    
    // Add completed listings filter using itemEndDate for past listings
    // Note: eBay Browse API limitations - for true sold data we'd need Finding API or Shopping API
    // This approach gets recently ended listings which includes sold items

    console.log("Making eBay Finding API request...");
    const resp = await fetch(url.toString());

    console.log("eBay API response:", { ok: resp.ok, status: resp.status });
    const data = await resp.json();
    
    if (!resp.ok) {
      console.log("eBay API error:", data);
      return json({ error: "Browse error", details: data }, 500);
    }

    // Parse Finding API response
    const itemsRaw = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const items = itemsRaw as any[];
    
    // Extract pricing data with more details - filter for actually sold items when available
    const validItems = items.filter(item => {
      const sellingState = item?.sellingStatus?.[0]?.sellingState?.[0];
      const priceValue = item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
      const hasPrice = priceValue && parseFloat(priceValue) > 0;
      const isSold = sellingState === 'EndedWithSales';
      return hasPrice && isSold;
    });
    const prices = validItems
      .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__))
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
      title: item.title?.[0],
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__),
      currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || null,
      sellingState: item.sellingStatus?.[0]?.sellingState?.[0] || null,
      listingMarketplaceId: 'EBAY_US',
      itemWebUrl: item.viewItemURL?.[0] || null,
      image: item.galleryURL?.[0] || null,
      seller: item.sellerInfo?.[0]?.sellerUserName?.[0] || null,
      categories: item.primaryCategory ? [item.primaryCategory?.[0]?.categoryName?.[0]].filter(Boolean) : [],
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
