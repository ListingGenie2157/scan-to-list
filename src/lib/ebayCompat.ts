// ============================================================================
// File: src/lib/ebayCompat.ts  (frontend helper)
// Purpose: map old helper names to new endpoints while you migrate imports.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

type SearchBody = { isbn?: string; query?: string; condition?: "New" | "Used"; limit?: number; includeShipping?: boolean };

type BulkBody = {
  items: Array<{ isbn?: string; issn?: string; title?: string; coverPrice?: number; condition?: "New" | "Used" }>;
  strategy: "ACTIVE_LISTINGS" | "COVER_MULTIPLIER" | "FLAT" | "MIN_OF";
  config?: { multiplier?: number; flat?: number; floor?: number; ceiling?: number; rounding?: "none" | ".99"; includeShipping?: boolean; limitPerItem?: number };
};

// New names
export async function getActivePricing(body: SearchBody) {
  const { data, error } = await supabase.functions.invoke("ebay-app-search", { body });
  if (error) throw new Error(error.message);
  return data;
}

export async function bulkPrice(body: BulkBody) {
  const { data, error } = await supabase.functions.invoke("ebay-bulk-price", { body });
  if (error) throw new Error(error.message);
  return data;
}

// Old names removed - migration complete