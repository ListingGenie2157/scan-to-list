-- Create core tables for the inventory system

-- Items table (legacy)
CREATE TABLE public.items (
  id serial PRIMARY KEY,
  title text,
  authors jsonb,
  publisher text,
  year text,
  isbn10 text,
  isbn13 text,
  description text,
  categories jsonb,
  cover_url_ext text,
  suggested_price numeric,
  quantity integer DEFAULT 1,
  status text DEFAULT 'draft',
  type text DEFAULT 'book',
  source text,
  last_scanned_at timestamp with time zone,
  bundle_id uuid,
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bundles table
CREATE TABLE public.bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_name text NOT NULL,
  bundle_type text,
  bundle_price numeric,
  total_items integer,
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Photos table
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  url_public text,
  thumb_url text,
  file_size integer,
  item_id integer,
  batch_id uuid,
  user_id uuid,
  uploaded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Processing batches table
CREATE TABLE public.processing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_images integer NOT NULL,
  processed_images integer DEFAULT 0,
  status text DEFAULT 'pending',
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Inventory items table (main table)
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  subtitle text,
  author text,
  publisher text,
  publication_year integer,
  isbn text,
  format text,
  genre text,
  topic text,
  description text,
  condition_assessment text,
  suggested_price numeric,
  suggested_category text,
  suggested_title text,
  ebay_category_id integer,
  status text DEFAULT 'draft',
  confidence_score numeric,
  extracted_text jsonb,
  edition text,
  series_title text,
  edition_info text,
  issue_number text,
  issue_date text,
  all_visible_text text,
  ocr_quality text,
  model_used text,
  processed_at timestamp with time zone,
  listed_at timestamp with time zone,
  sold_at timestamp with time zone,
  is_bundle_parent boolean DEFAULT false,
  bundle_id uuid,
  photo_id uuid,
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Extractions table
CREATE TABLE public.extractions (
  id serial PRIMARY KEY,
  item_id integer,
  ocr_text text,
  parsed_json jsonb,
  confidence numeric,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- OAuth tokens table
CREATE TABLE public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamp with time zone,
  scope text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CSV exports table
CREATE TABLE public.csv_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  item_count integer NOT NULL,
  download_url text,
  storage_path text,
  expires_at timestamp with time zone,
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Listing queues table
CREATE TABLE public.listing_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  queue_date date NOT NULL,
  priority_score numeric,
  status text DEFAULT 'pending',
  user_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Add foreign key constraints (non-user_profiles references)
ALTER TABLE public.items 
  ADD CONSTRAINT items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.bundles(id);

ALTER TABLE public.photos 
  ADD CONSTRAINT photos_item_fkey FOREIGN KEY (item_id) REFERENCES public.items(id),
  ADD CONSTRAINT photos_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.processing_batches(id);

ALTER TABLE public.inventory_items 
  ADD CONSTRAINT fk_bundle_id FOREIGN KEY (bundle_id) REFERENCES public.bundles(id),
  ADD CONSTRAINT inventory_items_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id);

ALTER TABLE public.extractions 
  ADD CONSTRAINT extractions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE public.listing_queues 
  ADD CONSTRAINT listing_queues_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);

-- Enable RLS on all tables
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csv_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_queues ENABLE ROW LEVEL SECURITY;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_batches_updated_at
  BEFORE UPDATE ON public.processing_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();