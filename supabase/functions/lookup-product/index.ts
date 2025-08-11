import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    } else {
      // For UPCA or UNKNOWN we skip product database lookups
      // and allow the client to fall back to OCR/manual entry
    }

    if (productInfo) {
      // Initialize Supabase client
      const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

      // Get user info from auth header
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');
      
      if (token) {
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          // Save to inventory
          const { data: inventoryItem, error: inventoryError } = await supabase
            .from('inventory_items')
            .insert({
              user_id: user.id,
              title: productInfo.title,
              author: productInfo.author,
              publisher: productInfo.publisher,
              publication_year: productInfo.publication_year,
              isbn: productInfo.isbn,
              genre: productInfo.genre,
              suggested_category: productInfo.category,
              suggested_price: productInfo.suggested_price,
              description: productInfo.description,
              format: productInfo.format,
              status: 'analyzed',
              confidence_score: 0.9,
              extracted_text: { source: 'barcode', barcode: barcode }
            })
            .select()
            .single();

          if (inventoryError) {
            console.error('Database error:', inventoryError);
          } else {
            console.log('Saved inventory item:', inventoryItem);
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: !!productInfo, 
      productInfo: productInfo || null,
      barcode 
    }), {
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
        title: book.title,
        author: book.authors ? book.authors.join(', ') : null,
        publisher: book.publisher,
        publication_year: book.publishedDate ? parseInt(book.publishedDate.substring(0, 4)) : null,
        isbn: isbn,
        description: book.description,
        category: book.categories ? book.categories[0] : 'Books',
        format: 'Book',
        genre: book.categories ? book.categories.join(', ') : null,
        suggested_price: null
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
      return {
        type: 'book',
        title: book.title,
        author: book.authors ? book.authors.map((a: any) => a.name).join(', ') : null,
        publisher: book.publishers ? book.publishers[0].name : null,
        publication_year: book.publish_date ? parseInt(book.publish_date) : null,
        isbn: isbn,
        description: null,
        category: book.subjects ? book.subjects[0].name : 'Books',
        format: 'Book',
        genre: book.subjects ? book.subjects.map((s: any) => s.name).join(', ') : null,
        suggested_price: null
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
        title: item.title,
        author: null,
        publisher: item.brand,
        publication_year: null,
        isbn: null,
        description: item.description,
        category: item.category,
        format: 'Magazine/Product',
        genre: item.category,
        suggested_price: null
      };
    }
  } catch (error) {
    console.error('UPC Database API error:', error);
  }
  return null;
}