import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") || "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Create Supabase client with user auth
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Extract and verify JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if user has eBay tokens stored in oauth_tokens table
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'ebay')
      .order('created_at', { ascending: false })
      .limit(1);

    if (tokenError) {
      console.error("Error fetching eBay tokens:", tokenError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ error: "eBay not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const ebayToken = tokens[0];

    // Check if token needs refresh (expires within 5 minutes)
    const now = new Date();
    const expiresAt = new Date(ebayToken.expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt > fiveMinutesFromNow) {
      // Token is still valid
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Token is still valid",
        expires_at: ebayToken.expires_at
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Refresh the token
    const refreshResponse = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: ebayToken.refresh_token,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory"
      })
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error("eBay refresh token error:", errorText);
      
      // If refresh fails, delete the invalid tokens so user can reconnect
      await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'ebay');

      return new Response(JSON.stringify({ error: "Token refresh failed, please reconnect" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const tokenData = await refreshResponse.json();

    // Update the stored tokens
    const newExpiresAt = new Date(now.getTime() + (tokenData.expires_in * 1000));
    
    const { error: updateError } = await supabase
      .from('oauth_tokens')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || ebayToken.refresh_token, // Keep old refresh token if not provided
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('provider', 'ebay');

    if (updateError) {
      console.error("Failed to update tokens:", updateError);
      return new Response(JSON.stringify({ error: "Failed to store refreshed token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Token refreshed successfully",
      expires_at: newExpiresAt.toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Refresh token error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});