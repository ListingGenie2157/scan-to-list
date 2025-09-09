-- Add Amazon ASIN fields to inventory_items table
ALTER TABLE public.inventory_items 
ADD COLUMN amazon_asin text,
ADD COLUMN amazon_match_confidence numeric,
ADD COLUMN amazon_title text;