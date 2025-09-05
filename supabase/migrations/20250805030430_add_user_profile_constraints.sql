-- Add foreign key constraints that depend on user_profiles table
ALTER TABLE public.bundles 
  ADD CONSTRAINT bundles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.photos 
  ADD CONSTRAINT photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.processing_batches 
  ADD CONSTRAINT processing_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.inventory_items 
  ADD CONSTRAINT inventory_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.csv_exports 
  ADD CONSTRAINT csv_exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);

ALTER TABLE public.listing_queues 
  ADD CONSTRAINT listing_queues_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);