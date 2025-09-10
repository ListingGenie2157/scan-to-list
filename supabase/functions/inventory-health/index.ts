import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

    const [{ data: items }, { data: photos }, { data: inv } ] = await Promise.all([
      supa.from('items').select('id').eq('user_id', user.id).limit(1),
      supa.from('photos').select('id').eq('user_id', user.id).limit(1),
      supa.from('inventory_items').select('id').eq('user_id', user.id).limit(1),
    ]);

    return new Response(JSON.stringify({
      success: true,
      rls_visible: {
        items: Array.isArray(items) && items.length > 0,
        photos: Array.isArray(photos) && photos.length > 0,
        inventory_items: Array.isArray(inv) && inv.length > 0,
      }
    }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
