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
  // inferred fields for magazines (from EAN add-ons)
  inferred_month?: string | null;
  inferred_year?: string | null;
  inferred_issue?: string | null;
  // explicit magazine fields provided by UI
  issue_title?: string | null;
  issue_number?: string | null;
  issue_date?: string | null;
} | null;

export function normalizeScan(raw: string): string | null {
  if (!raw) return null;
  // Remove non-digits (keep X for ISBN10 check but we'll convert to 13 anyway)
  const s = String(raw).trim();
  let digits = s.replace(/[^0-9Xx]/g, "");

  // Preserve EAN add-ons for downstream disambiguation (book/magazine)
  if (digits.length === 18 && (digits.startsWith("978") || digits.startsWith("979") || digits.startsWith("977"))) {
    return digits; // EAN-13 + EAN-5 addon
  }
  if (digits.length === 15 && (digits.startsWith("978") || digits.startsWith("979") || digits.startsWith("977"))) {
    return digits; // EAN-13 + EAN-2 addon
  }

  // If ISBN10 -> convert to ISBN13
  if (digits.length === 10) {
    digits = isbn10to13(digits.toUpperCase());
  }

  // Accept EAN-13 (books 978/979 and magazines 977)
  if (digits.length === 13 && (digits.startsWith("978") || digits.startsWith("979") || digits.startsWith("977"))) {
    return digits;
  }

  // Accept 12-digit UPC codes
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
      title: meta.title ?? null,
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
    return existing.id as unknown as number;
  } else {
    // Build a composed title for magazines: Publication - Issue Title - Issue X - Month Year
    let composedTitle: string | null = null;
    if (finalType === 'magazine') {
      const publicationName = meta.title || '';
      const issueTitle = meta.issue_title || '';
      const issueNum = meta.issue_number || meta.inferred_issue || '';
      const monthYear = meta.issue_date || (meta.inferred_month && meta.inferred_year ? `${meta.inferred_month} ${meta.inferred_year}` : (meta.inferred_year || '')) || '';
      const parts = [publicationName, issueTitle, issueNum ? `Issue ${issueNum}` : '', monthYear].filter(Boolean);
      composedTitle = parts.join(' - ') || null;
    }

    const insertData: any = {
      user_id: user.id,
      type: finalType,
      title: finalType === 'magazine' ? (composedTitle ?? (meta.title ?? null)) : (meta.title ?? null),
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
    let newInventoryId: string | undefined = undefined;
    // Also create an inventory_items entry for magazines with disambiguation details
    if (finalType === 'magazine') {
      const issueDate = meta.issue_date || (
        meta.inferred_month && meta.inferred_year ? `${meta.inferred_month} ${meta.inferred_year}` : (meta.inferred_year || null)
      );
      const { data: inv, error: invErr } = await supabase
        .from('inventory_items')
        .insert({
          user_id: user.id,
          // Publication name in title, issue title in subtitle
          title: meta.title ?? null,
          subtitle: meta.issue_title ?? null,
          issue_number: meta.issue_number ?? meta.inferred_issue ?? null,
          issue_date: issueDate,
          publication_year: meta.year ? parseInt(meta.year, 10) || null : (meta.inferred_year ? parseInt(meta.inferred_year, 10) || null : null),
          isbn: meta.barcode ?? null,
          suggested_category: 'magazine',
          suggested_price: meta.suggested_price ?? null,
          suggested_title: composedTitle ?? null,
          status: 'processed',
        })
        .select()
        .single();
      if (!invErr) newInventoryId = inv?.id as string | undefined;
    }

    await maybeGenerateAndSavePrice(newId, meta, newInventoryId);
    return newId;
  }
}

async function maybeGenerateAndSavePrice(itemId: number, meta: NonNullable<LookupMeta>, inventoryItemId?: string) {
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
      if (inventoryItemId) {
        await supabase.from('inventory_items').update({ suggested_price: suggestedPrice }).eq('id', inventoryItemId);
      }
    }
  } catch (e) {
    console.warn('Price generation failed:', e);
  }
}


export async function storeCover(itemId: number, coverUrl: string, type: 'book' | 'magazine' | 'bundle' = 'book'): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) throw new Error('Not authenticated');
  const userId = user.id;

  const res = await fetch(coverUrl, { mode: 'cors' }).catch(() => fetch(coverUrl));
  if (!res.ok) throw new Error('Failed to fetch cover');
  const blob = await res.blob();

  const thumbBlob = await createThumbnail(blob, 320);

  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  const basePath = `${userId}/${type}/${itemId}`;
  const fileName = `cover-${Date.now()}.${ext}`;
  const thumbName = `cover-${Date.now()}-thumb.webp`;

  const { error: upErr } = await supabase.storage.from('photos').upload(`${basePath}/${fileName}`, blob, {
    cacheControl: '3600', upsert: true, contentType: blob.type || `image/${ext}`
  });
  if (upErr) throw upErr;

  const { error: upThumbErr } = await supabase.storage.from('photos').upload(`${basePath}/${thumbName}`, thumbBlob, {
    cacheControl: '3600', upsert: true, contentType: 'image/webp'
  });
  if (upThumbErr) throw upThumbErr;

  const { data: pub1 } = supabase.storage.from('photos').getPublicUrl(`${basePath}/${fileName}`);
  const { data: pub2 } = supabase.storage.from('photos').getPublicUrl(`${basePath}/${thumbName}`);

  await supabase.from('photos').insert({
    item_id: Number(itemId),
    file_name: fileName,
    storage_path: `${basePath}/${fileName}`,
    public_url: pub1.publicUrl,
    url_public: pub1.publicUrl,
    thumb_url: pub2.publicUrl,
    user_id: user.id,
  });
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
