-- Create unique index for inventory_items (user_id, photo_id) if not exists
create unique index concurrently if not exists inventory_items_user_photo_uidx
  on public.inventory_items (user_id, photo_id);

-- Enable RLS on inventory_items (if not already enabled)
alter table public.inventory_items enable row level security;

-- Create RLS policies for inventory_items (will skip if already exist with same name)
create policy "inv sel own" on public.inventory_items for select using (user_id = auth.uid());
create policy "inv ins own" on public.inventory_items for insert with check (user_id = auth.uid());
create policy "inv upd own" on public.inventory_items for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Enable RLS on photos (if not already enabled)
alter table public.photos enable row level security;

-- Create RLS policy for photos select (will skip if already exist with same name)
create policy "photos sel own" on public.photos for select using (user_id = auth.uid());