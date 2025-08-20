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

    // Check if user has eBay tokens stored
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!profile.ebay_access_token || !profile.ebay_refresh_token) {
      return new Response(JSON.stringify({ error: "eBay not connected" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if token needs refresh (expires within 5 minutes)
    const now = new Date();
    const expiresAt = new Date(profile.ebay_token_expires_at);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt > fiveMinutesFromNow) {
      // Token is still valid
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Token is still valid",
        expires_at: profile.ebay_token_expires_at
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
        refresh_token: profile.ebay_refresh_token,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory"
      })
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error("eBay refresh token error:", errorText);
      
      // If refresh fails, clear the tokens so user can reconnect
      await supabase
        .from('user_profiles')
        .update({
          ebay_access_token: null,
          ebay_refresh_token: null,
          ebay_token_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ error: "Token refresh failed, please reconnect" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const tokenData = await refreshResponse.json();

    // Update the stored tokens
    const newExpiresAt = new Date(now.getTime() + (tokenData.expires_in * 1000));
    
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        ebay_access_token: tokenData.access_token,
        ebay_refresh_token: tokenData.refresh_token || profile.ebay_refresh_token, // Keep old refresh token if not provided
        ebay_token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

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