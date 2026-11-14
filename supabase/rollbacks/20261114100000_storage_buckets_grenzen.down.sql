-- Rollback von 20261114100000_storage_buckets_grenzen.sql: Grenzen wieder aufheben (Stand der Baseline: beides NULL) und die
-- oeffentliche Lese-Policy fuer avatars wiederherstellen (Definition wie in baseline/09_storage.sql).
update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('avatars', 'belege', 'reports');

drop policy if exists "avatars read own" on storage.objects;
create policy "Public read avatars" on storage.objects
  as permissive
  for select
  to public
  using (bucket_id = 'avatars'::text);
