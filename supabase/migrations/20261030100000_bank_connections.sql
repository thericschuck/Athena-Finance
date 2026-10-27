-- FINTS-VERBINDUNGEN PRO NUTZER: Tabelle bank_connections (Zugangsdaten verschluesselt in der Datenbank).
-- Konzept: docs/fints-verbindungen.md. Bezug: docs/haushalt-multiuser.md (Abschnitt 5 FinTS-Doppelsync, 8.4 Service-Role).
--
-- Warum: Der FinTS-Login lag bisher global in Env-Variablen (FINTS_URL/BLZ/USERNAME/PIN) und gehoerte genau einem Nutzer
-- (BANK_SYNC_USER_ID). Jeder Nutzer soll seine Bankverbindung selbst in den Einstellungen eintragen koennen.
--
-- Wie:
--   - Eine Zeile je Bank-Login eines Nutzers. Benutzerkennung und PIN stehen NUR als AES-256-GCM-Chiffretext
--     (Format iv:authTag:ciphertext, siehe src/lib/encryption.ts, Schluessel ENCRYPTION_KEY) in username_enc/pin_enc.
--     Verschluesselt und entschluesselt wird ausschliesslich serverseitig (Node mit Service-Role bzw. die Python-Function).
--   - bank_key = sha256('<blz>:<username>')[:32], identisch zu fints_client_state.bank_key (scripts/fints/fints_sync.py und
--     api/bank-sync.py). Dadurch passt der bestehende Client-State (Kundensystem-ID, 90-Tage-SCA-Ausnahme) weiter.
--   - username_hint (Entscheidung): ein separates, unkritisches Feld mit den letzten 3 Zeichen der Benutzerkennung (z. B. '***x1z').
--     Die UI zeigt damit den "maskierten Benutzernamen", ohne username_enc je lesen oder entschluesseln zu muessen.
--     Preis: 3 Zeichen der Kennung liegen im Klartext in der DB (die Debug-Route zeigte bisher ebenfalls 3 Zeichen).
--   - fints_url muss https sein (Check) und blz genau 8 Ziffern: schuetzt davor, dass ein Nutzer den Server beliebige
--     Ziele (http, file, interne Adressen ohne TLS) anfragen laesst. Weitere Pruefung (Host) in src/lib/fints/connections.ts.
--   - RLS: owner-only (Initplan, Rolle authenticated, USING + WITH CHECK user_id = (select auth.uid())).
--   - SPALTENRECHTE (der eigentliche Schutz): anon und authenticated bekommen keine Rechte auf der Tabelle; authenticated darf
--     nur die unkritischen Spalten SELECTen. username_enc und pin_enc sind per SELECT nie lesbar (permission denied), auch nicht
--     fuer den Eigentuemer und auch nicht ueber select * (select * scheitert bewusst; Code muss Spalten nennen).
--     INSERT/UPDATE/DELETE darf authenticated (RLS: nur eigene Zeilen); service_role darf alles.
--   - Idempotent: create ... if not exists, Constraints/Policies guarded, revoke/grant wiederholbar.
-- Rueckgaengig: supabase/rollbacks/20261030100000_bank_connections.down.sql (loescht die Tabelle samt Zugangsdaten)
-- Test: supabase/tests/bank_connections.sql

create table if not exists public.bank_connections (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  label         text        not null,
  bank_key      text        not null,
  blz           text        not null,
  fints_url     text        not null,
  username_enc  text        not null,
  username_hint text,
  pin_enc       text        not null,
  tan_medium    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_sync_at  timestamptz,
  last_error    text
);

comment on table public.bank_connections is
  'FinTS-Bankverbindung je Nutzer. username_enc/pin_enc: AES-256-GCM (iv:tag:ct), nur serverseitig les-/entschluesselbar; authenticated hat darauf kein SELECT.';
comment on column public.bank_connections.bank_key is
  'sha256(blz:username)[:32], identisch zu fints_client_state.bank_key.';
comment on column public.bank_connections.username_hint is
  'Maskierte Anzeige der Benutzerkennung (letzte 3 Zeichen), damit die UI nie entschluesseln muss.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bank_connections_user_bank_key_key'
                 and conrelid = 'public.bank_connections'::regclass) then
    alter table public.bank_connections
      add constraint bank_connections_user_bank_key_key unique (user_id, bank_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_connections_blz_check'
                 and conrelid = 'public.bank_connections'::regclass) then
    alter table public.bank_connections
      add constraint bank_connections_blz_check check (blz ~ '^[0-9]{8}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_connections_fints_url_check'
                 and conrelid = 'public.bank_connections'::regclass) then
    alter table public.bank_connections
      add constraint bank_connections_fints_url_check check (fints_url ~* '^https://[^/[:space:]]+');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bank_connections_label_check'
                 and conrelid = 'public.bank_connections'::regclass) then
    alter table public.bank_connections
      add constraint bank_connections_label_check check (char_length(btrim(label)) between 1 and 80);
  end if;
end $$;

alter table public.bank_connections enable row level security;

drop policy if exists bank_connections_own on public.bank_connections;
create policy bank_connections_own
  on public.bank_connections
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Spaltenrechte: erst alles entziehen, dann gezielt vergeben.
revoke all on table public.bank_connections from anon, authenticated;

grant select (id, user_id, label, bank_key, blz, fints_url, username_hint, tan_medium,
              created_at, updated_at, last_sync_at, last_error)
  on public.bank_connections to authenticated;
grant insert, update, delete on table public.bank_connections to authenticated;

grant all on table public.bank_connections to service_role;
