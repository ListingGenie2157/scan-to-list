import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.log("pricing using: APP token");

    const requestBody = await req.json().catch(() => ({
      isbn: undefined,
      query: undefined
    }));

    const { isbn, query } = requestBody;
    console.log("Request parameters:", { isbn, query });

    if (!isbn && !query) {
      return json({ error: "Provide isbn or query" }, 400);
    }

    // PRODUCTION app token for Browse API
    const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID")!;
    const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET")!;
    const auth = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);

    const tokRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope/buy.browse" // not readonly
      }).toString()
    });

    const tok = await tokRes.json();
    if (!tok.access_token) {
      throw new Error(`No app token: ${tokRes.status} ${JSON.stringify(tok)}`);
    }
    const APP_TOKEN = tok.access_token;

    console.log("Building eBay Finding API request for completed items...");
    
    // Use Finding API for completed/ended items
    const findingUrl = "https://svcs.ebay.com/services/search/FindingService/v1";
    const searchQuery = isbn || query;
    
    const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
    <findCompletedItemsRequest xmlns="http://www.ebay.com/marketplace/search/v1/services">
      <keywords>${searchQuery}</keywords>
      <paginationInput>
        <entriesPerPage>100</entriesPerPage>
      </paginationInput>
      <itemFilter>
        <filterType>Condition</filterType>
        <filterValue>New</filterValue>
        <filterValue>Like New</filterValue>
        <filterValue>Very Good</filterValue>
        <filterValue>Good</filterValue>
        <filterValue>Acceptable</filterValue>
      </itemFilter>
      <itemFilter>
        <filterType>SoldItemsOnly</filterType>
        <filterValue>false</filterValue>
      </itemFilter>
      <sortOrder>EndTimeSoonest</sortOrder>
    </findCompletedItemsRequest>`;

    console.log("Finding API request for:", searchQuery);

    const resp = await fetch(findingUrl, {
      method: "POST",
      headers: {
        "X-EBAY-SOA-SECURITY-APPNAME": EBAY_CLIENT_ID,
        "X-EBAY-SOA-OPERATION-NAME": "findCompletedItems",
        "X-EBAY-SOA-SERVICE-VERSION": "1.0.0",
        "X-EBAY-SOA-REQUEST-DATA-FORMAT": "XML",
        "X-EBAY-SOA-RESPONSE-DATA-FORMAT": "JSON",
        "Content-Type": "text/xml"
      },
      body: requestBody
    });

    console.log("eBay API response:", { ok: resp.ok, status: resp.status });

    const data = await resp.json();
    if (!resp.ok) {
      console.log("eBay Finding API error:", data);
      return json({ error: "Finding API error", details: data }, 500);
    }

    // Parse Finding API response format
    const searchResult = data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    const items = searchResult?.item || [];
    
    console.log("Found completed items:", items.length);
    
    // Extract pricing data from completed/ended items
    const validItems = items.filter((item) => {
      const price = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__;
      return price && parseFloat(price) > 0;
    });

    const prices = validItems.map((item) => {
      return parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
    }).sort((a, b) => a - b);

    // Calculate comprehensive pricing analytics
    const analytics = {
      count: prices.length,
      median: prices.length ? prices[Math.floor(prices.length / 2)] : null,
      average: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
      range: prices.length ? Math.max(...prices) - Math.min(...prices) : null,
      q1: prices.length ? prices[Math.floor(prices.length * 0.25)] : null,
      q3: prices.length ? prices[Math.floor(prices.length * 0.75)] : null
    };

    // Enhanced item data for UI - completed/ended items
    const processedItems = validItems.map((item) => ({
      title: item.title?.[0],
      price: parseFloat(item.sellingStatus[0].currentPrice[0].__value__),
      currency: item.sellingStatus[0].currentPrice[0]['@currencyId'],
      condition: item.condition?.[0]?.conditionDisplayName?.[0],
      endTime: item.listingInfo?.[0]?.endTime?.[0],
      itemUrl: item.viewItemURL?.[0],
      imageUrl: item.galleryURL?.[0],
      seller: item.sellerInfo?.[0]?.sellerUserName?.[0],
      categoryName: item.primaryCategory?.[0]?.categoryName?.[0],
      sold: item.sellingStatus?.[0]?.sellingState?.[0] === 'EndedWithSales'
    }));

    return json({
      suggestedPrice: analytics.median,
      analytics,
      items: processedItems,
      confidence: prices.length >= 3 ? 'high' : prices.length >= 1 ? 'medium' : 'low'
    });

  } catch (e) {
    console.error("ebay-pricing error", e);
    return json({ error: String(e) }, 500);
  }
});