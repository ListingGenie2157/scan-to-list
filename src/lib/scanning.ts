import { supabase } from "@/integrations/supabase/client";

export type LookupMeta = {
  type: string | null;
  isbn13: string | null;
  title: string | null;
  authors: string[] | null;
  publisher: string | null;
  year: string | null;
  coverUrl: string | null;
  description?: string | null;
  categories?: string[] | null;
} | null;

export function normalizeScan(raw: string): string | null {
  if (!raw) return null;
  // Remove non-digits (keep X for ISBN10 check but we'll convert to 13 anyway)
  let s = String(raw).trim();
  let digits = s.replace(/[^0-9Xx]/g, "");

  // EAN-13 + EAN-5 addon (18 digits) -> trim to 13
  if (digits.length === 18 && (digits.startsWith("978") || digits.startsWith("979"))) {
    digits = digits.slice(0, 13);
  }
  // Some scanners include spaces/plus, handled above. If pure 15 with add-on, also trim
  if (digits.length === 15 && (digits.startsWith("978") || digits.startsWith("979"))) {
    digits = digits.slice(0, 13);
  }

  // If ISBN10 -> convert to ISBN13
  if (digits.length === 10) {
    digits = isbn10to13(digits.toUpperCase());
  }

  // Only accept EAN-13 for books
  if (digits.length === 13 && (digits.startsWith("978") || digits.startsWith("979"))) {
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

export async function lookupIsbn(isbn13: string): Promise<LookupMeta> {
  const { data, error } = await supabase.functions.invoke('lookup-product', {
    body: { barcode: isbn13 }
  });
  if (error) throw error;
  // Edge returns meta or null
  return (data as any) ?? null;
}

export async function upsertItem(meta: NonNullable<LookupMeta>): Promise<number> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) throw new Error('Not authenticated');
  const isbn = meta.isbn13!;

  // Try find existing
  const { data: existing, error: exErr } = await supabase
    .from('items')
    .select('id, quantity')
    .eq('user_id', user.id)
    .eq('isbn13', isbn)
    .maybeSingle();
  if (exErr && (exErr as any).code !== 'PGRST116') throw exErr;

  if (existing) {
    const { error: updErr } = await supabase
      .from('items')
      .update({
        quantity: (existing.quantity ?? 1) + 1,
        title: meta.title ?? null,
        publisher: meta.publisher ?? null,
        authors: meta.authors ?? null,
        year: meta.year ?? null,
        description: meta.description ?? null,
        categories: meta.categories ?? null,
        cover_url_ext: meta.coverUrl ?? null,
        last_scanned_at: new Date().toISOString(),
        type: meta.type ?? 'book',
      })
      .eq('id', existing.id);
    if (updErr) throw updErr;
    return existing.id as unknown as number;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('items')
      .insert({
        user_id: user.id,
        type: meta.type ?? 'book',
        isbn13: isbn,
        title: meta.title ?? null,
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
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return inserted!.id as number;
  }
}

export async function storeCover(itemId: number, coverUrl: string, type: 'book' | 'magazine' = 'book'): Promise<void> {
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
