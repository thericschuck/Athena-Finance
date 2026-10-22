-- Dokumente und Belege je Gegenstand: Kaufbeleg, Zertifikat, Rechnung, Police.
--
-- Eigene Tabelle und eigener Bucket statt der Bilder-Tabelle: Dokumente sind keine Bilder
-- (PDF, kein Hauptbild, keine Vorlage fuer die Generierung) und der Bilder-Bucket erlaubt
-- ausdruecklich nur Bild-MIME-Typen.
--
-- Die Datei selbst geht direkt aus dem Browser in den Bucket; die Tabelle haelt nur Pfad,
-- Anzeigename, Art und Groesse. Der Pfad beginnt mit der User-ID -- darauf pruefen die
-- Storage-Policies.
create table if not exists valuable_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  valuable_id uuid not null references valuables(id) on delete cascade,
  pfad        text not null,
  name        text not null,
  art         text not null default 'sonstiges',
  groesse     bigint,
  created_at  timestamptz not null default now(),
  constraint valuable_documents_art_check
    check (art in ('beleg', 'zertifikat', 'rechnung', 'police', 'sonstiges'))
);

create index if not exists valuable_documents_lookup_idx
  on valuable_documents (valuable_id, created_at desc);

alter table valuable_documents enable row level security;

create policy "Users can read own documents"   on valuable_documents for select using (auth.uid() = user_id);
create policy "Users can insert own documents" on valuable_documents for insert with check (auth.uid() = user_id);
create policy "Users can update own documents" on valuable_documents for update using (auth.uid() = user_id);
create policy "Users can delete own documents" on valuable_documents for delete using (auth.uid() = user_id);

-- Privater Bucket. 15 MB und nur PDF/Bild: ein gescannter Beleg liegt meist darunter, und
-- alles andere (Office, Archive) soll hier gar nicht erst landen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'valuable-documents', 'valuable-documents', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

create policy "valuable documents read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'valuable-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "valuable documents insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'valuable-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "valuable documents update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'valuable-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "valuable documents delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'valuable-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
