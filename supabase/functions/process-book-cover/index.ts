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

function calculatePrice(info: any): number {
  const isMagazine = info.genre?.toLowerCase().includes("magazine");
  const isVintage = info.publication_year && info.publication_year < 1990;
  let base = isMagazine ? 8.0 : 15.0;
  const mul: Record<string, number> = { mint: 1.5, excellent: 1.2, good: 1.0, fair: 0.6, poor: 0.4 };
  base *= mul[(info.condition_assessment || "good").toLowerCase()] || 1.0;
  if (isVintage) base *= 1.3;
  if (info.series_title) base *= 1.1;
  return Math.round(base * 100) / 100;
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
Rules:
- If multiple distinct items: is_bundle=true and fill bundle_* and individual_titles.
- If single item: is_bundle=false; provide standard single-item fields.
- confidence_score in [0,1].
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    let requestData: any = null;
    try {
      requestData = await req.json();
    } catch (e) {
      return json(400, { success: false, error: "Invalid JSON in request body", detail: String(e) });
    }

    const photoId = cleanStr(requestData?.photoId);
    const imageUrl = cleanStr(requestData?.imageUrl);

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
      // Soft-fail: mark item for manual review, return 200 so the client doesn't see a random non-2xx
      const fallback = {
        title: "API Key Missing - Manual Review Needed",
        genre: "book",
        condition_assessment: "good",
        confidence_score: 0.1,
        suggested_price: 10.0,
        ocr_quality: "failed",
      };
      // Get user_id from photo record first
      const { data: photoRecord } = await supabase
        .from("photos")
        .select("user_id")
        .eq("id", photoId)
        .single();

      const { data: inventoryItem } = await supabase
        .from("inventory_items")
        .upsert({
          user_id: photoRecord?.user_id,
          photo_id: photoId,
          ...fallback,
          processed_at: new Date().toISOString()
        }, {
          onConflict: 'photo_id'
        })
        .select()
        .single();
      return json(200, { success: true, inventoryItem, extractedInfo: fallback, message: "OPENAI_API_KEY missing" });
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
      // Soft-fail with DB update so your UI gets a 200 and a reason
      const fallback = {
        title: "OCR Processing Failed - Manual Review Needed",
        genre: "book",
        condition_assessment: "good",
        confidence_score: 0.1,
        suggested_price: 10.0,
        ocr_quality: "failed",
      };
      // Get user_id from photo record first
      const { data: photoRecord } = await supabase
        .from("photos")
        .select("user_id")
        .eq("id", photoId)
        .single();

      const { data: inventoryItem } = await supabase
        .from("inventory_items")
        .upsert({
          user_id: photoRecord?.user_id,
          photo_id: photoId,
          ...fallback,
          processed_at: new Date().toISOString()
        }, {
          onConflict: 'photo_id'
        })
        .select()
        .single();
      return json(200, { success: true, inventoryItem, extractedInfo: fallback, message: `OCR failed: ${errText}` });
    }

    const body = await resp.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      return json(200, { success: true, message: "Vision returned no content", raw: body });
    }

    // Because response_format=json_object, content should be valid JSON
    let extracted: any = {};
    try { extracted = JSON.parse(content); } catch { extracted = {}; }

    const cleaned = {
      item_count: toIntOrNull(extracted.item_count) ?? 1,
      is_bundle: Boolean(extracted.is_bundle),
      bundle_title: cleanStr(extracted.bundle_title),
      bundle_description: cleanStr(extracted.bundle_description),
      individual_titles: Array.isArray(extracted.individual_titles) ? extracted.individual_titles : null,
      title: cleanStr(extracted.title),
      subtitle: cleanStr(extracted.subtitle),
      author: cleanStr(extracted.author) || (extracted.is_bundle ? "Various" : null),
      publisher: cleanStr(extracted.publisher) || (extracted.is_bundle ? "Various" : null),
      publication_year: toIntOrNull(extracted.publication_year),
      isbn: digitsOnly(extracted.isbn),
      genre: cleanStr(extracted.genre) || "book",
      condition_assessment: cleanStr(extracted.condition_assessment) || "good",
      issue_number: cleanStr(extracted.issue_number),
      issue_date: cleanStr(extracted.issue_date),
      series_title: cleanStr(extracted.series_title),
      edition: cleanStr(extracted.edition),
      confidence_score: Math.max(0.1, Math.min(1, Number(extracted.confidence_score ?? 0.7))),
      ocr_quality: cleanStr(extracted.ocr_quality) || "unknown",
      all_visible_text: cleanStr(extracted.all_visible_text) || "",
      model_used: modelUsed,
    } as const;

    const suggested_price = calculatePrice(cleaned);

    // First, get the photo record to get the user_id
    const { data: photoRecord, error: photoErr } = await supabase
      .from("photos")
      .select("user_id")
      .eq("id", photoId)
      .single();

    if (photoErr || !photoRecord) {
      return json(200, { success: false, error: "Photo not found", detail: photoErr?.message, extractedInfo: cleaned });
    }

    // Use upsert to either insert new inventory item or update existing one
    const { data: inventoryItem, error: dbErr } = await supabase
      .from("inventory_items")
      .upsert({
        user_id: photoRecord.user_id,
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
        confidence_score: cleaned.confidence_score,
        issue_number: cleaned.issue_number,
        issue_date: cleaned.issue_date,
        series_title: cleaned.series_title,
        edition: cleaned.edition,
        status: "photographed",
        extracted_text: content,
        all_visible_text: cleaned.all_visible_text,
        ocr_quality: cleaned.ocr_quality,
        model_used: cleaned.model_used,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: 'photo_id'
      })
      .select()
      .single();

    if (dbErr) {
      // Still return 200 with a descriptive payload so the client doesn't just see "non-2xx"
      return json(200, { success: false, error: "DB update failed", detail: dbErr.message, extractedInfo: cleaned });
    }

    return json(200, {
      success: true,
      inventoryItem,
      extractedInfo: { ...cleaned, suggested_price },
    });
  } catch (e) {
    // Final safety net: never leak a bare 500 without context
    return json(200, { success: false, error: "Unhandled exception", detail: String(e) });
  }
});
