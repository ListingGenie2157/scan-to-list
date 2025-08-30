import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// eBay API Configuration
const EBAY_CLIENT_ID = Deno.env.get('EBAY_CLIENT_ID');
const EBAY_CLIENT_SECRET = Deno.env.get('EBAY_CLIENT_SECRET');
const EBAY_REDIRECT_URI = Deno.env.get('EBAY_REDIRECT_URI');
const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly'
].join(' ');

// eBay API Endpoints
const EBAY_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'getAuthUrl':
        return handleGetAuthUrl();
      case 'exchangeCode':
        return handleExchangeCode(req);
      case 'refreshToken':
        return handleRefreshToken(req);
      case 'testConnection':
        return handleTestConnection(req);
      default:
        throw new Error('Invalid action specified');
    }
  } catch (error) {
    console.error('Error in ebay-auth function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate eBay authorization URL
function handleGetAuthUrl() {
  if (!EBAY_CLIENT_ID || !EBAY_REDIRECT_URI) {
    throw new Error('eBay configuration missing. Please set EBAY_CLIENT_ID and EBAY_REDIRECT_URI environment variables.');
  }

  const state = crypto.randomUUID();
  
  const authUrl = new URL(EBAY_AUTH_URL);
  authUrl.searchParams.set('client_id', EBAY_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', EBAY_REDIRECT_URI);
  authUrl.searchParams.set('scope', EBAY_SCOPES);
  authUrl.searchParams.set('state', state);

  return new Response(JSON.stringify({
    success: true,
    authUrl: authUrl.toString(),
    state: state,
    scopes: EBAY_SCOPES.split(' ')
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Exchange authorization code for access token
async function handleExchangeCode(req: Request) {
  const { code, state, userId } = await req.json();

  if (!code) {
    throw new Error('Authorization code is required');
  }

  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_REDIRECT_URI) {
    throw new Error('eBay configuration missing');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: EBAY_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`eBay token exchange failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();

  // Store tokens in user profile if userId provided
  if (userId) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Add eBay auth fields to user_profiles if they don't exist
    // This would require a database migration to add: ebay_access_token, ebay_refresh_token, ebay_token_expires_at
    
    await supabase
      .from('user_profiles')
      .update({
        // These fields would need to be added to the database schema
        // ebay_access_token: tokenData.access_token,
        // ebay_refresh_token: tokenData.refresh_token,
        // ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'eBay authentication successful',
    tokenInfo: {
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
      // Don't return actual tokens for security
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Refresh eBay access token
async function handleRefreshToken(req: Request) {
  const { refreshToken } = await req.json();

  if (!refreshToken) {
    throw new Error('Refresh token is required');
  }

  const tokenResponse = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`eBay token refresh failed: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();

  return new Response(JSON.stringify({
    success: true,
    message: 'Token refreshed successfully',
    tokenInfo: {
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Test eBay API connection
async function handleTestConnection(req: Request) {
  const { accessToken } = await req.json();

  if (!accessToken) {
    throw new Error('Access token is required');
  }

  // Test with eBay Browse API (search for a common item)
  const testResponse = await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?q=test', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const isValid = testResponse.ok;
  const statusText = testResponse.statusText;

  return new Response(JSON.stringify({
    success: isValid,
    message: isValid ? 'eBay API connection successful' : `Connection failed: ${statusText}`,
    scopes: EBAY_SCOPES.split(' '),
    status: testResponse.status
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}