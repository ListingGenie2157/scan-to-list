import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selectedItemIds } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Derive the authenticated user from the Authorization header (JWT)
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Build query for inventory items with photo URLs
    let query = supabaseUser
      .from('inventory_items')
      .select(`
        id,
        title,
        suggested_title,
        description,
        ebay_category_id,
        condition_assessment,
        suggested_price,
        photos!inventory_items_photo_id_fkey(public_url)
      `)
      .eq('user_id', user.id);

    // Filter by selected items if provided
    if (selectedItemIds && selectedItemIds.length > 0) {
      query = query.in('id', selectedItemIds);
    }

    const { data: items, error } = await query;

    if (error) {
      throw error;
    }

    if (!items || items.length === 0) {
      throw new Error('No items found to export');
    }

    // Generate CSV headers
    const headers = [
      'Title',
      'Description',
      'CategoryID',
      'ConditionID',
      'StartPrice',
      'Quantity',
      'PicURL',
      'Format',
      'Duration',
      'Location',
      'ShippingProfile',
      'ReturnProfile',
      'PaymentProfile'
    ];

    // Generate CSV rows
    const rows = items.map((item: any) => [
      item.title || item.suggested_title || '',
      item.description || '',
      item.ebay_category_id ?? '',
      '', // ConditionID (left blank unless you map your conditions to eBay IDs)
      item.suggested_price ?? '',
      1,
      (item.photos && item.photos.public_url) || '',
      'FixedPrice',
      'GTC',
      '', // Location
      '', // ShippingProfile
      '', // ReturnProfile
      ''  // PaymentProfile
    ]);

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(field => 
          // Escape fields that contain commas or quotes
          typeof field === 'string' && (field.includes(',') || field.includes('"')) 
            ? `"${field.replace(/"/g, '""')}"` 
            : field
        ).join(',')
      )
    ].join('\n');

    // Store CSV in storage
    const fileName = `inventory_export_${new Date().toISOString().split('T')[0]}_${Date.now()}.csv`;
    const storagePath = `exports/${user.id}/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('exports')
      .upload(storagePath, new Blob([csvContent], { type: 'text/csv' }));

    if (uploadError) {
      throw uploadError;
    }

    // Create a short-lived signed URL for download (private bucket recommended)
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('exports')
      .createSignedUrl(storagePath, 60 * 15); // 15 minutes
    if (signErr) {
      throw signErr;
    }

    // Record export in database
    const { error: recordError } = await supabaseAdmin
      .from('csv_exports')
      .insert({
        user_id: user.id,
        file_name: fileName,
        storage_path: storagePath,
        download_url: signed?.signedUrl || null,
        item_count: items.length
      });

    if (recordError) {
      console.warn('Failed to record export:', recordError);
    }

    return new Response(JSON.stringify({
      success: true,
      download_url: signed?.signedUrl,
      file_name: fileName,
      item_count: items.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in export-inventory-csv function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});