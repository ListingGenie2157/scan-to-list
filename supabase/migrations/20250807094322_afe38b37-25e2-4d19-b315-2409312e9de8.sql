-- Add title preferences to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN title_prefixes text[] DEFAULT '{}',
ADD COLUMN title_suffixes text[] DEFAULT '{}',
ADD COLUMN custom_title_text text DEFAULT '';

-- Create a function to update user preferences
CREATE OR REPLACE FUNCTION update_title_preferences(
  user_id_param uuid,
  prefixes text[] DEFAULT '{}',
  suffixes text[] DEFAULT '{}', 
  custom_text text DEFAULT ''
)
RETURNS void AS $$
BEGIN
  UPDATE public.user_profiles 
  SET 
    title_prefixes = prefixes,
    title_suffixes = suffixes,
    custom_title_text = custom_text,
    updated_at = now()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;