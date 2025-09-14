import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();

    if (!barcode) {
      throw new Error('Barcode is required');
    }

    console.log('Looking up barcode:', barcode);

    // Normalize the scanned barcode and decide lookup strategy
    let productInfo = null;

    const norm = normalize(String(barcode || ''));
    let codeToUse = norm.code;

    // Convert ISBN10 to ISBN13 for lookups
    if (norm.kind === 'ISBN10') {
      codeToUse = isbn10to13(codeToUse);
    }

    if (norm.kind === 'ISBN13') {
      // Only perform book lookups for valid ISBN-13 (including EAN13+addon trimmed)
      productInfo = await lookupGoogleBooks(codeToUse);

      // Fallback to Open Library if Google Books fails
      if (!productInfo) {
        productInfo = await lookupOpenLibrary(codeToUse);
      }
    } else if (norm.kind === 'EAN13_MAGAZINE') {
      // For magazine barcodes (977 prefix), lookup in UPC database but mark as magazine
      productInfo = await lookupUPCDatabase(codeToUse);
      if (productInfo) {
        productInfo.type = 'magazine';
        productInfo.addon = norm.addon || null;
      }
    } else if (norm.kind === 'UPCA' || norm.kind === 'UNKNOWN') {
      // For UPC-A or unknown codes, attempt a basic UPC database lookup.
      // This handles magazines and generic products where only a UPC is available.
      productInfo = await lookupUPCDatabase(codeToUse);
    } else {
      // fallback: let client handle via OCR/manual entry
    }

    // Read-only: no database writes performed here.


    // Attempt to parse magazine add-on data (issue/month/price)
    let inferred: { inferred_month?: string | null; inferred_year?: string | null; inferred_issue?: string | null; suggested_price?: number | null } = {};
    if ((norm.kind === 'EAN13_MAGAZINE') && norm.addon) {
      const parsed = parseMagazineAddon(norm.addon);
      inferred = { ...parsed };
    }

    // Also try to infer month/year from title/description text for magazines
    if (productInfo && productInfo.type === 'magazine') {
      const fromTitle = parseMonthYearFromText(String(productInfo.title || ''));
      const fromDesc = parseMonthYearFromText(String(productInfo.description || ''));
      inferred.inferred_month = inferred.inferred_month || fromTitle.month || fromDesc.month || null;
      inferred.inferred_year = inferred.inferred_year || fromTitle.year || fromDesc.year || null;
    }

    // Build a simplified meta response (or null if not found)
    const meta = productInfo ? {
      type: productInfo.type,
      isbn13: productInfo.type === 'magazine' ? null : codeToUse,
      barcode: codeToUse,
      barcode_addon: productInfo.addon ?? null,
      title: productInfo.title ?? null,
      authors: productInfo.authors ?? null,
      publisher: productInfo.publisher ?? null,
      year: productInfo.publication_year ?? inferred.inferred_year ?? null,
      coverUrl: productInfo.coverUrl ?? null,
      description: productInfo.description ?? null,
      categories: productInfo.categories ?? null,
      // inferred fields for magazines
      inferred_month: inferred.inferred_month ?? null,
      inferred_year: inferred.inferred_year ?? null,
      inferred_issue: inferred.inferred_issue ?? null,
      suggested_price: typeof inferred.suggested_price === 'number' ? inferred.suggested_price : null,
    } : null;

    return new Response(JSON.stringify(meta), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in lookup-product function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function normalize(raw: string): { kind: 'ISBN13' | 'ISBN10' | 'UPCA' | 'EAN13_MAGAZINE' | 'UNKNOWN'; code: string; addon?: string } {
  const s = raw.replace(/[\s-]/g, '');
  const d = s.replace(/[^0-9Xx]/g, '');
  
  // EAN13+EAN5 addon (18 digits total)
  if (d.length === 18 && (d.startsWith('978') || d.startsWith('979'))) {
    return { kind: 'ISBN13', code: d.slice(0, 13), addon: d.slice(13) };
  }
  if (d.length === 18 && d.startsWith('977')) {
    return { kind: 'EAN13_MAGAZINE', code: d.slice(0, 13), addon: d.slice(13) };
  }
  
  // EAN13+EAN2 addon (15 digits total)
  if (d.length === 15 && (d.startsWith('978') || d.startsWith('979'))) {
    return { kind: 'ISBN13', code: d.slice(0, 13), addon: d.slice(13) };
  }
  if (d.length === 15 && d.startsWith('977')) {
    return { kind: 'EAN13_MAGAZINE', code: d.slice(0, 13), addon: d.slice(13) };
  }
  
  // Standard lengths
  if (d.length === 13 && (d.startsWith('978') || d.startsWith('979'))) return { kind: 'ISBN13', code: d };
  if (d.length === 13 && d.startsWith('977')) return { kind: 'EAN13_MAGAZINE', code: d };
  if (d.length === 10) return { kind: 'ISBN10', code: d.toUpperCase() };
  if (d.length === 12) return { kind: 'UPCA', code: d };
  
  return { kind: 'UNKNOWN', code: d };
}

function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+core[i]) * (i % 2 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

// Parse EAN-2 or EAN-5 add-ons for magazines.
// Common conventions:
// - EAN-2: often encodes issue number or week number (00-99). We'll expose as inferred_issue.
// - EAN-5: often encodes price (xxxxy => xxxx currency/price + checksum). We'll parse to a numeric price in USD if plausible.
function parseMagazineAddon(addon: string): { inferred_month?: string | null; inferred_year?: string | null; inferred_issue?: string | null; suggested_price?: number | null } {
  const inferred_month: string | null = null;
  const inferred_year: string | null = null;
  let inferred_issue: string | null = null;
  let suggested_price: number | null = null;

  if (/^\d{2}$/.test(addon)) {
    // EAN-2: could be issue number; we expose as-is
    inferred_issue = addon;
  } else if (/^\d{5}$/.test(addon)) {
    // EAN-5: price encoding varies by publisher. A common pattern encodes price in cents in the first 4 digits.
    // We will attempt a safe parse: first 4 digits as cents, last digit checksum ignored.
    const cents = parseInt(addon.slice(0, 4), 10);
    if (Number.isFinite(cents) && cents > 0) {
      suggested_price = Math.round(cents) / 100;
    }
  }

  return { inferred_month, inferred_year, inferred_issue, suggested_price };
}

function parseMonthYearFromText(text: string): { month?: string | null; year?: string | null } {
  const months = [
    'January','February','March','April','May','June','July','August','September','October','November','December'
  ];
  const lower = text.toLowerCase();
  const monthIndex = months.findIndex(m => lower.includes(m.toLowerCase()) || lower.includes(m.slice(0,3).toLowerCase()));
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const month = monthIndex >= 0 ? months[monthIndex] : null;
  const year = yearMatch ? yearMatch[0] : null;
  return { month, year };
}

async function lookupGoogleBooks(isbn: string) {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      return {
        type: 'book',
        title: book.title ?? null,
        authors: Array.isArray(book.authors) ? book.authors : (book.authors ? [book.authors] : null),
        publisher: book.publisher ?? null,
        publication_year: book.publishedDate ? book.publishedDate.substring(0, 4) : null,
        description: book.description ?? null,
        categories: Array.isArray(book.categories) ? book.categories : (book.categories ? [book.categories] : null),
        coverUrl: book.imageLinks?.thumbnail || book.imageLinks?.smallThumbnail || null,
      };
    }
  } catch (error) {
    console.error('Google Books API error:', error);
  }
  return null;
}

async function lookupOpenLibrary(isbn: string) {
  try {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const data = await response.json();
    
    const bookKey = `ISBN:${isbn}`;
    if (data[bookKey]) {
      const book = data[bookKey];
      // Try to extract a 4-digit year from publish_date
      const yearMatch = typeof book.publish_date === 'string' ? book.publish_date.match(/\d{4}/) : null;
      return {
        type: 'book',
        title: book.title ?? null,
        authors: book.authors ? book.authors.map((a: { name: string }) => a.name) : null,
        publisher: book.publishers ? book.publishers[0]?.name ?? null : null,
        publication_year: yearMatch ? yearMatch[0] : null,
        description: book.description ?? null,
        categories: book.subjects ? book.subjects.map((s: { name: string }) => s.name) : null,
        coverUrl: (book.cover && (book.cover.medium || book.cover.large)) || `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
      };
    }
  } catch (error) {
    console.error('Open Library API error:', error);
  }
  return null;
}

async function lookupUPCDatabase(barcode: string) {
  try {
    // This is a free UPC lookup service - you might want to use a paid service for better results
    const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      
      // Enhanced magazine detection
      const title = item.title?.toLowerCase() || '';
      const category = item.category?.toLowerCase() || '';
      const description = item.description?.toLowerCase() || '';
      
      const isMagazine = 
        title.includes('magazine') ||
        title.includes('issue') ||
        title.includes('vol.') ||
        title.includes('volume') ||
        category.includes('magazine') ||
        category.includes('periodical') ||
        description.includes('magazine') ||
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(title);
      
      return {
        type: isMagazine ? 'magazine' : 'product',
        title: item.title,
        authors: null,
        publisher: item.brand,
        publication_year: null,
        isbn: null,
        description: item.description,
        categories: item.category ? [item.category] : null,
        format: isMagazine ? 'Magazine' : 'Product',
        genre: item.category,
        suggested_price: null,
      };
    }
  } catch (error) {
    console.error('UPC Database API error:', error);
  }
  return null;
}