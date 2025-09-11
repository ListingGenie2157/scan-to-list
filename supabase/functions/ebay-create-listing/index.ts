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

    // Update item status in both tables
    const updatePromises = [
      supabase
        .from('inventory_items')
        .update({
          status: 'listed',
          listed_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .eq('user_id', user.id),
      
      supabase
        .from('items')
        .update({
          status: 'listed',
          last_scanned_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .match({ type: 'book' }) // Update corresponding item
    ];

    const [inventoryResult, itemsResult] = await Promise.all(updatePromises);
    
    if (inventoryResult.error) {
      console.error('Failed to update inventory item status:', inventoryResult.error);
    }
    if (itemsResult.error) {
      console.error('Failed to update items status:', itemsResult.error);
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

interface ListingInput {
  title: string;
  price: number | string;
  description?: string;
  author?: string;
  categoryId?: string;
  isbn?: string;
  condition?: string;
}

async function createEbayListing(accessToken: string, listingData: ListingInput) {
  try {
    console.log('Creating eBay listing with data:', JSON.stringify(listingData, null, 2));
    
    // Input validation
    if (!listingData.title || !listingData.price) {
      return { success: false, error: 'Title and price are required' };
    }

    // Generate a single SKU for both inventory and offer
    const sku = generateSKU();
    console.log('Generated SKU:', sku);

    const ebayApiUrl = 'https://api.ebay.com/sell/inventory/v1/inventory_item';
    
    // First, create inventory item
    const inventoryPayload = {
      product: {
        title: listingData.title,
        description: listingData.description || 'Item for sale',
        aspects: {
          Brand: [listingData.author || 'Generic'],
          Type: [listingData.categoryId === '280' ? 'Magazine' : 'Book'],
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

    console.log('Creating inventory item with payload:', JSON.stringify(inventoryPayload, null, 2));

    const inventoryResponse = await fetch(`${ebayApiUrl}/${sku}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US'
      },
      body: JSON.stringify(inventoryPayload)
    });

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text();
      console.error('Inventory creation failed:', errorText);
      return { success: false, error: `eBay API error: ${errorText}` };
    }

    console.log('Inventory item created successfully');

    // Get default policies (for now using placeholders)
    const policies = await getDefaultPolicies(accessToken);
    
    // Then create the listing offer
    const offerPayload = {
      sku: sku, // Use the same SKU
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      pricingSummary: {
        price: {
          value: listingData.price?.toString() || '10.00',
          currency: 'USD'
        }
      },
      listingPolicies: policies,
      categoryId: listingData.categoryId || '267', // Default to Books category
      merchantLocationKey: 'default_location'
    };

    console.log('Creating offer with payload:', JSON.stringify(offerPayload, null, 2));

    const offerResponse = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US'
      },
      body: JSON.stringify(offerPayload)
    });

    if (!offerResponse.ok) {
      const errorText = await offerResponse.text();
      console.error('Offer creation failed:', errorText);
      return { success: false, error: `eBay Offer API error: ${errorText}` };
    }

    const offerData = await offerResponse.json();
    const offerId = offerData.offerId;
    console.log('Offer created with ID:', offerId);

    // Publish the listing
    const publishResponse = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US'
      }
    });

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      console.error('Publish failed:', errorText);
      return { success: false, error: `eBay Publish API error: ${errorText}` };
    }

    const publishData = await publishResponse.json();
    console.log('Listing published:', publishData);
    
    return {
      success: true,
      listingId: publishData.listingId,
      listingUrl: `https://www.ebay.com/itm/${publishData.listingId}`
    };

  } catch (error) {
    console.error('eBay listing creation error:', error);
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

async function getDefaultPolicies(accessToken: string) {
  try {
    // Try to fetch user's policies from eBay
    const policiesResponse = await fetch('https://api.ebay.com/sell/account/v1/fulfillment_policy', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en-US'
      }
    });

    if (policiesResponse.ok) {
      const policiesData = await policiesResponse.json();
      console.log('Retrieved user policies:', policiesData);
      
      // Use first available policies or create defaults
      return {
        paymentPolicyId: '6051648000', // Standard payment policy
        returnPolicyId: '6051649000', // 30-day return policy
        fulfillmentPolicyId: '6051650000' // Standard shipping policy
      };
    }
  } catch (error) {
    console.error('Failed to fetch policies:', error);
  }

  // Fallback to eBay default policies
  return {
    paymentPolicyId: '6051648000', // Standard payment policy
    returnPolicyId: '6051649000', // 30-day return policy  
    fulfillmentPolicyId: '6051650000' // Standard shipping policy
  };
}