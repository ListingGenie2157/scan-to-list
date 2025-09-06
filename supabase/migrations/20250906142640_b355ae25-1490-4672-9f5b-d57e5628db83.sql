-- Add unique constraint for user_id, photo_id to prevent duplicates
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_user_photo_key UNIQUE (user_id, photo_id);