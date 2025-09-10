-- ===============================
-- 1) Ensure every auth user gets a user_profiles row
-- ===============================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===============================
-- 2) Backfill any NULL user_id rows using photos.user_id, if available
-- ===============================
update public.inventory_items ii
set user_id = p.user_id
from public.photos p
where ii.photo_id = p.id and ii.user_id is null;

-- If still NULL and you want to purge ghosts:
-- delete from public.inventory_items where user_id is null;

-- ===============================
-- 3) Make user_id required where it matters
-- ===============================
alter table public.inventory_items alter column user_id set not null;
alter table public.photos alter column user_id set not null;

-- Optional: enforce that one photo belongs to one user's item
alter table public.inventory_items
  add constraint inventory_items_user_photo_key unique (user_id, photo_id);

-- ===============================
-- 4) RLS: use SELECT/INSERT/UPDATE/DELETE specific policies
-- (your FOR ALL USING(...) doesn't apply to INSERT; WITH CHECK does)
-- ===============================

-- Inventory items
drop policy if exists "Users can access own inventory" on public.inventory_items;
create policy "inv select own"  on public.inventory_items for select using (auth.uid() = user_id);
create policy "inv insert own"  on public.inventory_items for insert with check (auth.uid() = user_id);
create policy "inv update own"  on public.inventory_items for update using (auth.uid() = user_id);
create policy "inv delete own"  on public.inventory_items for delete using (auth.uid() = user_id);

-- Photos
drop policy if exists "Users can access own photos" on public.photos;
create policy "photos select own" on public.photos for select using (auth.uid() = user_id);
create policy "photos insert own" on public.photos for insert with check (auth.uid() = user_id);
create policy "photos update own" on public.photos for update using (auth.uid() = user_id);
create policy "photos delete own" on public.photos for delete using (auth.uid() = user_id);

-- Batches (same pattern)
drop policy if exists "Users can access own batches" on public.processing_batches;
create policy "batches select own" on public.processing_batches for select using (auth.uid() = user_id);
create policy "batches insert own" on public.processing_batches for insert with check (auth.uid() = user_id);
create policy "batches update own" on public.processing_batches for update using (auth.uid() = user_id);
create policy "batches delete own" on public.processing_batches for delete using (auth.uid() = user_id);

-- Bundles
drop policy if exists "Users can access own bundles" on public.bundles;
create policy "bundles select own" on public.bundles for select using (auth.uid() = user_id);
create policy "bundles insert own" on public.bundles for insert with check (auth.uid() = user_id);
create policy "bundles update own" on public.bundles for update using (auth.uid() = user_id);
create policy "bundles delete own" on public.bundles for delete using (auth.uid() = user_id);

-- Queues
drop policy if exists "Users can access own queues" on public.listing_queues;
create policy "queues select own" on public.listing_queues for select using (auth.uid() = user_id);
create policy "queues insert own" on public.listing_queues for insert with check (auth.uid() = user_id);
create policy "queues update own" on public.listing_queues for update using (auth.uid() = user_id);
create policy "queues delete own" on public.listing_queues for delete using (auth.uid() = user_id);

-- CSV exports
drop policy if exists "Users can access own exports" on public.csv_exports;
create policy "exports select own" on public.csv_exports for select using (auth.uid() = user_id);
create policy "exports insert own" on public.csv_exports for insert with check (auth.uid() = user_id);
create policy "exports update own" on public.csv_exports for update using (auth.uid() = user_id);
create policy "exports delete own" on public.csv_exports for delete using (auth.uid() = user_id);

-- ===============================
-- 5) Helpful indexes
-- ===============================
create index if not exists idx_inventory_items_user_updated
  on public.inventory_items(user_id, updated_at desc);

-- ===============================
-- 6) Function-side guard: require auth and write user_id
-- (TypeScript snippet; place in your edge function)
-- ===============================
--
-- const auth = req.headers.get("Authorization") || "";
-- const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization: auth } } });
-- const { data: me } = await sb.auth.getUser();
-- if (!me?.user?.id) return json(401, { success:false, error:"Not signed in" });
-- const userId = me.user.id;
-- await sb.from('inventory_items').upsert({ user_id: userId, photo_id, ...fields }, { onConflict: 'user_id,photo_id' });