// ============================================================================
// File: supabase/functions/ebay-create-listing/index.ts
// Purpose: Create actual eBay listings using the eBay Selling API
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      throw new Error('Authorization header missing');
    }

    // Verify the user token
    const token = authorization.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const body = await req.json();
    const { itemId, listingData } = body;

    if (!itemId || !listingData) {
      throw new Error('itemId and listingData are required');
    }

    // Get user's eBay token
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'ebay')
      .single();

    if (tokenError || !tokens?.access_token) {
      throw new Error('eBay authentication required. Please connect your eBay account first.');
    }

    // Create eBay listing using Selling API
    const ebayResponse = await createEbayListing(tokens.access_token, listingData);

    if (!ebayResponse.success) {
      // If token expired, try to refresh it
      if (ebayResponse.error?.includes('token') && tokens.refresh_token) {
        const newToken = await refreshEbayToken(tokens.refresh_token, user.id);
        if (newToken) {
          // Retry with new token
          const retryResponse = await createEbayListing(newToken, listingData);
          if (!retryResponse.success) {
            throw new Error(retryResponse.error || 'Failed to create eBay listing after token refresh');
          }
          ebayResponse = retryResponse;
        } else {
          throw new Error('eBay token expired. Please reconnect your eBay account.');
        }
      } else {
        throw new Error(ebayResponse.error || 'Failed to create eBay listing');
      }
    }

    // Update item status in database
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({
        status: 'listed',
        listed_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to update item status:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      listingId: ebayResponse.listingId,
      listingUrl: ebayResponse.listingUrl,
      message: 'Listing created successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating eBay listing:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to create listing'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function createEbayListing(accessToken: string, listingData: any) {
  try {
    const ebayApiUrl = 'https://api.ebay.com/sell/inventory/v1/inventory_item';
    
    // First, create inventory item
    const inventoryPayload = {
      product: {
        title: listingData.title,
        description: listingData.description,
        aspects: {
          Brand: [listingData.author || 'Generic'],
          Type: ['Book'],
          ...(listingData.isbn && { ISBN: [listingData.isbn] }),
          ...(listingData.condition && { Condition: [listingData.condition] }),
        }
      },
      condition: mapCondition(listingData.condition),
      packageWeightAndSize: {
        dimensions: {
          height: 1,
          length: 8,
          width: 5,
          unit: 'INCH'
        },
        weight: {
          value: 1,
          unit: 'POUND'
        }
      }
    };

    const inventoryResponse = await fetch(`${ebayApiUrl}/${generateSKU()}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US'
      },
      body: JSON.stringify(inventoryPayload)
    });

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text();
      return { success: false, error: `eBay API error: ${errorText}` };
    }

    // Then create the listing offer
    const offerPayload = {
      sku: generateSKU(),
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      pricingSummary: {
        price: {
          value: listingData.price?.toString() || '10.00',
          currency: 'USD'
        }
      },
      listingPolicies: {
        paymentPolicyId: await getDefaultPaymentPolicy(accessToken),
        returnPolicyId: await getDefaultReturnPolicy(accessToken),
        fulfillmentPolicyId: await getDefaultShippingPolicy(accessToken)
      },
      categoryId: listingData.categoryId || '267', // Default to Books category
      merchantLocationKey: 'default_location'
    };

    const offerResponse = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US'
      },
      body: JSON.stringify(offerPayload)
    });

    if (!offerResponse.ok) {
      const errorText = await offerResponse.text();
      return { success: false, error: `eBay Offer API error: ${errorText}` };
    }

    const offerData = await offerResponse.json();
    const offerId = offerData.offerId;

    // Publish the listing
    const publishResponse = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US'
      }
    });

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      return { success: false, error: `eBay Publish API error: ${errorText}` };
    }

    const publishData = await publishResponse.json();
    
    return {
      success: true,
      listingId: publishData.listingId,
      listingUrl: `https://www.ebay.com/itm/${publishData.listingId}`
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function refreshEbayToken(refreshToken: string, userId: string) {
  try {
    // This would call your ebay-refresh-token function
    const { data, error } = await supabase.functions.invoke('ebay-refresh-token', {
      body: { refreshToken, userId }
    });
    
    if (error || !data?.access_token) {
      return null;
    }
    
    return data.access_token;
  } catch {
    return null;
  }
}

function mapCondition(condition: string): string {
  const conditionMap: { [key: string]: string } = {
    'new': 'NEW',
    'like new': 'NEW_OTHER',
    'very good': 'USED_EXCELLENT',
    'good': 'USED_VERY_GOOD',
    'fair': 'USED_GOOD',
    'poor': 'USED_ACCEPTABLE'
  };
  
  return conditionMap[condition?.toLowerCase()] || 'USED_VERY_GOOD';
}

function generateSKU(): string {
  return `ITEM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getDefaultPaymentPolicy(accessToken: string): string {
  // In a real implementation, you'd fetch the user's payment policies
  // For now, return a placeholder that you'd need to set up
  return 'DEFAULT_PAYMENT_POLICY_ID';
}

async function getDefaultReturnPolicy(accessToken: string): string {
  // In a real implementation, you'd fetch the user's return policies
  return 'DEFAULT_RETURN_POLICY_ID';
}

async function getDefaultShippingPolicy(accessToken: string): string {
  // In a real implementation, you'd fetch the user's shipping policies
  return 'DEFAULT_SHIPPING_POLICY_ID';
}