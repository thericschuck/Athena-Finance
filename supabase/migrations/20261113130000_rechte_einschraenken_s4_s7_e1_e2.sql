-- Rechte einschraenken: fund_prices (S4), bank_connections (S7), exchange_keys (E1), fints_client_state (E2).
-- (SECURITY-AUDIT.md) Gemeinsames Muster: `authenticated` (der Browser-Client) hatte zu weite Rechte auf Tabellen, die die App
-- ausschliesslich serverseitig mit dem Service-Role-Client schreibt bzw. deren Chiffrate sie nur serverseitig liest.
--
-- REIHENFOLGE: ERST den App-Code ausliefern (Schluessel-Helfer src/lib/kraken/schluessel*.ts, Kurs-Ablage
-- src/lib/data/fund-prices.ts, beide mit Admin-Client), DANACH diese Migration. Umgekehrt scheitern Kraken-Sync, Rebalancing,
-- Speichern/Loeschen des Kraken-Schluessels und das Ablegen manueller Kurse am fehlenden Recht (42501).
--
-- Live-Stand am 2026-11-13 (vorher gelesen):
--   fund_prices         authenticated: INSERT, SELECT, UPDATE; Policies fund_prices_insert_auth, fund_prices_update_auth (public)
--   bank_connections    authenticated: INSERT, UPDATE, DELETE (Tabelle) + SELECT je Spalte OHNE pin_enc/username_enc
--   exchange_keys       authenticated: SELECT, INSERT, UPDATE, DELETE auf allen Spalten inkl. api_key/api_secret
--   fints_client_state  anon UND authenticated: alle Rechte; Policy fints_client_state_own (ALL, authenticated)
--
-- Wirkung auf die App (geprueft, siehe Commit): Lesen mit `.eq('user_id', ...)` auf exchange_keys (Kraken-Status, Erste-Schritte,
-- Reminders, Crypto-Seite) braucht das SELECT-Recht auf user_id, deshalb steht user_id in der Spaltenliste.
--
-- Wirkung auf die SQL-Testskripte: supabase/tests/bank_connections.sql (d1, d2, d4, d6 bis d8) erwartet, dass der Eigentuemer
-- schreiben darf; das stimmt nach dieser Migration nicht mehr und muss auf „verweigert (42501)“ umgestellt werden.

-- ── S4: fund_prices — nur noch service_role schreibt ────────────────────────────────────────────────────────────────────────
drop policy if exists fund_prices_insert_auth on public.fund_prices;
drop policy if exists fund_prices_update_auth on public.fund_prices;
-- Gurt und Hosentraeger: ohne Policy greift die RLS ohnehin, mit entzogenem Recht auch ohne RLS. SELECT bleibt (Policy fund_prices_select_all).
revoke insert, update on public.fund_prices from authenticated;

-- ── S7: bank_connections — kein Schreiben mehr fuer authenticated ───────────────────────────────────────────────────────────
-- Ein Tabellen-REVOKE entzieht auch die zugehoerigen Spaltenrechte. SELECT bleibt mit der bestehenden Spaltensperre
-- (pin_enc/username_enc bleiben ungrantet). Die App schreibt nur ueber src/lib/fints/connections.ts (Service-Role).
revoke insert, update, delete on public.bank_connections from authenticated;

-- ── E1: exchange_keys — Chiffrate nur noch fuer service_role ────────────────────────────────────────────────────────────────
revoke all on public.exchange_keys from authenticated;
revoke all on public.exchange_keys from anon;
-- Nur Metadaten fuer Existenzpruefungen ("ist ein Schluessel hinterlegt?"). user_id ist dabei, weil die Abfragen darauf filtern.
grant select (id, user_id, exchange, created_at) on public.exchange_keys to authenticated;
-- Die bestehende Policy „Users can manage their own exchange keys“ bleibt: ohne Schreibrechte und ohne SELECT auf die Chiffrate
-- ist sie wirkungslos fuer alles ausser dem Lesen der vier Metadaten-Spalten der eigenen Zeile.

-- ── E2: fints_client_state — nur service_role ───────────────────────────────────────────────────────────────────────────────
drop policy if exists fints_client_state_own on public.fints_client_state;
revoke all on public.fints_client_state from anon, authenticated;
-- RLS bleibt eingeschaltet: ohne Policy und ohne Rechte ist die Tabelle fuer alle ausser service_role (und den Besitzer) gesperrt.

-- ── Selbstpruefung: bricht die ganze Migration ab (nichts wird geaendert), falls ein Recht nicht wie gewollt gesetzt ist ───────────
do $pruefung$
declare
  fehler text[] := '{}';
  t text;
begin
  -- authenticated: kein Schreiben auf die vier Tabellen (Tabellen- UND Spaltenebene)
  foreach t in array array['fund_prices', 'bank_connections', 'exchange_keys', 'fints_client_state'] loop
    if has_any_column_privilege('authenticated', 'public.' || t, 'insert,update') then
      fehler := fehler || (t || ': authenticated hat noch INSERT/UPDATE auf mindestens einer Spalte');
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'delete') then
      fehler := fehler || (t || ': authenticated hat noch DELETE');
    end if;
  end loop;

  -- exchange_keys: Chiffrate unlesbar, Metadaten lesbar
  if has_column_privilege('authenticated', 'public.exchange_keys', 'api_key', 'select')
     or has_column_privilege('authenticated', 'public.exchange_keys', 'api_secret', 'select') then
    fehler := fehler || 'exchange_keys: authenticated kann api_key/api_secret noch lesen';
  end if;
  foreach t in array array['id', 'user_id', 'exchange', 'created_at'] loop
    if not has_column_privilege('authenticated', 'public.exchange_keys', t, 'select') then
      fehler := fehler || ('exchange_keys: authenticated kann ' || t || ' nicht lesen (die App filtert darauf)');
    end if;
  end loop;

  -- fints_client_state: weder anon noch authenticated
  if has_any_column_privilege('anon', 'public.fints_client_state', 'select,insert,update')
     or has_any_column_privilege('authenticated', 'public.fints_client_state', 'select,insert,update') then
    fehler := fehler || 'fints_client_state: anon/authenticated haben noch Spaltenrechte';
  end if;
  if has_any_column_privilege('anon', 'public.exchange_keys', 'select,insert,update') then
    fehler := fehler || 'exchange_keys: anon hat noch Rechte';
  end if;

  -- bank_connections: Lesen bleibt, die Chiffrate bleiben gesperrt
  if not has_column_privilege('authenticated', 'public.bank_connections', 'label', 'select') then
    fehler := fehler || 'bank_connections: authenticated kann label nicht mehr lesen';
  end if;
  if has_column_privilege('authenticated', 'public.bank_connections', 'pin_enc', 'select')
     or has_column_privilege('authenticated', 'public.bank_connections', 'username_enc', 'select') then
    fehler := fehler || 'bank_connections: Chiffrate (pin_enc/username_enc) fuer authenticated lesbar';
  end if;

  -- fund_prices: Lesen bleibt
  if not has_table_privilege('authenticated', 'public.fund_prices', 'select') then
    fehler := fehler || 'fund_prices: authenticated kann nicht mehr lesen';
  end if;

  -- service_role darf weiterhin alles Noetige
  foreach t in array array['fund_prices', 'bank_connections', 'exchange_keys', 'fints_client_state'] loop
    if not has_table_privilege('service_role', 'public.' || t, 'select,insert,update,delete') then
      fehler := fehler || (t || ': service_role hat nicht mehr alle Rechte');
    end if;
  end loop;

  -- Policies wie gewollt entfernt
  if exists (select 1 from pg_policies where schemaname = 'public'
             and policyname in ('fund_prices_insert_auth', 'fund_prices_update_auth', 'fints_client_state_own')) then
    fehler := fehler || 'eine der zu entfernenden Policies besteht noch';
  end if;

  if array_length(fehler, 1) > 0 then
    raise exception 'Rechte-Migration nicht wie erwartet: %', array_to_string(fehler, '; ');
  end if;
end
$pruefung$;
