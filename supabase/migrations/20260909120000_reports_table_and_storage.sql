-- Reports (monatlich automatisch, jaehrlich manuell angestossen) --
-- eigene Tabelle analog zu `insights`, siehe docs/athenas-takt.html Abschnitt IV.
--
-- Hinweis: dieser Dateiname folgt der lokalen Konvention, ist aber nicht zwingend identisch
-- mit dem Remote-Zeitstempel (siehe Migrations-Drift-Memory) -- angewendet wurde die Migration
-- ueber apply_migration direkt gegen das Projekt.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('monthly', 'annual')),
  period_start date not null,
  period_end date not null,
  title text not null,
  html text not null,
  data jsonb not null,
  pdf_path text,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, type, period_start)
);

alter table public.reports enable row level security;

create policy "reports_own" on public.reports
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.reports is
  'Monats- und Jahresreports. HTML fuer Mail/In-App-Ansicht liegt direkt in der Zeile, das PDF im Storage-Bucket reports unter pdf_path. Monatlich vom Cron geschrieben (Service-Role, umgeht RLS), jaehrlich per manuellem Trigger aus der App.';

-- Storage-Bucket, gleiches Muster wie belege/valuables: Pfad {user_id}/... , RLS pro Nutzer.
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "reports read own" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "reports insert own" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "reports update own" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "reports delete own" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
