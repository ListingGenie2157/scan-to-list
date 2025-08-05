-- Create user profile for existing authenticated users
INSERT INTO user_profiles (id, email, full_name) 
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', email) as full_name
FROM auth.users 
WHERE id NOT IN (SELECT id FROM user_profiles)
ON CONFLICT (id) DO NOTHING;