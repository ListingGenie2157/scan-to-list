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
    } else if (norm.kind === 'UPCA' || norm.kind === 'UNKNOWN') {
      // For UPC-A or unknown codes, attempt a basic UPC database lookup.
      // This handles magazines and generic products where only a UPC is available.
      productInfo = await lookupUPCDatabase(codeToUse);
    } else {
      // fallback: let client handle via OCR/manual entry
    }

    // Read-only: no database writes performed here.


    // Build a simplified meta response (or null if not found)
    const meta = productInfo ? {
      type: productInfo.type,
      isbn13: codeToUse,
      title: productInfo.title ?? null,
      authors: productInfo.authors ?? null,
      publisher: productInfo.publisher ?? null,
      year: productInfo.publication_year ?? null,
      coverUrl: productInfo.coverUrl ?? null,
      description: productInfo.description ?? null,
      categories: productInfo.categories ?? null,
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

function normalize(raw: string): { kind: 'ISBN13' | 'ISBN10' | 'UPCA' | 'UNKNOWN'; code: string } {
  const s = raw.replace(/[\s-]/g, '');
  const d = s.replace(/[^0-9Xx]/g, '');
  if (d.length === 18 && (d.startsWith('978') || d.startsWith('979'))) return { kind: 'ISBN13', code: d.slice(0, 13) }; // EAN13+EAN5
  if (d.length === 13 && (d.startsWith('978') || d.startsWith('979'))) return { kind: 'ISBN13', code: d };
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
        authors: book.authors ? book.authors.map((a: any) => a.name) : null,
        publisher: book.publishers ? book.publishers[0]?.name ?? null : null,
        publication_year: yearMatch ? yearMatch[0] : null,
        description: book.description ?? null,
        categories: book.subjects ? book.subjects.map((s: any) => s.name) : null,
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
      return {
        // Mark UPC lookups as generic products. Clients may override to 'magazine' if desired.
        type: 'product',
        title: item.title,
        authors: null,
        publisher: item.brand,
        publication_year: null,
        isbn: null,
        description: item.description,
        categories: item.category ? [item.category] : null,
        format: 'Magazine/Product',
        genre: item.category,
        suggested_price: null,
      };
    }
  } catch (error) {
    console.error('UPC Database API error:', error);
  }
  return null;
}