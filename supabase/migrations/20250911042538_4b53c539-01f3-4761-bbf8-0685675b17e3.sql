-- Detect duplicates (fails unique creation)
-- Run first; if any rows returned, fix before proceeding.
with d as (
  select user_id, photo_id, count(*) c
  from public.inventory_items
  group by 1,2 having count(*) > 1
)
select * from d;

-- Prefer UNIQUE constraint (transaction-safe)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_user_photo_uniq'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_user_photo_uniq unique (user_id, photo_id);
  end if;
end$$;

-- Enable RLS
alter table public.inventory_items enable row level security;
alter table public.photos enable row level security;

-- Policies (guard by schemaname + name)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inv sel own'
  ) then
    create policy "inv sel own" on public.inventory_items
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inv ins own'
  ) then
    create policy "inv ins own" on public.inventory_items
      for insert with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inv upd own'
  ) then
    create policy "inv upd own" on public.inventory_items
      for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_items' and policyname = 'inv del own'
  ) then
    create policy "inv del own" on public.inventory_items
      for delete using (user_id = auth.uid());
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'photos' and policyname = 'photos sel own'
  ) then
    create policy "photos sel own" on public.photos
      for select using (user_id = auth.uid());
  end if;
end$$;