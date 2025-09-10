import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json(401, { success: false, error: "Unauthorized" });

    const { itemId, type, sourceUrl } = await req.json();
    if (!itemId || !sourceUrl) return json(400, { success: false, error: "itemId and sourceUrl are required" });

    // Fetch the image server-side to avoid CORS issues
    const res = await fetch(sourceUrl).catch(() => null);
    if (!res || !res.ok) return json(400, { success: false, error: "Failed to fetch source image" });
    const blob = await res.blob();

    // Derive names and paths
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const basePath = `${user.id}/${type || 'book'}/${itemId}`;
    const fileName = `cover-${Date.now()}.${ext}`;

    // Upload original
    const { error: upErr } = await userClient.storage.from('photos').upload(`${basePath}/${fileName}`, blob, {
      cacheControl: '3600', upsert: true, contentType: blob.type || `image/${ext}`
    });
    if (upErr) return json(200, { success: false, error: upErr.message });

    // Create thumb via edge canvas (not supported in Deno runtime). Instead, reuse source for now.
    const thumbName = `cover-${Date.now()}-thumb.${ext}`;
    const { error: upThumbErr } = await userClient.storage.from('photos').upload(`${basePath}/${thumbName}`, blob, {
      cacheControl: '3600', upsert: true, contentType: blob.type || `image/${ext}`
    });
    if (upThumbErr) return json(200, { success: false, error: upThumbErr.message });

    const { data: pub1 } = userClient.storage.from('photos').getPublicUrl(`${basePath}/${fileName}`);
    const { data: pub2 } = userClient.storage.from('photos').getPublicUrl(`${basePath}/${thumbName}`);

    // Record in DB
    const { error: dbErr } = await userClient.from('photos').insert({
      item_id: Number(itemId),
      file_name: fileName,
      storage_path: `${basePath}/${fileName}`,
      public_url: pub1.publicUrl,
      url_public: pub1.publicUrl,
      thumb_url: pub2.publicUrl,
      user_id: user.id,
    });
    if (dbErr) return json(200, { success: false, error: dbErr.message });

    return json(200, { success: true, public_url: pub1.publicUrl, thumb_url: pub2.publicUrl });
  } catch (e) {
    return json(200, { success: false, error: String(e) });
  }
});