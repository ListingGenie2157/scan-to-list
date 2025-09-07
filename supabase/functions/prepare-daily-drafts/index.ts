import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DatabaseTypes {
  public: {
    Tables: {
      auto_listing_settings: {
        Row: {
          id: string;
          user_id: string;
          enabled: boolean;
          daily_limit: number;
          schedule_time: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          suggested_price: number;
          status: string;
          isbn: string;
          author: string;
          publisher: string;
          publication_year: number;
          condition_assessment: string;
          created_at: string;
        };
      };
      listing_drafts: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          listing_data: any;
          status: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          item_id: string;
          listing_data: any;
          status?: string;
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient<DatabaseTypes>(supabaseUrl, supabaseServiceKey);

    console.log('Starting daily drafts preparation...');

    // Get all users with auto-listing enabled
    const { data: settings, error: settingsError } = await supabase
      .from('auto_listing_settings')
      .select('*')
      .eq('enabled', true);

    if (settingsError) {
      console.error('Error fetching auto listing settings:', settingsError);
      throw settingsError;
    }

    console.log(`Found ${settings?.length || 0} users with auto-listing enabled`);

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users with auto-listing enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const results = [];

    for (const setting of settings) {
      try {
        console.log(`Processing auto-listing for user ${setting.user_id}`);

        // Check if user already has pending drafts today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingDrafts } = await supabase
          .from('listing_drafts')
          .select('id')
          .eq('user_id', setting.user_id)
          .eq('status', 'pending')
          .gte('created_at', `${today}T00:00:00Z`);

        if (existingDrafts && existingDrafts.length > 0) {
          console.log(`User ${setting.user_id} already has pending drafts today`);
          results.push({
            user_id: setting.user_id,
            status: 'skipped',
            reason: 'Already has pending drafts today'
          });
          continue;
        }

        // Get eligible inventory items (processed, has price, not already listed)
        const { data: items, error: itemsError } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('user_id', setting.user_id)
          .eq('status', 'processed')
          .not('suggested_price', 'is', null)
          .gt('suggested_price', 0)
          .is('listed_at', null)
          .order('created_at', { ascending: true })
          .limit(setting.daily_limit);

        if (itemsError) {
          console.error(`Error fetching items for user ${setting.user_id}:`, itemsError);
          results.push({
            user_id: setting.user_id,
            status: 'error',
            error: itemsError.message
          });
          continue;
        }

        if (!items || items.length === 0) {
          console.log(`No eligible items found for user ${setting.user_id}`);
          results.push({
            user_id: setting.user_id,
            status: 'no_items',
            reason: 'No eligible items found'
          });
          continue;
        }

        console.log(`Found ${items.length} eligible items for user ${setting.user_id}`);

        // Create listing drafts for each item
        const drafts = items.map(item => ({
          user_id: setting.user_id,
          item_id: item.id,
          listing_data: {
            title: item.title || `${item.author} - ${item.isbn}`,
            price: item.suggested_price,
            condition: item.condition_assessment || 'Good',
            description: `${item.title || 'Book'} by ${item.author || 'Unknown Author'}. Published by ${item.publisher || 'Unknown Publisher'} in ${item.publication_year || 'Unknown Year'}. ISBN: ${item.isbn}`,
            isbn: item.isbn,
            author: item.author,
            publisher: item.publisher,
            year: item.publication_year,
            category: 'Books'
          },
          status: 'pending'
        }));

        const { error: insertError } = await supabase
          .from('listing_drafts')
          .insert(drafts);

        if (insertError) {
          console.error(`Error creating drafts for user ${setting.user_id}:`, insertError);
          results.push({
            user_id: setting.user_id,
            status: 'error',
            error: insertError.message
          });
          continue;
        }

        console.log(`Created ${drafts.length} listing drafts for user ${setting.user_id}`);
        
        results.push({
          user_id: setting.user_id,
          status: 'success',
          drafts_created: drafts.length
        });

      } catch (error) {
        console.error(`Error processing user ${setting.user_id}:`, error);
        results.push({
          user_id: setting.user_id,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log('Daily drafts preparation completed:', results);

    return new Response(
      JSON.stringify({
        message: 'Daily drafts preparation completed',
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in prepare-daily-drafts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});