import "https://deno.land/x/xhr@0.1.0/mod.ts"; // only needed if a lib expects XHR
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function cleanStr(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "null" || s === "undefined" || s === "" ? null : s;
}

function digitsOnly(v: unknown) {
  const s = cleanStr(v);
  return s ? s.replace(/[^0-9Xx]/g, "") : null; // leave X for ISBN-10 check digits
}

function toIntOrNull(v: unknown) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

interface PriceInfo {
  genre?: string;
  publication_year?: number;
  condition_assessment?: string;
  series_title?: string;
}

function calculatePrice(info: PriceInfo): number {
  const isMagazine = info.genre?.toLowerCase().includes("magazine");
  const isVintage = info.publication_year && info.publication_year < 1990;
  let base = isMagazine ? 8.0 : 15.0;
  const mul: Record<string, number> = { mint: 1.5, excellent: 1.2, good: 1.0, fair: 0.6, poor: 0.4 };
  base *= mul[(info.condition_assessment || "good").toLowerCase()] || 1.0;
  if (isVintage) base *= 1.3;
  if (info.series_title) base *= 1.1;
  return Math.round(base * 100) / 100;
}

// Converts strings like "January 2024" to ISO date format "2024-01-01"
function parseIssueDateToISO(dateStr: string | null): string | null {
  if (!dateStr) return null;
  
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
  
  // Match patterns like "January 2024", "Jan 2024"
  const monthYearMatch = dateStr.match(/([a-zA-Z]+)\s*(\d{4})/i);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2], 10);
    const monthIndex = monthNames.findIndex(m => m.startsWith(monthName.slice(0, 3)));
    if (monthIndex !== -1 && year >= 1900 && year <= 2100) {
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    }
  }
  
  // Match patterns like "2024-01" or "2024/01"
  const yearMonthMatch = dateStr.match(/(\d{4})[-\/](\d{1,2})/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const month = parseInt(yearMonthMatch[2], 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }
  
  // If already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Can't parse - return null to avoid DB error
  return null;
}

const VISION_PROMPT = `Analyze this image and extract information about the book(s), magazine(s), or other items shown.
Return only JSON, matching this schema exactly (no extra keys):
{
  "item_count": number,
  "is_bundle": boolean,
  "bundle_title": string|null,
  "bundle_description": string|null,
  "individual_titles": string[]|null,
  "title": string|null,
  "subtitle": string|null,
  "author": string|null,
  "publisher": string|null,
  "publication_year": number|null,
  "isbn": string|null,
  "genre": string|null,
  "condition_assessment": "mint"|"excellent"|"good"|"fair"|"poor"|null,
  "issue_number": string|null,
  "issue_date": string|null,
  "series_title": string|null,
  "edition": string|null,
  "confidence_score": number,
  "ocr_quality": "good"|"fair"|"poor"|"failed",
  "all_visible_text": string
}

IMPORTANT CLASSIFICATION RULES:
- If you see "Magazine", "Vol.", "Volume", "Issue", "No.", or monthly/quarterly dating, this is likely a MAGAZINE
- If it has an issue number (like "#52", "Issue 12"), it's likely a MAGAZINE  
- If it's a periodical publication (monthly, weekly, quarterly), it's a MAGAZINE
- If it's a standalone book with chapters and ISBN, it's a BOOK
- For magazines: extract issue_number, issue_date, and series_title carefully
- For books: focus on title, author, ISBN, and publication details

Other rules:
- If multiple distinct items: is_bundle=true and fill bundle_* and individual_titles.
- If single item: is_bundle=false; provide standard single-item fields.
- confidence_score in [0,1].
- Be very careful to distinguish between magazines and books based on visual cues`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let requestData: {
      photoId?: string;
      imageUrl?: string;
      batchSettings?: { autoOptimize?: boolean };
    } = {};
    try {
      requestData = await req.json();
    } catch (e) {
      return json(400, { success: false, error: "Invalid JSON in request body", detail: String(e) });
    }

    const photoId = cleanStr(requestData.photoId);
    const imageUrl = cleanStr(requestData.imageUrl);

    if (!photoId || !imageUrl) {
      return json(400, {
        success: false,
        error: "Photo ID and image URL are required",
        received: { hasPhotoId: !!photoId, hasImageUrl: !!imageUrl },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { success: false, error: "Supabase credentials not configured" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!OPENAI_API_KEY) {
      console.log("OPENAI_API_KEY missing - using fallback data");
      // Soft-fail: mark item for manual review, return 200 so the client doesn't see a random non-2xx
      const fallback = {
        title: "API Key Missing - Manual Review Needed",
        genre: "book",
        condition_assessment: "good",
        confidence_score: 0.1,
        suggested_price: 10.0,
        ocr_quality: "failed",
      };
      
      // 1) Try to get user_id and item_id from photo
      const { data: photoRecord } = await supabase
        .from("photos")
        .select("user_id, item_id")
        .eq("id", photoId)
        .maybeSingle();

      let userId = photoRecord?.user_id ?? null;
      if (!userId) {
        const { data: me } = await supabase.auth.getUser();
        userId = me?.user?.id ?? null;
      }
      if (!userId) {
        return json(401, { success: false, error: "Not signed in; cannot write inventory item" });
      }

      console.log(`Processing photo ${photoId} for user ${userId}, existing item_id: ${photoRecord?.item_id}`);

      // 2) Upsert inventory_items
      const { data: inventoryItem, error: upErr } = await supabase
        .from("inventory_items")
        .upsert(
          {
            user_id: userId,
            photo_id: photoId,
            ...fallback,
            processed_at: new Date().toISOString(),
            status: "photographed",
          },
          { onConflict: "user_id,photo_id" }
        )
        .select()
        .maybeSingle();

      if (upErr) {
        console.error("inventory_items upsert failed:", upErr.message);
        return json(200, {
          success: false,
          error: "DB upsert failed",
          detail: upErr.message,
        });
      }

      // 3) Sync to items table
      let itemId = photoRecord?.item_id;
      const itemData = {
        user_id: userId,
        title: fallback.title,
        type: "book",
        status: "draft",
        suggested_price: fallback.suggested_price,
        authors: null,
        year: null,
        isbn13: null,
        updated_at: new Date().toISOString(),
      };

      if (itemId) {
        // Update existing item
        const { error: itemUpdateErr } = await supabase
          .from("items")
          .update(itemData)
          .eq("id", itemId)
          .eq("user_id", userId);
        
        if (itemUpdateErr) {
          console.error("items update failed:", itemUpdateErr.message);
        } else {
          console.log(`Updated existing item ${itemId}`);
        }
      } else {
        // Create new item and link photo
        const { data: newItem, error: itemInsertErr } = await supabase
          .from("items")
          .insert(itemData)
          .select("id")
          .maybeSingle();

        if (itemInsertErr) {
          console.error("items insert failed:", itemInsertErr.message);
        } else if (newItem) {
          itemId = newItem.id;
          console.log(`Created new item ${itemId}`);
          
          // Link photo to new item
          const { error: photoUpdateErr } = await supabase
            .from("photos")
            .update({ item_id: itemId })
            .eq("id", photoId)
            .eq("user_id", userId);
            
          if (photoUpdateErr) {
            console.error("photo item_id update failed:", photoUpdateErr.message);
          } else {
            console.log(`Linked photo ${photoId} to item ${itemId}`);
          }
        }
      }

      return json(200, { success: true, inventoryItem, extractedInfo: fallback, itemId, message: "OPENAI_API_KEY missing" });
    }

    // Call OpenAI Vision
    const modelNames = ["gpt-4o-mini", "gpt-4o"]; // try mini first, then full
    let resp: Response | null = null;
    let modelUsed: string | null = null;

    for (const model of modelNames) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: 900,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VISION_PROMPT },
                { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              ],
            },
          ],
        }),
      }).catch(() => null);

      if (r && r.ok) { resp = r; modelUsed = model; break; }
    }

    if (!resp || !resp.ok) {
      const errText = resp ? await resp.text() : "no response";
      console.log("OpenAI API call failed:", errText);
      
      // Soft-fail with DB update so your UI gets a 200 and a reason
      const fallback = {
        title: "OCR Processing Failed - Manual Review Needed",
        genre: "book",
        condition_assessment: "good",
        confidence_score: 0.1,
        suggested_price: 10.0,
        ocr_quality: "failed",
      };
      
      // 1) Try to get user_id and item_id from photo
      const { data: photoRecord } = await supabase
        .from("photos")
        .select("user_id, item_id")
        .eq("id", photoId)
        .maybeSingle();

      let userId = photoRecord?.user_id ?? null;
      if (!userId) {
        const { data: me } = await supabase.auth.getUser();
        userId = me?.user?.id ?? null;
      }
      if (!userId) {
        return json(401, { success: false, error: "Not signed in; cannot write inventory item" });
      }

      console.log(`Processing failed photo ${photoId} for user ${userId}, existing item_id: ${photoRecord?.item_id}`);

      // 2) Upsert inventory_items
      const { data: inventoryItem, error: upErr } = await supabase
        .from("inventory_items")
        .upsert(
          {
            user_id: userId,
            photo_id: photoId,
            ...fallback,
            ocr_error: errText?.slice(0, 500) ?? null,
            processed_at: new Date().toISOString(),
            status: "photographed",
          },
          { onConflict: "user_id,photo_id" }
        )
        .select()
        .maybeSingle();

      if (upErr) {
        console.error("inventory_items upsert failed:", upErr.message);
        return json(200, {
          success: false,
          error: "DB upsert failed",
          detail: upErr.message,
        });
      }

      // 3) Sync to items table
      let itemId = photoRecord?.item_id;
      const itemData = {
        user_id: userId,
        title: fallback.title,
        type: "book",
        status: "draft",
        suggested_price: fallback.suggested_price,
        authors: null,
        year: null,
        isbn13: null,
        updated_at: new Date().toISOString(),
      };

      if (itemId) {
        // Update existing item
        const { error: itemUpdateErr } = await supabase
          .from("items")
          .update(itemData)
          .eq("id", itemId)
          .eq("user_id", userId);
        
        if (itemUpdateErr) {
          console.error("items update failed:", itemUpdateErr.message);
        } else {
          console.log(`Updated existing item ${itemId}`);
        }
      } else {
        // Create new item and link photo
        const { data: newItem, error: itemInsertErr } = await supabase
          .from("items")
          .insert(itemData)
          .select("id")
          .maybeSingle();

        if (itemInsertErr) {
          console.error("items insert failed:", itemInsertErr.message);
        } else if (newItem) {
          itemId = newItem.id;
          console.log(`Created new item ${itemId}`);
          
          // Link photo to new item
          const { error: photoUpdateErr } = await supabase
            .from("photos")
            .update({ item_id: itemId })
            .eq("id", photoId)
            .eq("user_id", userId);
            
          if (photoUpdateErr) {
            console.error("photo item_id update failed:", photoUpdateErr.message);
          } else {
            console.log(`Linked photo ${photoId} to item ${itemId}`);
          }
        }
      }

      return json(200, { success: true, inventoryItem, extractedInfo: fallback, itemId, message: `OCR failed: ${errText}` });
    }

    const body = await resp.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      return json(200, { success: true, message: "Vision returned no content", raw: body });
    }

    // Because response_format=json_object, content should be valid JSON
    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(content) as Record<string, unknown>;
    } catch {
      extracted = {};
    }

    const cleaned = {
      item_count: toIntOrNull(extracted.item_count) ?? 1,
      is_bundle: Boolean(extracted.is_bundle),
      bundle_title: cleanStr(extracted.bundle_title as string | undefined),
      bundle_description: cleanStr(extracted.bundle_description as string | undefined),
      individual_titles: Array.isArray(extracted.individual_titles)
        ? (extracted.individual_titles as unknown[]).map(String)
        : null,
      title: cleanStr(extracted.title as string | undefined),
      subtitle: cleanStr(extracted.subtitle as string | undefined),
      author:
        cleanStr(extracted.author as string | undefined) ||
        (extracted.is_bundle ? "Various" : null),
      publisher:
      cleanStr(extracted.publisher as string | undefined) ||
        (extracted.is_bundle ? "Various" : null),
      publication_year: toIntOrNull(extracted.publication_year),
      isbn: digitsOnly(extracted.isbn as string | undefined),
      genre: cleanStr(extracted.genre as string | undefined) || "book",
      condition_assessment:
        cleanStr(extracted.condition_assessment as string | undefined) ||
        "good",
      issue_number: cleanStr(extracted.issue_number as string | undefined),
      issue_date: cleanStr(extracted.issue_date as string | undefined),
      series_title: cleanStr(extracted.series_title as string | undefined),
      edition: cleanStr(extracted.edition as string | undefined),
      confidence_score: Math.max(
        0.1,
        Math.min(1, Number(extracted.confidence_score ?? 0.7)),
      ),
      ocr_quality:
        cleanStr(extracted.ocr_quality as string | undefined) || "unknown",
      all_visible_text:
        cleanStr(extracted.all_visible_text as string | undefined) || "",
      model_used: modelUsed,
    } as const;

    const suggested_price = calculatePrice(cleaned);
    console.log(`OCR extraction successful for photo ${photoId}, model: ${modelUsed}`);

    // Check if auto-optimization is enabled in batch settings
    const batchSettings = requestData.batchSettings;
    const shouldAutoOptimize = batchSettings?.autoOptimize === true;

    // 1) Try to get user_id and item_id from photo
    const { data: photoRecord } = await supabase
      .from("photos")
      .select("user_id, item_id")
      .eq("id", photoId)
      .maybeSingle();

    let userId = photoRecord?.user_id ?? null;
    if (!userId) {
      const { data: me } = await supabase.auth.getUser();
      userId = me?.user?.id ?? null;
    }
    if (!userId) {
      return json(401, { success: false, error: "Not signed in; cannot write inventory item" });
    }

    console.log(`Processing photo ${photoId} for user ${userId}, existing item_id: ${photoRecord?.item_id}`);

    // 2) Upsert inventory_items with proper category classification
    const suggested_category = (cleaned.genre?.toLowerCase().includes("magazine") || cleaned.issue_number) ? "magazine" : "book";
    
    const { data: inventoryItem, error: dbErr } = await supabase
      .from("inventory_items")
      .upsert({
        user_id: userId,
        photo_id: photoId,
        title: cleaned.title,
        subtitle: cleaned.subtitle,
        author: cleaned.author,
        publisher: cleaned.publisher,
        publication_year: cleaned.publication_year,
        isbn: cleaned.isbn,
        genre: cleaned.genre,
        condition_assessment: cleaned.condition_assessment,
        suggested_price,
        suggested_category,
        confidence_score: cleaned.confidence_score,
        issue_number: cleaned.issue_number,
        issue_date: parseIssueDateToISO(cleaned.issue_date),
        series_title: cleaned.series_title,
        edition: cleaned.edition,
        status: "processed",
        extracted_text: content,
        all_visible_text: cleaned.all_visible_text,
        ocr_quality: cleaned.ocr_quality,
        model_used: cleaned.model_used,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,photo_id"
      })
      .select()
      .maybeSingle();

    if (dbErr) {
      console.error("inventory_items upsert failed:", dbErr.message);
      return json(200, { success: false, error: "DB update failed", detail: dbErr.message, extractedInfo: cleaned });
    }

    // 3) Sync to items table - map fields according to schema
    let itemId = photoRecord?.item_id;
    const itemData = {
      user_id: userId,
      title: cleaned.title || "Untitled",
      type: (cleaned.genre?.toLowerCase().includes("magazine")) ? "magazine" : "book",
      status: "processed",
      suggested_price,
      authors: cleaned.author ? [cleaned.author] : null,
      year: cleaned.publication_year ? String(cleaned.publication_year) : null,
      isbn13: cleaned.isbn && cleaned.isbn.length === 13 ? cleaned.isbn : null,
      publisher: cleaned.publisher,
      description: cleaned.all_visible_text?.slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    };

    if (itemId) {
      // Update existing item
      const { error: itemUpdateErr } = await supabase
        .from("items")
        .update(itemData)
        .eq("id", itemId)
        .eq("user_id", userId);
      
      if (itemUpdateErr) {
        console.error("items update failed:", itemUpdateErr.message);
      } else {
        console.log(`Updated existing item ${itemId} with OCR data`);
      }
    } else {
      // Create new item and link photo
      const { data: newItem, error: itemInsertErr } = await supabase
        .from("items")
        .insert(itemData)
        .select("id")
        .maybeSingle();

      if (itemInsertErr) {
        console.error("items insert failed:", itemInsertErr.message);
      } else if (newItem) {
        itemId = newItem.id;
        console.log(`Created new item ${itemId} with OCR data`);
        
        // Link photo to new item
        const { error: photoUpdateErr } = await supabase
          .from("photos")
          .update({ item_id: itemId })
          .eq("id", photoId)
          .eq("user_id", userId);
          
        if (photoUpdateErr) {
          console.error("photo item_id update failed:", photoUpdateErr.message);
        } else {
          console.log(`Linked photo ${photoId} to item ${itemId}`);
        }
      }
    }

    // If auto-optimization is enabled, call generate-ebay-listing
    if (shouldAutoOptimize && inventoryItem) {
      console.log(`Auto-optimizing item ${inventoryItem.id} after OCR completion`);
      
      try {
        const { data: optimizeResult, error: optimizeError } = await supabase.functions.invoke('generate-ebay-listing', {
          body: {
            itemData: {
              title: cleaned.title,
              author: cleaned.author,
              publisher: cleaned.publisher,
              publication_year: cleaned.publication_year,
              condition: cleaned.condition_assessment,
              category: suggested_category,
              isbn: cleaned.isbn,
              genre: cleaned.genre,
              issue_number: cleaned.issue_number,
              issue_date: cleaned.issue_date
            },
            userId: userId
          }
        });

        if (optimizeError) {
          console.error('Auto-optimization failed:', optimizeError);
        } else if (optimizeResult?.success && optimizeResult?.optimizedListing) {
          console.log('Auto-optimization successful, updating inventory item');
          
          // Update inventory item with optimized data
          const optimizeUpdatePayload: Record<string, unknown> = {
            suggested_title: optimizeResult.optimizedListing.title,
            description: optimizeResult.optimizedListing.description,
          };

          if (optimizeResult.optimizedListing.price) {
            (optimizeUpdatePayload as { suggested_price?: number }).suggested_price =
              optimizeResult.optimizedListing.price;
          }

          await supabase
            .from('inventory_items')
            .update(optimizeUpdatePayload)
            .eq('id', inventoryItem.id);
            
          console.log(`Auto-optimized item ${inventoryItem.id} with AI-generated content`);
        }
      } catch (optimizeErr) {
        console.error('Auto-optimization exception:', optimizeErr);
      }
    }

    return json(200, {
      success: true,
      inventoryItem,
      itemId,
      extractedInfo: { ...cleaned, suggested_price },
      autoOptimized: shouldAutoOptimize
    });
  } catch (e) {
    // Final safety net: never leak a bare 500 without context
    return json(200, { success: false, error: "Unhandled exception", detail: String(e) });
  }
});
