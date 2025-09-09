import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DatabaseTypes {
  public: {
    Tables: {
      listing_drafts: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          listing_data: any;
          status: string;
          created_at: string;
          approved_at: string;
          listed_at: string;
          ebay_listing_id: string;
        };
        Update: {
          status?: string;
          approved_at?: string;
          listed_at?: string;
          ebay_listing_id?: string;
        };
      };
      inventory_items: {
        Update: {
          status?: string;
          listed_at?: string;
        };
      };
      oauth_tokens: {
        Row: {
          user_id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string;
        };
      };
    };
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient<DatabaseTypes>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { draftId, action } = await req.json();

    if (!draftId || !action || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid draftId or action' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing ${action} for draft ${draftId} by user ${user.id}`);

    // Get the draft
    const { data: draft, error: draftError } = await supabase
      .from('listing_drafts')
      .select('*')
      .eq('id', draftId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (draftError || !draft) {
      return new Response(
        JSON.stringify({ error: 'Draft not found or not pending' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (action === 'reject') {
      // Simply mark as rejected
      const { error: updateError } = await supabase
        .from('listing_drafts')
        .update({
          status: 'rejected',
          approved_at: new Date().toISOString()
        })
        .eq('id', draftId);

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({ message: 'Draft rejected successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // For approval, mark as approved and attempt to create eBay listing
    const { error: approveError } = await supabase
      .from('listing_drafts')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', draftId);

    if (approveError) {
      throw approveError;
    }

    // Attempt to create eBay listing
    try {
      console.log('Creating eBay listing for approved draft...');
      
      // Call the existing eBay listing creation function
      const { data: listingResult, error: listingError } = await supabase.functions.invoke(
        'generate-ebay-listing',
        {
          body: {
            itemId: draft.item_id,
            listingData: draft.listing_data
          }
        }
      );

      if (listingError) {
        console.error('Error creating eBay listing:', listingError);
        // Mark as failed but keep approved status
        await supabase
          .from('listing_drafts')
          .update({ status: 'failed' })
          .eq('id', draftId);

        return new Response(
          JSON.stringify({
            message: 'Draft approved but eBay listing failed',
            error: listingError.message
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Update draft with listing success
      const { error: listingUpdateError } = await supabase
        .from('listing_drafts')
        .update({
          status: 'listed',
          listed_at: new Date().toISOString(),
          ebay_listing_id: listingResult?.listingId
        })
        .eq('id', draftId);

      if (listingUpdateError) {
        console.error('Error updating draft with listing info:', listingUpdateError);
      }

      // Update inventory item status
      const { error: itemUpdateError } = await supabase
        .from('inventory_items')
        .update({
          status: 'listed',
          listed_at: new Date().toISOString()
        })
        .eq('id', draft.item_id);

      if (itemUpdateError) {
        console.error('Error updating inventory item:', itemUpdateError);
      }

      console.log('eBay listing created successfully');

      return new Response(
        JSON.stringify({
          message: 'Draft approved and listed successfully',
          listingId: listingResult?.listingId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );

    } catch (error) {
      console.error('Error in eBay listing creation:', error);
      
      // Mark as failed
      await supabase
        .from('listing_drafts')
        .update({ status: 'failed' })
        .eq('id', draftId);

      return new Response(
        JSON.stringify({
          message: 'Draft approved but eBay listing failed',
          error: error.message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

  } catch (error) {
    console.error('Error in approve-listing-draft:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
