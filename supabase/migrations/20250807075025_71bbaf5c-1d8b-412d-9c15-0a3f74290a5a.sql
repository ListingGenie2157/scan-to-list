-- Add new columns for enhanced OCR tracking
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS subtitle text,
ADD COLUMN IF NOT EXISTS series_title text,
ADD COLUMN IF NOT EXISTS edition text,
ADD COLUMN IF NOT EXISTS all_visible_text text,
ADD COLUMN IF NOT EXISTS ocr_quality text,
ADD COLUMN IF NOT EXISTS model_used text,
ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;