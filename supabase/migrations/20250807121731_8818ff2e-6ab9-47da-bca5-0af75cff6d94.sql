-- Create storage bucket for exports if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for exports bucket
CREATE POLICY "Users can upload their own exports"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own exports"
ON storage.objects
FOR SELECT
USING (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Exports are publicly viewable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'exports');