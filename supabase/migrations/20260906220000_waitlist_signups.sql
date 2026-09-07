-- Warteliste für das Interesse-Formular (/interesse): sammelt nur E-Mail + Einwilligung,
-- kein Bezug zu bestehenden Nutzerdaten oder Konten.
--
-- RLS erlaubt ausschliesslich INSERT von aussen (anon + authenticated) — das Formular ist
-- öffentlich, aber niemand soll die gesammelten Adressen über die normale Client-API
-- auslesen können, auch kein eingeloggter Nutzer (diese DB hat zwei auth.users, siehe
-- Erics Notiz zu Fremddaten). Auslesen passiert nur direkt in Supabase (Owner-Zugriff
-- ausserhalb von RLS), nicht über den App-Client — deshalb keine select/update/delete-Policy.
create table waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Kein Default: die Einwilligung kommt vom tatsächlich angehakten Formular-Checkbox,
  -- nie stillschweigend.
  consent boolean not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive statt eines simplen unique(email): sonst tragen sich
-- "Eric@Athena..." und "eric@athena..." zweimal ein.
create unique index waitlist_signups_email_key on waitlist_signups (lower(email));

alter table waitlist_signups enable row level security;

create policy "waitlist_signups_insert_public"
  on waitlist_signups for insert
  to anon, authenticated
  with check (true);
