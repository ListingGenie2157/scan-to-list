import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const keyFromPublicUrl = (url: string) => {
  try {
    const p = new URL(url).pathname;
    const i = p.indexOf("/storage/v1/object/public/photos/");
    if (i === -1) return null;
    return p.slice(i + "/storage/v1/object/public/photos/".length);
  } catch {
    return null;
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("POST only", { status: 405, headers: corsHeaders });
  }

  try {
    const { item_ids = [], hard = true } = await req.json().catch(() => ({}));

    // Authenticate user via Authorization header
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return new Response(JSON.stringify({ error: "item_ids required" }), { status: 400, headers: corsHeaders });
    }

    // Fetch inventory items owned by the authenticated user
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, photo_id, user_id")
      .in("id", item_ids)
      .eq("user_id", user.id);

    if (itemsErr) {
      return new Response(JSON.stringify({ error: itemsErr.message }), { status: 500, headers: corsHeaders });
    }

    const ownedItemIds = (items || []).map((it: any) => it.id);
    const photoIds = (items || []).map((it: any) => it.photo_id).filter((id: string | null) => !!id);

    // Fetch photos owned by the user to get storage paths
    const { data: photos, error: photosErr } = await supabaseAdmin
      .from("photos")
      .select("id, public_url, storage_path, user_id")
      .in("id", photoIds)
      .eq("user_id", user.id);

    if (photosErr) {
      return new Response(JSON.stringify({ error: photosErr.message }), { status: 500, headers: corsHeaders });
    }

    const keys = (photos || [])
      .map((r: any) => (r.storage_path ? r.storage_path : keyFromPublicUrl(r.public_url || "")))
      .filter((k: string | null): k is string => !!k);

    // delete storage files first (ignore missing)
    if (hard && keys.length) {
      await supabaseAdmin.storage.from("photos").remove(keys);
    }

    // DB deletes
    if (photoIds.length) {
      await supabaseAdmin.from("photos").delete().in("id", photoIds).eq("user_id", user.id);
    }
    const { error: delInvErr } = await supabaseAdmin.from("inventory_items").delete().in("id", ownedItemIds).eq("user_id", user.id);
    if (delInvErr) {
      return new Response(JSON.stringify({ error: delInvErr.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: { items: ownedItemIds.length, photos: photoIds.length, files: keys.length } }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (e: any) {
    console.error("delete-items error", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), { status: 500, headers: corsHeaders });
  }
});
