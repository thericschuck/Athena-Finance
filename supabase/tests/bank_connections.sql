-- Rollender Test fuer 20261030100000_bank_connections.sql (RLS + Spaltenrechte).
--
-- ACHTUNG: Das Skript SCHREIBT (Fake-Nutzer @example.invalid, Testzeilen, Migration) und ist nur sicher, weil es in EINEM
-- einzigen DO-Block laeuft, der am Ende IMMER mit `raise exception` endet -> alles wird zurueckgerollt, nichts persistiert.
-- Der Bericht steht in der Fehlermeldung ("BANK-CONNECTIONS-TESTBERICHT"). Keine Nutzerdaten im Bericht (nur true/false/Zaehlwerte).
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. Vorher lesend: select to_regclass('public.bank_connections'), count(*) aus pg_policies, auth.users (Werte merken).
--   2. EIN execute_sql-Aufruf mit diesem Block. Der Marker `-- @@MIGRATION` wird durch
--        v_s := $m1$ <Inhalt von supabase/migrations/20261030100000_bank_connections.sql> $m1$; execute v_s;
--      ersetzt. Ist die Migration schon angewendet, den Marker leer lassen (die Migration ist idempotent, darf aber auch laufen).
--   3. Nachher lesend: dieselben Werte wie in Schritt 1 -> muessen identisch sein (to_regclass wieder null, wenn vorher null).
-- Auth-Simulation: `set local role authenticated` + request.jwt.claims; auth.uid() liest dieses Claim.

do $outer$
declare
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  v_ca uuid; v_cb uuid; v_s text; v_rep text; v_ok int; v_all int; n bigint; rc int;
begin
  create temp table t_res (name text, ok boolean, wert text);
  grant all on t_res to public;

  create function pg_temp.rec(p_name text, p_ok boolean, p_wert text) returns void language plpgsql as
  $f$ begin insert into pg_temp.t_res values (p_name, coalesce(p_ok, false), p_wert); end $f$;

  create function pg_temp.act(p uuid) returns void language plpgsql as
  $f$ begin
    reset role;
    if p is null then
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
  end $f$;

  -- @@MIGRATION (hier einfuegen:  v_s := $m1$ ...Dateiinhalt... $m1$;  execute v_s;)

  -- ===== Fixture (als Superuser) =====
  insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values
    (v_a, 'fx-a-' || v_a || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
    (v_b, 'fx-b-' || v_b || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
  insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, username_hint, pin_enc)
    values (v_a, 'fx-a', repeat('a', 32), '12345678', 'https://example.invalid/fints', 'x:y:z', '***aaa', 'x:y:z') returning id into v_ca;
  insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, username_hint, pin_enc)
    values (v_b, 'fx-b', repeat('b', 32), '12345678', 'https://example.invalid/fints', 'x:y:z', '***bbb', 'x:y:z') returning id into v_cb;

  perform pg_temp.rec('a1: Tabelle hat RLS',
    (select relrowsecurity from pg_class where oid = 'public.bank_connections'::regclass), null);

  -- ===== RLS-Sicht =====
  perform pg_temp.act(v_a);
  select count(*) into n from public.bank_connections;
  perform pg_temp.rec('b1: Nutzer A sieht genau 1 Zeile', n = 1, n::text);
  select count(*) into n from public.bank_connections where id = v_cb;
  perform pg_temp.rec('b2: Nutzer A sieht Zeile von B nicht', n = 0, n::text);
  perform pg_temp.act(v_b);
  select count(*) into n from public.bank_connections where id = v_ca;
  perform pg_temp.rec('b3: Nutzer B sieht Zeile von A nicht', n = 0, n::text);
  perform pg_temp.act(null);

  -- anon
  begin
    set local role anon;
    perform count(*) from public.bank_connections;
    perform pg_temp.rec('c0: anon darf nicht lesen', false, 'gelesen');
  exception when insufficient_privilege then
    perform pg_temp.rec('c0: anon darf nicht lesen', true, 'permission denied');
  end;
  perform pg_temp.act(null);

  -- ===== Spaltenrechte =====
  perform pg_temp.act(v_a);
  begin
    perform pin_enc from public.bank_connections;
    perform pg_temp.rec('c1: authenticated kann pin_enc nicht lesen', false, 'gelesen');
  exception when insufficient_privilege then
    perform pg_temp.rec('c1: authenticated kann pin_enc nicht lesen', true, 'permission denied');
  end;
  begin
    perform username_enc from public.bank_connections;
    perform pg_temp.rec('c2: authenticated kann username_enc nicht lesen', false, 'gelesen');
  exception when insufficient_privilege then
    perform pg_temp.rec('c2: authenticated kann username_enc nicht lesen', true, 'permission denied');
  end;
  begin
    perform * from public.bank_connections;
    perform pg_temp.rec('c3: select * scheitert (kein Recht auf alle Spalten)', false, 'gelesen');
  exception when insufficient_privilege then
    perform pg_temp.rec('c3: select * scheitert (kein Recht auf alle Spalten)', true, 'permission denied');
  end;
  begin
    perform id, user_id, label, bank_key, blz, fints_url, username_hint, tan_medium, created_at, updated_at, last_sync_at, last_error
      from public.bank_connections;
    perform pg_temp.rec('c4: unkritische Spalten lesbar', true, null);
  exception when others then
    perform pg_temp.rec('c4: unkritische Spalten lesbar', false, sqlstate);
  end;
  begin
    perform 1 from public.bank_connections where pin_enc is not null;
    perform pg_temp.rec('c5: auch Filter auf pin_enc ist verboten (kein Orakel)', false, 'erlaubt');
  exception when insufficient_privilege then
    perform pg_temp.rec('c5: auch Filter auf pin_enc ist verboten (kein Orakel)', true, 'permission denied');
  end;
  perform pg_temp.act(null);

  -- ===== Schreiben als Eigentuemer =====
  perform pg_temp.act(v_a);
  insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, username_hint, pin_enc)
    values (v_a, 'fx-a2', repeat('c', 32), '12345678', 'https://example.invalid/fints', 'x:y:z', '***ccc', 'x:y:z');
  get diagnostics rc = row_count;
  perform pg_temp.rec('d1: Eigentuemer darf einfuegen', rc = 1, rc::text);
  update public.bank_connections set label = 'fx-a-neu' where id = v_ca; get diagnostics rc = row_count;
  perform pg_temp.rec('d2: Eigentuemer darf eigene Zeile aendern', rc = 1, rc::text);
  update public.bank_connections set label = 'fx-hack' where id = v_cb; get diagnostics rc = row_count;
  perform pg_temp.rec('d3: Update fremder Zeile betrifft 0 Zeilen', rc = 0, rc::text);
  delete from public.bank_connections where id = v_cb; get diagnostics rc = row_count;
  perform pg_temp.rec('d4: Delete fremder Zeile betrifft 0 Zeilen', rc = 0, rc::text);
  begin
    insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, pin_enc)
      values (v_b, 'fx-fremd', repeat('d', 32), '12345678', 'https://example.invalid/fints', 'x:y:z', 'x:y:z');
    perform pg_temp.rec('d5: Insert fuer fremden Nutzer verboten', false, 'erlaubt');
  exception when insufficient_privilege then
    perform pg_temp.rec('d5: Insert fuer fremden Nutzer verboten', true, 'RLS ' || sqlstate);
  end;
  begin
    insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, pin_enc)
      values (v_a, 'fx-http', repeat('e', 32), '12345678', 'http://example.invalid/fints', 'x:y:z', 'x:y:z');
    perform pg_temp.rec('d6: http-URL wird abgelehnt (Check)', false, 'erlaubt');
  exception when check_violation then
    perform pg_temp.rec('d6: http-URL wird abgelehnt (Check)', true, 'check_violation');
  end;
  begin
    insert into public.bank_connections (user_id, label, bank_key, blz, fints_url, username_enc, pin_enc)
      values (v_a, 'fx-dup', repeat('a', 32), '12345678', 'https://example.invalid/fints', 'x:y:z', 'x:y:z');
    perform pg_temp.rec('d7: unique(user_id, bank_key)', false, 'erlaubt');
  exception when unique_violation then
    perform pg_temp.rec('d7: unique(user_id, bank_key)', true, 'unique_violation');
  end;
  delete from public.bank_connections where id = v_ca; get diagnostics rc = row_count;
  perform pg_temp.rec('d8: Eigentuemer darf eigene Zeile loeschen', rc = 1, rc::text);
  perform pg_temp.act(null);

  -- B-Zeile unveraendert (Superuser-Sicht)
  select count(*) into n from public.bank_connections where id = v_cb and label = 'fx-b';
  perform pg_temp.rec('e1: Zeile von B unveraendert', n = 1, n::text);

  -- ===== Rechte laut Katalog =====
  perform pg_temp.rec('e2: service_role hat alle Rechte', has_table_privilege('service_role', 'public.bank_connections', 'select,insert,update,delete'), null);
  perform pg_temp.rec('e3: anon ohne jedes Tabellenrecht',
    not has_table_privilege('anon', 'public.bank_connections', 'select,insert,update,delete')
    and not has_column_privilege('anon', 'public.bank_connections', 'pin_enc', 'select'), null);
  perform pg_temp.rec('e4: authenticated: kein SELECT auf pin_enc/username_enc, SELECT auf label',
    not has_column_privilege('authenticated', 'public.bank_connections', 'pin_enc', 'select')
    and not has_column_privilege('authenticated', 'public.bank_connections', 'username_enc', 'select')
    and has_column_privilege('authenticated', 'public.bank_connections', 'label', 'select'), null);

  -- ===== Bericht =====
  select count(*) filter (where ok), count(*) into v_ok, v_all from pg_temp.t_res;
  select string_agg(case when ok then 'OK   ' else 'FAIL ' end || name || ' | ' || coalesce(wert, ''), E'\n' order by ctid) into v_rep from pg_temp.t_res;
  raise exception E'BANK-CONNECTIONS-TESTBERICHT (% von % ok; ALLES ZURUECKGEROLLT)\n%', v_ok, v_all, v_rep;
end
$outer$;
