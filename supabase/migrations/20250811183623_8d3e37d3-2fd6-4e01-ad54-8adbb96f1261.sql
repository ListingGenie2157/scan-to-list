-- Add bundle_id to items to support bundling with bundles table
ALTER TABLE public.items
ADD COLUMN IF NOT EXISTS bundle_id uuid NULL;

-- Add foreign key to bundles.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'items'
      AND kcu.column_name = 'bundle_id'
  ) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_bundle_id_fkey FOREIGN KEY (bundle_id)
    REFERENCES public.bundles (id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;