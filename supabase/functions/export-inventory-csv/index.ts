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
    const { selectedItemIds, userId } = await req.json();
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query for inventory items with photo URLs
    let query = supabase
      .from('inventory_items')
      .select(`
        id,
        title,
        description,
        publisher,
        publication_year,
        genre,
        topic,
        suggested_price,
        photos!inventory_items_photo_id_fkey(public_url)
      `)
      .eq('user_id', userId);

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
      'Publication Name',
      'Publication Year',
      'Genre',
      'Topic',
      'Picture URL',
      'Starting Price'
    ];

    // Generate CSV rows
    const rows = items.map(item => [
      item.title || '',
      item.description || '',
      item.publisher || '',
      item.publication_year || '',
      item.genre || '',
      item.topic || '',
      (item.photos && item.photos.public_url) || '',
      item.suggested_price || ''
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
    const storagePath = `exports/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(storagePath, new Blob([csvContent], { type: 'text/csv' }));

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('exports')
      .getPublicUrl(storagePath);

    // Record export in database
    const { error: recordError } = await supabase
      .from('csv_exports')
      .insert({
        user_id: userId,
        file_name: fileName,
        storage_path: storagePath,
        download_url: publicUrl,
        item_count: items.length
      });

    if (recordError) {
      console.warn('Failed to record export:', recordError);
    }

    return new Response(JSON.stringify({
      success: true,
      download_url: publicUrl,
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