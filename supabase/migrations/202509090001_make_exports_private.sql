-- Ensure the `exports` storage bucket exists and is private
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do update set public = false;