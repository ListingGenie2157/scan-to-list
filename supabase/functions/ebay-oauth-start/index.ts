// functions/ebay-oauth-start/index.ts
// Supabase Edge Function (Deno): builds eBay consent URL using RuName and redirects.
// Adds optional ?r=<return-url> and ?user=<id|email> into state (validated/whitelisted).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") ?? "";
const EBAY_SCOPES = (Deno.env.get("EBAY_SCOPES") ?? "https://api.ebay.com/oauth/api_scope")
  .trim()
  .replace(/\s+/g, " ");
const EBAY_REDIRECT_RUNAME = Deno.env.get("EBAY_REDIRECT_RUNAME") ?? ""; // e.g. YourApp-Prod-1234567890123

// Comma-separated list of allowed return origins, e.g. "https://app.example.com,https://example.pages.dev"
const RETURN_ORIGINS = (Deno.env.get("RETURN_ORIGINS") ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function envError(): string | null {
  if (!EBAY_CLIENT_ID) return "Missing EBAY_CLIENT_ID";
  if (!EBAY_REDIRECT_RUNAME) return "Missing EBAY_REDIRECT_RUNAME (RuName)";
  if (!EBAY_SCOPES) return "Missing EBAY_SCOPES";
  return null;
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validateReturnUrl(raw: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https:$/.test(u.protocol)) return null;
  if (!RETURN_ORIGINS.length) return null;
  const origin = `${u.protocol}//${u.host}`;
  if (!RETURN_ORIGINS.includes(origin)) return null;
  return u.toString();
}

function sanitizeUser(raw: string | null): string | null {
  if (!raw) return null;
  // 64 safe chars max; drop anything sketchy
  const safe = raw.trim().slice(0, 64).replace(/[^a-zA-Z0-9._@\-:]/g, "");
  return safe || null;
}

function buildConsentUrl(stateParam: string): string {
  const u = new URL("https://auth.ebay.com/oauth2/authorize");
  u.searchParams.set("client_id", EBAY_CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", EBAY_REDIRECT_RUNAME); // RuName, not a URL
  u.searchParams.set("scope", EBAY_SCOPES);
  u.searchParams.set("state", stateParam);
  return u.toString();
}

serve(async (req) => {
  try {
    // Preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    // Only GET
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ success: false, error: "Method Not Allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    if (url.pathname !== "/" && url.pathname !== "/start") {
      return new Response(
        JSON.stringify({ success: false, error: "Not Found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const envErr = envError();
    if (envErr) {
      return new Response(
        JSON.stringify({ success: false, error: envErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Optional hints from app
    const r = validateReturnUrl(url.searchParams.get("r"));
    const user = sanitizeUser(url.searchParams.get("user"));

    // CSRF nonce; cookie-compare this in the callback
    const nonce = crypto.randomUUID();

    // Compose state payload
    const statePayload = {
      n: nonce,
      r: r || undefined,      // optional return URL
      u: user || undefined,   // optional user hint (id/email)
      v: 1,                   // schema version
    };
    const stateParam = base64urlEncode(JSON.stringify(statePayload));

    // Cookie: only store nonce to compare later
    const cookie = [
      `ebay_oauth_state=${nonce}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Secure",
      "Max-Age=600",
    ].join("; ");

    const consent = buildConsentUrl(stateParam);

    return new Response(null, {
      status: 303, // See Other; avoids odd method reuse
      headers: {
        ...corsHeaders,
        "Set-Cookie": cookie,
        "Location": consent,
        "Access-Control-Expose-Headers": "Location",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "UNEXPECTED_ERROR", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
