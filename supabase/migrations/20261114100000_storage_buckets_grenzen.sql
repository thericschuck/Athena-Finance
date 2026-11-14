-- HAERTUNG der Storage-Buckets avatars, belege, reports (SECURITY-AUDIT.md, Storage): Groessen- und MIME-Grenzen setzen und
-- das Auflisten des Avatar-Buckets fuer Anonyme abstellen. Rueckgaengig: supabase/rollbacks/20261114100000_storage_buckets_grenzen.down.sql
--
-- Grenzen: gelten nur fuer NEUE Uploads, vorhandene Objekte bleiben unveraendert. Sie entsprechen den Pruefungen im App-Code
-- (settings/actions.ts, steuer/belege-actions.ts) bzw. dem, was der Server erzeugt (reports: PDF aus lib/reports/render-pdf.tsx).
--
-- avatars: 5 MB, nur Rasterbilder. KEIN image/svg+xml: eine SVG-Datei in einem oeffentlichen Bucket ist ein Skript-Vektor, wenn
-- jemand die Datei direkt oeffnet (und die App hat sie bisher ueber `image/*` angenommen).
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif']
where id = 'avatars';

-- belege: 10 MB, PDF und Bilder wie in belege-actions.ts (ERLAUBT, MAX_BYTES).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/heic','image/webp']
where id = 'belege';

-- reports: 10 MB, nur PDF (der Bucket nimmt ausschliesslich die vom Server erzeugten Berichte auf).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf']
where id = 'reports';

-- avatars lesen: bisher durfte die Rolle `public` ALLES im Bucket auflisten ("Public read avatars"): jeder ohne Login konnte ueber die
-- Storage-API alle Pfade und damit alle Nutzer-IDs auslesen. Die oeffentlichen Bild-URLs (getPublicUrl, /object/public/avatars/...)
-- brauchen diese Policy nicht, ein oeffentliches Bucket liefert die Dateien selbst aus. Ersatz: lesen nur eigene Dateien, und zwar
-- nur fuer angemeldete Nutzer. Das braucht der Upload mit upsert (settings/actions.ts) fuer das Ueberschreiben der eigenen Datei.
drop policy if exists "Public read avatars" on storage.objects;
create policy "avatars read own" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
