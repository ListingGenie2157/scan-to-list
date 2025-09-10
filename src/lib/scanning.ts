import { supabase } from "@/integrations/supabase/client";
import { getActivePricing } from "@/lib/ebayCompat";

export type LookupMeta = {
  type: string | null;
  isbn13: string | null;
  barcode?: string | null;
  barcode_addon?: string | null;
  title: string | null;
  authors: string[] | null;
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  description?: string | null;
  categories?: string[] | null;
  suggested_price?: number | null;
  // Additional magazine-specific fields
  inferred_month?: string | null;
  inferred_year?: string | null;
  inferred_issue?: string | null;
  issue_title?: string | null;
  issue_number?: string | null;
  issue_date?: string | null;
} | null;

export function normalizeScan(raw: string): string | null {
  if (!raw) return null;
  // Remove non-digits (keep X for ISBN10 check but we'll convert to 13 anyway)
  let s = String(raw).trim();
  let digits = s.replace(/[^0-9Xx]/g, "");

  // EAN-13 + EAN-5 addon (18 digits) -> for magazines (977 prefix), preserve add-on
  if (digits.length === 18 && digits.startsWith("977")) {
    return digits; // Keep full barcode with add-on for magazines
  }
  // EAN-13 + EAN-5 addon for books -> trim to 13
  if (digits.length === 18 && (digits.startsWith("978") || digits.startsWith("979"))) {
    digits = digits.slice(0, 13);
  }
  // Some scanners include spaces/plus, handled above. If pure 15 with add-on, also trim for books
  if (digits.length === 15) {
    if (digits.startsWith("977")) {
      return digits; // Keep magazine codes with add-ons
    } else if (digits.startsWith("978") || digits.startsWith("979")) {
      digits = digits.slice(0, 13);
    }
  }

  // If ISBN10 -> convert to ISBN13
  if (digits.length === 10) {
    digits = isbn10to13(digits.toUpperCase());
  }

  // Accept EAN-13 for books and magazines
  if (digits.length === 13) {
    if (digits.startsWith("978") || digits.startsWith("979") || digits.startsWith("977")) {
      return digits;
    }
  }

  // Accept 12-digit UPC codes (e.g., magazines) by returning the digits as-is. 
  // Caller can decide how to handle these codes (e.g., treat as product UPC).
  if (digits.length === 12) {
    return digits;
  }

  return null;
}

function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+core[i]) * (i % 2 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

// Lookup product information using a barcode (ISBN-13, ISBN-10 converted, UPC, etc.).
// The parameter name remains `isbn13` for backward compatibility but any numeric code is accepted.
export async function lookupIsbn(isbn13: string): Promise<LookupMeta> {
  const { data, error } = await supabase.functions.invoke('lookup-product', {
    body: { barcode: isbn13 }
  });
  if (error) throw error;
  // Edge returns meta or null
  return (data as any) ?? null;
}

export async function upsertItem(meta: NonNullable<LookupMeta>, userItemType?: 'book' | 'magazine'): Promise<number> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) throw new Error('Not authenticated');

  // Determine final type: user preference > detected type > default book
  const finalType = userItemType || meta.type || 'book';

  // For magazines, compose title with issue information
  let composedTitle = meta.title;
  if (finalType === 'magazine') {
    const titleParts = [meta.title];
    if (meta.issue_title) titleParts.push(meta.issue_title);
    if (meta.issue_number) titleParts.push(`Issue ${meta.issue_number}`);
    if (meta.issue_date) titleParts.push(meta.issue_date);
    composedTitle = titleParts.filter(Boolean).join(' - ');
  }

  // For magazines, use barcode for lookups instead of isbn13
  const isBookWithIsbn = finalType === 'book' && meta.isbn13;
  const isMagazineWithBarcode = finalType === 'magazine' && meta.barcode;

  let existing = null;
  if (isBookWithIsbn) {
    const { data: existingData, error: exErr } = await supabase
      .from('items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('isbn13', meta.isbn13!)
      .maybeSingle();
    if (exErr && (exErr as any).code !== 'PGRST116') throw exErr;
    existing = existingData;
  } else if (isMagazineWithBarcode) {
    // For magazines, we'll use isbn13 field temporarily to store barcode
    // until barcode columns are properly migrated
    const { data: existingData, error: exErr } = await supabase
      .from('items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('isbn13', meta.barcode!)
      .maybeSingle();
    if (exErr && (exErr as any).code !== 'PGRST116') throw exErr;
    existing = existingData;
  }

  if (existing) {
    const updateData: any = {
      quantity: (existing.quantity ?? 1) + 1,
      title: composedTitle ?? null,
      publisher: meta.publisher ?? null,
      authors: meta.authors ?? null,
      year: meta.year ?? null,
      description: meta.description ?? null,
      categories: meta.categories ?? null,
      cover_url_ext: meta.coverUrl ?? null,
      last_scanned_at: new Date().toISOString(),
      type: finalType,
    };
    
    // Temporarily store barcode in isbn13 field for magazines
    if (meta.barcode && finalType === 'magazine') {
      updateData.isbn13 = meta.barcode;
    }

    const { error: updErr } = await supabase
      .from('items')
      .update(updateData)
      .eq('id', existing.id);
    if (updErr) throw updErr;
    
    // Sync to inventory_items table
    await syncToInventoryItems(existing.id, updateData, user.id);
    
    return existing.id as unknown as number;
  } else {
    const insertData: any = {
      user_id: user.id,
      type: finalType,
      title: composedTitle ?? null,
      publisher: meta.publisher ?? null,
      authors: meta.authors ?? null,
      year: meta.year ?? null,
      description: meta.description ?? null,
      categories: meta.categories ?? null,
      cover_url_ext: meta.coverUrl ?? null,
      quantity: 1,
      status: 'draft',
      source: 'scan',
      last_scanned_at: new Date().toISOString(),
    };

    // Add appropriate identifier fields
    if (meta.isbn13 && finalType === 'book') {
      insertData.isbn13 = meta.isbn13;
    } else if (meta.barcode && finalType === 'magazine') {
      // Temporarily store barcode in isbn13 field for magazines
      insertData.isbn13 = meta.barcode;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('items')
      .insert(insertData)
      .select()
      .single();
    if (insErr) throw insErr;
    const newId = inserted!.id as number;
    
    // Sync to inventory_items table
    await syncToInventoryItems(newId, insertData, user.id);
    
    await maybeGenerateAndSavePrice(newId, meta);
    return newId;
  }
}

async function syncToInventoryItems(itemId: number, itemData: any, userId: string) {
  try {
    // Sync to inventory_items table for dual table management
    const inventoryData = {
      item_id: itemId,
      user_id: userId,
      title: itemData.title,
      subtitle: itemData.issue_title || null,
      publisher: itemData.publisher,
      authors: itemData.authors,
      year: itemData.year,
      quantity: itemData.quantity || 1,
      type: itemData.type,
      status: itemData.status || 'draft',
      isbn13: itemData.isbn13,
      cover_url: itemData.cover_url_ext,
      last_updated: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('inventory_items')
      .upsert(inventoryData, { onConflict: 'item_id' });
    
    if (error && !error.message.includes('does not exist')) {
      console.warn('Failed to sync to inventory_items:', error);
    }
  } catch (err) {
    console.warn('Inventory sync error:', err);
  }
}

async function maybeGenerateAndSavePrice(itemId: number, meta: NonNullable<LookupMeta>) {
  // Attempt to generate a price using multiple strategies. We prefer pulling
  // real-world pricing data via our eBay proxy function if an ISBN or
  // reasonable query is available. If that fails, fall back to the
  // existing OpenAI/heuristic approach. Any failure is swallowed to avoid
  // blocking the save flow.
  try {
    let suggestedPrice: number | undefined;
    // First try eBay pricing if we have an ISBN or at least a title for the query.
    try {
      const body: any = {};
      if (meta.isbn13 && meta.type !== 'magazine') body.isbn = meta.isbn13;
      // For magazines or items without ISBN, use title-based search
      if (!body.isbn && meta.title) body.query = meta.title;
      if (Object.keys(body).length > 0) {
        try {
          const pricingData = await getActivePricing(body);
          // The eBay pricing function returns { suggestedPrice: number, analytics: ..., items: ..., confidence: ... }
          const price = (pricingData as any)?.suggestedPrice as number | undefined;
          if (typeof price === 'number' && isFinite(price) && price > 0) {
            suggestedPrice = price;
          }
        } catch (pricingErr) {
          // Swallow errors from eBay pricing to allow fallback to heuristic
          console.warn('eBay pricing error:', pricingErr);
        }
      }
    } catch (e) {
      console.warn('Pricing lookup error:', e);
    }

    // If we still don't have a price, fall back to OpenAI/heuristic generator
    if (typeof suggestedPrice !== 'number') {
      const { data, error } = await supabase.functions.invoke('generate-price', {
        body: {
          title: meta.title,
          authors: meta.authors,
          publisher: meta.publisher,
          year: meta.year,
          isbn13: meta.isbn13,
        },
      });
      if (error) throw error;
      const price = (data as any)?.price as number | undefined;
      if (typeof price === 'number' && isFinite(price)) {
        suggestedPrice = price;
      }
    }
    if (typeof suggestedPrice === 'number' && isFinite(suggestedPrice)) {
      await supabase.from('items').update({ suggested_price: suggestedPrice }).eq('id', itemId);
    }
  } catch (e) {
    console.warn('Price generation failed:', e);
  }
}


export async function storeCover(itemId: number, coverUrl: string, type: 'book' | 'magazine' | 'bundle' = 'book'): Promise<void> {
  // Use mirror-cover edge function for simpler cover storage
  const { data, error } = await supabase.functions.invoke('mirror-cover', {
    body: { itemId, coverUrl, type }
  });
  if (error) throw error;
  return data;
}

async function createThumbnail(file: Blob, maxSize: number): Promise<Blob> {
  const img = await blobToImage(file);
  const [w, h] = fitWithin(img.naturalWidth, img.naturalHeight, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(img, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/webp', 0.86));
  return blob;
}

function fitWithin(w: number, h: number, max: number): [number, number] {
  const ratio = Math.min(max / w, max / h, 1);
  return [Math.round(w * ratio), Math.round(h * ratio)];
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
