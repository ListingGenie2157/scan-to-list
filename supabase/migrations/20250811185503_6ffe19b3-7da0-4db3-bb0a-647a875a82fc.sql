-- Add suggested_price to items for pricing
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS suggested_price numeric;

-- Optional: ensure status allows 'processed' and 'draft' already exist; no change needed