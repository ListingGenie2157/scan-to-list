-- ITEMS
create table if not exists public.items (
  id               bigserial primary key,
  user_id          uuid references auth.users(id) on delete cascade,
  type             text check (type in ('book','mag')) default 'book',
  isbn10           text,
  isbn13           text,
  title            text,
  authors          jsonb,
  publisher        text,
  categories       jsonb,
  description      text,
  year             text,
  quantity         int default 1,
  cover_url_ext    text,
  status           text check (status in ('draft','processed','listed','sold')) default 'draft',
  source           text,
  last_scanned_at  timestamptz default now(),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- one per user per ISBN13 (nulls allowed)
create unique index if not exists items_user_isbn13_unique
  on public.items(user_id, isbn13) where isbn13 is not null;

create index if not exists items_last_scanned_idx on public.items(last_scanned_at desc);
create index if not exists items_created_idx on public.items(created_at desc);

-- EXTRACTIONS (OCR)
create table if not exists public.extractions (
  id          bigserial primary key,
  item_id     bigint references public.items(id) on delete cascade,
  ocr_text    text,
  parsed_json jsonb,
  confidence  numeric,
  created_at  timestamptz default now()
);

-- Reuse existing photos table: add required columns
alter table public.photos add column if not exists item_id bigint;
alter table public.photos add column if not exists url_public text;
alter table public.photos add column if not exists thumb_url text;
alter table public.photos add column if not exists created_at timestamptz default now();

-- FK to items with cascade (drop/replace if different)
alter table public.photos drop constraint if exists photos_item_fkey;
alter table public.photos
  add constraint photos_item_fkey
  foreign key (item_id) references public.items(id) on delete cascade;

-- RLS
alter table public.items enable row level security;
alter table public.photos enable row level security;
alter table public.extractions enable row level security;

-- ITEMS policies
drop policy if exists "items owner read"  on public.items;
drop policy if exists "items owner write" on public.items;
drop policy if exists "items owner upd"   on public.items;
drop policy if exists "items owner del"   on public.items;

create policy "items owner read"  on public.items for select using (user_id = auth.uid());
create policy "items owner write" on public.items for insert with check (user_id = auth.uid());
create policy "items owner upd"   on public.items for update using (user_id = auth.uid());
create policy "items owner del"   on public.items for delete using (user_id = auth.uid());

-- PHOTOS policies (owner via items.user_id)
-- Drop any previous photos policies that might conflict
drop policy if exists "photos owner read"  on public.photos;
drop policy if exists "photos owner write" on public.photos;
drop policy if exists "photos owner del"   on public.photos;
-- Also drop legacy policy name if present
drop policy if exists "Users can access own photos" on public.photos;

create policy "photos owner read" on public.photos
for select using (
  exists(select 1 from public.items i where i.id = public.photos.item_id and i.user_id = auth.uid())
);

create policy "photos owner write" on public.photos
for insert with check (
  exists(select 1 from public.items i where i.id = public.photos.item_id and i.user_id = auth.uid())
);

create policy "photos owner del" on public.photos
for delete using (
  exists(select 1 from public.items i where i.id = public.photos.item_id and i.user_id = auth.uid())
);

-- EXTRACTIONS policies (owner via items.user_id)
drop policy if exists "ext owner read"  on public.extractions;
drop policy if exists "ext owner write" on public.extractions;
drop policy if exists "ext owner del"   on public.extractions;

create policy "ext owner read" on public.extractions
for select using (
  exists(select 1 from public.items i where i.id = public.extractions.item_id and i.user_id = auth.uid())
);

create policy "ext owner write" on public.extractions
for insert with check (
  exists(select 1 from public.items i where i.id = public.extractions.item_id and i.user_id = auth.uid())
);

create policy "ext owner del" on public.extractions
for delete using (
  exists(select 1 from public.items i where i.id = public.extractions.item_id and i.user_id = auth.uid())
);
