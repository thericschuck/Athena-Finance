-- Datei-Uploads fuer Athena: Anhaenge im Chat und Dateien in Projekten.
--
-- Die Datei geht direkt aus dem Browser in den privaten Bucket (Server Actions und Vercel-
-- Funktionen nehmen nur wenige MB Body); die Tabelle haelt Pfad, Anzeigename, Typ, Groesse und
-- bei Projektdateien einen Textauszug. Der Pfad beginnt mit der User-ID -- darauf pruefen die
-- Storage-Policies (Muster wie valuable-documents).
--
-- Entweder haengt eine Zeile an einem Chat (conversation_id) ODER an einem Projekt (project_id).
-- Die Zeilen verschwinden per Cascade mit Chat bzw. Projekt; die Dateien im Bucket raeumt der
-- App-Code vorher ab (Storage kennt keine Fremdschluessel).
create table if not exists ai_files (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references ai_conversations(id) on delete cascade,
  project_id      uuid references ai_projects(id) on delete cascade,
  pfad            text not null,
  name            text not null,
  media_type      text not null,
  groesse         bigint not null default 0,
  auszug          text,
  created_at      timestamptz not null default now(),
  constraint ai_files_ziel_check check (conversation_id is not null or project_id is not null)
);

create index if not exists ai_files_conversation_idx on ai_files (conversation_id) where conversation_id is not null;
create index if not exists ai_files_project_idx on ai_files (project_id, created_at) where project_id is not null;
create index if not exists ai_files_user_idx on ai_files (user_id);

alter table ai_files enable row level security;

create policy "Users can read own ai files"   on ai_files for select using ((select auth.uid()) = user_id);
create policy "Users can insert own ai files" on ai_files for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own ai files" on ai_files for update using ((select auth.uid()) = user_id);
create policy "Users can delete own ai files" on ai_files for delete using ((select auth.uid()) = user_id);

-- Privater Bucket, 50 MB je Datei (PDF bis 32 MB nimmt die Anthropic-API ohnehin nur an; der
-- Rest ist Reserve fuer grosse CSV/Text). Nur PDF, Bild und Text: Office und Archive sollen
-- hier gar nicht erst landen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athena-uploads', 'athena-uploads', false, 52428800,
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'text/plain','text/csv','text/markdown','application/json'
  ]
)
on conflict (id) do nothing;

create policy "athena uploads read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'athena-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "athena uploads insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'athena-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "athena uploads update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'athena-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "athena uploads delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'athena-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
