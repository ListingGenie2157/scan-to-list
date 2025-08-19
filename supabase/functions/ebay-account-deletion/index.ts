import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function handles eBay Marketplace Account Deletion notifications
// - GET: responds to the initial challenge with a SHA-256 hash of (challengeCode + verificationToken + endpoint)
// - POST: acknowledges deletion notifications quickly (200) and logs payload

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const verificationToken = Deno.env.get("EBAY_ACCOUNT_DELETION_VERIFY_TOKEN");

// The exact endpoint you configure in eBay. Keep this in sync with what you paste in their portal.
const PUBLIC_ENDPOINT =
  "https://yfynlpwzrxoxcwntigjv.supabase.co/functions/v1/ebay-account-deletion";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!verificationToken) {
      console.error(
        "EBAY_ACCOUNT_DELETION_VERIFY_TOKEN is not set in Supabase secrets"
      );
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);

    // Handle challenge from eBay: GET /?challenge_code=...
    if (req.method === "GET" && url.searchParams.has("challenge_code")) {
      const challengeCode = url.searchParams.get("challenge_code") ?? "";

      // Per eBay docs, hash in this exact order: challengeCode + verificationToken + endpoint
      const input = `${challengeCode}${verificationToken}${PUBLIC_ENDPOINT}`;
      const challengeResponse = await sha256Hex(input);

      return new Response(
        JSON.stringify({ challengeResponse }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle actual deletion notifications
    if (req.method === "POST") {
      const signature = req.headers.get("x-ebay-signature");
      const bodyText = await req.text();

      // Log for audit/debug. In the future we can verify signature using eBay SDKs.
      console.log("eBay deletion notification received", {
        signature,
        body: bodyText,
      });

      // Best-effort cleanup: if body includes a user identifier, delete their eBay oauth tokens
      try {
        const json = JSON.parse(bodyText || "{}");
        const impactedUserId: string | undefined = json?.metadata?.userId || json?.userId || undefined;
        if (impactedUserId) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, serviceKey);
          await supabase.from("oauth_tokens").delete().eq("user_id", impactedUserId).eq("provider", "ebay");
          console.log("Removed ebay oauth_tokens for user", impactedUserId);
        }
      } catch (_e) {
        // ignore if payload format is unexpected
      }

      // Acknowledge receipt immediately
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("Error in ebay-account-deletion function:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});