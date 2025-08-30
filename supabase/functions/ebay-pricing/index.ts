import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: any, status = 200) {
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
    console.log("eBay pricing function called");

    const requestBody = await req.json().catch(() => ({
      isbn: undefined,
      query: undefined
    }));

    const { isbn, query } = requestBody;
    console.log("Request parameters:", { isbn, query });

    if (!isbn && !query) {
      return json({ error: "Provide isbn or query" }, 400);
    }

    // Check for environment variables
    const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
    const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");
    
    if (!EBAY_CLIENT_ID) {
      return json({ error: "EBAY_CLIENT_ID environment variable not set" }, 400);
    }
    if (!EBAY_CLIENT_SECRET) {
      return json({ error: "EBAY_CLIENT_SECRET environment variable not set" }, 400);
    }

    // Since eBay no longer allows access to sold data, we'll use algorithmic pricing
    console.log("Using algorithmic pricing (eBay sold data no longer available)");
    
    // Calculate price based on item data using your existing algorithm
    const suggestedPrice = calculateFallbackPrice(isbn, query);
    
    console.log("Algorithmic pricing calculated:", suggestedPrice);
    
    return json({
      success: true,
      message: "Price calculated using algorithmic method (eBay sold data unavailable)", 
      suggestedPrice: suggestedPrice,
      analytics: {
        count: 1,
        median: suggestedPrice,
        average: suggestedPrice,
        min: suggestedPrice * 0.8,
        max: suggestedPrice * 1.2,
        confidence: "algorithmic"
      },
      items: []
    });

  } catch (e) {
    console.error("eBay pricing function error:", e);
    return json({ error: String(e) }, 500);
  }
});

// Algorithmic pricing function since eBay sold data is no longer available
function calculateFallbackPrice(isbn?: string, query?: string): number {
  let basePrice = 15.0; // Default book price
  
  // If it looks like a magazine query, lower the base price
  if (query?.toLowerCase().includes('magazine') || 
      query?.toLowerCase().includes('issue') ||
      query?.toLowerCase().includes('vol')) {
    basePrice = 8.0;
  }
  
  // If it has ISBN, it's likely a book
  if (isbn) {
    basePrice = 15.0;
    
    // Newer ISBNs (978-) might be worth slightly more
    if (isbn.startsWith('978')) {
      basePrice *= 1.1;
    }
  }
  
  // Add some variation based on query characteristics
  if (query) {
    const queryLower = query.toLowerCase();
    
    // Vintage indicators
    if (queryLower.includes('vintage') || queryLower.includes('antique') || 
        queryLower.includes('rare') || queryLower.includes('first edition')) {
      basePrice *= 1.5;
    }
    
    // Collectible indicators  
    if (queryLower.includes('collectible') || queryLower.includes('limited') ||
        queryLower.includes('signed')) {
      basePrice *= 1.3;
    }
    
    // Series/set indicators
    if (queryLower.includes('set') || queryLower.includes('series') ||
        queryLower.includes('collection')) {
      basePrice *= 1.2;
    }
  }
  
  // Round to 2 decimal places and ensure minimum price
  return Math.max(5.0, Math.round(basePrice * 100) / 100);
}