import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID"); // PROD
const CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET"); // PROD
const admin = createClient(SUPABASE_URL, SRV);
const PROVIDER = "ebay_app_prod_browse";
Deno.serve(async ()=>{
  try {
    // reuse if not expiring in next 60s
    const now = Date.now() + 60_000;
    const { data } = await admin.from("service_tokens").select("*").eq("provider", PROVIDER).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > now) {
      return new Response(JSON.stringify({
        access_token: data.access_token
      }), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope/buy.browse"
    });
    const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`
      },
      body: body.toString()
    });
    const tokenData = await response.json();
    if (!response.ok) {
      throw new Error(`${response.status}: ${JSON.stringify(tokenData)}`);
    }
    const expires_at = new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000).toISOString();
    await admin.from("service_tokens").upsert({
      provider: PROVIDER,
      access_token: tokenData.access_token,
      expires_at
    });
    return new Response(JSON.stringify({
      access_token: tokenData.access_token
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: String(error)
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
