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

    // Try multiple APIs for product lookup
    let productInfo = null;

    // Try Google Books API first (for ISBN barcodes)
    if (barcode.length === 10 || barcode.length === 13) {
      productInfo = await lookupGoogleBooks(barcode);
    }

    // If not found in Google Books, try UPC database
    if (!productInfo) {
      productInfo = await lookupUPCDatabase(barcode);
    }

    // If still not found, try Open Library
    if (!productInfo && (barcode.length === 10 || barcode.length === 13)) {
      productInfo = await lookupOpenLibrary(barcode);
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

async function lookupGoogleBooks(isbn: string) {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      return {
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