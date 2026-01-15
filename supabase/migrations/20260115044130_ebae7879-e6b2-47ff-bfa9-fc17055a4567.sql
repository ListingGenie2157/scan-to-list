-- Add new columns for customizable title keywords
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS title_keywords text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS shipping_keywords text[] DEFAULT '{}';

-- Update the RPC function to handle new columns
CREATE OR REPLACE FUNCTION update_title_preferences(
  user_id_param uuid,
  prefixes text[] DEFAULT '{}',
  suffixes text[] DEFAULT '{}',
  custom_text text DEFAULT '',
  keywords text[] DEFAULT '{}',
  shipping_kw text[] DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET 
    title_prefixes = prefixes,
    title_suffixes = suffixes,
    custom_title_text = custom_text,
    title_keywords = keywords,
    shipping_keywords = shipping_kw,
    updated_at = now()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;