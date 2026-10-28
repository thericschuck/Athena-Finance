-- Test Migration 20261030110000_tax_overrides_views: Steuerattribute pro Person (Regressionsbeweis + Personen-Fixture).
--
-- ACHTUNG: Dieses Skript SCHREIBT (Fixture-Nutzer/-Kategorien/-Buchungen, Migration, Rollback) und ist nur sicher, weil es in
-- EINEM einzigen DO-Block laeuft, der am Ende IMMER mit `raise exception` endet: die gesamte Transaktion wird zurueckgerollt,
-- nichts wird persistiert. Der Bericht steht in der Fehlermeldung ("TAX-OVERRIDES-BERICHT"). Keine Nutzerdaten im Bericht,
-- nur Zaehlwerte, Hashes und true/false.
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. EIN execute_sql-Aufruf mit diesem Block. Marker `-- @@MIGRATION` wird durch
--         execute $m1$ <Inhalt supabase/migrations/20261030110000_tax_overrides_views.sql> $m1$;
--      ersetzt, `-- @@ROLLBACK` durch
--         execute $r1$ <Inhalt supabase/rollbacks/20261030110000_tax_overrides_views.down.sql> $r1$;
--      Beide Marker leer lassen = Test gegen eine DB, in der die Migration schon live ist (Regression dann trivial).
--   2. Danach lesende Kontrolle: to_regprocedure('public.fn_category_tax_effective()') ist null (oder wie vorher) und
--      md5 der View-Definitionen wie vor dem Lauf.
--
-- Regressionsbeweis: je Rolle (Eric = household_members.role 'owner', Mitglied = 'member') vor/nach der Migration
--   md5 + Zeilenzahl ueber category_tree, unified_transactions (alle 36 Spalten), monthly_flows, monthly_umbuchungen,
--   monthly_flow_totals. Eric: vorher = nachher. Mitglied: unified_transactions/monthly_* vorher = nachher (Erics Buchungen
--   tragen weiterhin ERICS Rolle); category_tree nur die Struktur-Spalten (die Steuerwerte sind dort Aufruferwerte, das
--   Mitglied hat noch keine Overrides -> NULL).
-- Personen-Fixture: zweiter Nutzer @example.invalid (Peer) mit eigenem Override auf dieselbe Kategorie; seine Buchung traegt
--   SEINE Rolle, Erics Buchung weiter die von Eric, Fremder (anderer Haushalt) sieht nichts, kein Rueckfall auf Legacy-Spalten.

do $outer$
declare
  v_eric uuid; v_mem uuid; v_hh uuid; v_f uuid := gen_random_uuid(); v_x uuid := gen_random_uuid();
  v_root uuid; v_child uuid; v_d uuid; v_k1 uuid; v_k2 uuid;
  v_ae uuid; v_af uuid; v_b1 uuid; v_b2 uuid; v_b3 uuid;
  v_ibA text := 'DE00TXTEST0000000001'; v_ibB text := 'DE00TXTEST0000000002';
  v_q text[]; v_n text[] := array['category_tree(struktur)', 'category_tree(alle)', 'unified_transactions', 'monthly_flows', 'monthly_umbuchungen', 'monthly_flow_totals'];
  v_who uuid[]; v_wn text[] := array['eric', 'member'];
  i int; j int; v_h text; v_s0 text; v_s1 text; v_s2 text; v_rep text; v_ok int; v_all int; r record;
  v_drift bigint; v_p0 numeric; v_p1 numeric; v_t numeric; k int; v_a text; v_b text; v_c text; v_cnt bigint; v_bool boolean;
  v_cols text := 'id, user_id, name, parent_id, type, root_id, root_name, depth, path';
begin
  create temp table t_res (name text, ok boolean, wert text);
  grant all on t_res to public;
  create temp table t_h (phase int, who text, nm text, hv text);
  grant all on t_h to public;

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

  create function pg_temp.h(p_sql text) returns text language plpgsql as
  $f$ declare v text; begin
    execute 'select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) || ''/'' || count(*) from (' || p_sql || ') x' into v;
    return v;
  end $f$;

  create function pg_temp.q(p_sql text) returns text language plpgsql as
  $f$ declare v text; begin execute p_sql into v; return v; end $f$;

  -- Laufzeit (ms) einer Abfrage, bester von 3 Laeufen
  create function pg_temp.perf(p_sql text) returns numeric language plpgsql as
  $f$ declare v text; best numeric := null; t numeric; n int; begin
    for n in 1..3 loop
      execute 'explain (analyze, format json) ' || p_sql into v;
      t := (v::json -> 0 ->> 'Execution Time')::numeric;
      if best is null or t < best then best := t; end if;
    end loop;
    return best;
  end $f$;

  create function pg_temp.vstate() returns text language sql as
  $f$ select concat_ws('|',
      (select md5(string_agg(c.relname || coalesce(c.reloptions::text, '') || pg_get_viewdef(c.oid, true) ||
                  coalesce((select string_agg(g.grantee || g.privilege_type, ',' order by g.grantee, g.privilege_type)
                            from information_schema.role_table_grants g
                            where g.table_schema = 'public' and g.table_name = c.relname), ''), '|' order by c.relname))
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'),
      (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'v'),
      (select count(*) from pg_proc where proname = 'fn_category_tax_effective' and pronamespace = 'public'::regnamespace)) $f$;

  -- ===== Ausgangslage =====
  select user_id, household_id into v_eric, v_hh from public.household_members where role = 'owner' limit 1;
  select user_id into v_mem from public.household_members where household_id = v_hh and role = 'member' limit 1;
  perform pg_temp.rec('0: Eric (owner) und Mitglied (member) im selben Haushalt gefunden', v_eric is not null and v_mem is not null, 'owner=' || (v_eric is not null) || ' member=' || (v_mem is not null));
  v_who := array[v_eric, v_mem];
  v_q := array['select ' || v_cols || ' from public.category_tree', 'select * from public.category_tree',
               'select * from public.unified_transactions', 'select * from public.monthly_flows',
               'select * from public.monthly_umbuchungen', 'select * from public.monthly_flow_totals'];
  v_s0 := pg_temp.vstate();

  select count(*) into v_drift from public.categories c
    left join public.category_tax_overrides o on o.category_id = c.id and o.user_id = c.user_id
   where c.tax_role is distinct from o.tax_role or c.euer_zeile is distinct from o.euer_zeile or c.business_share is distinct from o.business_share;
  perform pg_temp.rec('0b: Drift Spalten <-> Overrides (Voraussetzung fuer identische Hashes: 0, sonst Backfill-Nachlauf)', true, 'abweichende_kategorien=' || v_drift);

  -- ===== Vorher: Hashes je Rolle + Laufzeit =====
  for i in 1..2 loop
    for j in 1..array_length(v_q, 1) loop
      perform pg_temp.act(v_who[i]);
      v_h := pg_temp.h(v_q[j]);
      perform pg_temp.act(null);
      insert into t_h values (0, v_wn[i], v_n[j], v_h);
    end loop;
  end loop;
  perform pg_temp.act(v_eric);
  v_p0 := pg_temp.perf('select * from public.unified_transactions');
  perform pg_temp.act(null);

  -- @@MIGRATION

  v_s1 := pg_temp.vstate();
  perform pg_temp.rec('M0: View-/Funktionsstand hat sich durch die Migration geaendert', v_s0 is distinct from v_s1 or v_s0 is null, null);
  perform pg_temp.rec('M1: fn_category_tax_effective existiert, SECURITY DEFINER, search_path gepinnt, anon ohne EXECUTE',
    exists (select 1 from pg_proc p where p.proname = 'fn_category_tax_effective' and p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proconfig::text like '%search_path%')
    and not has_function_privilege('anon', 'public.fn_category_tax_effective()', 'execute')
    and has_function_privilege('authenticated', 'public.fn_category_tax_effective()', 'execute'), null);

  -- ===== Nachher: Hashes je Rolle + Laufzeit =====
  for i in 1..2 loop
    for j in 1..array_length(v_q, 1) loop
      perform pg_temp.act(v_who[i]);
      v_h := pg_temp.h(v_q[j]);
      perform pg_temp.act(null);
      insert into t_h values (1, v_wn[i], v_n[j], v_h);
    end loop;
  end loop;
  perform pg_temp.act(v_eric);
  v_p1 := pg_temp.perf('select * from public.unified_transactions');
  perform pg_temp.act(null);
  perform pg_temp.rec('P: unified_transactions Laufzeit als Eric (EXPLAIN ANALYZE, bester von 3, ms) vorher/nachher', true,
    'vorher_ms=' || round(v_p0, 1) || ' nachher_ms=' || round(v_p1, 1) || ' faktor=' || round(v_p1 / nullif(v_p0, 0), 2));

  -- R1: Eric identisch ueber alle Objekte; Mitglied: alles ausser category_tree(alle) identisch
  for r in select a.who, a.nm, a.hv h0, b2.hv h1 from t_h a join t_h b2 on b2.who = a.who and b2.nm = a.nm and b2.phase = 1
            where a.phase = 0 and not (a.who = 'member' and a.nm = 'category_tree(alle)') order by 1, 2 loop
    perform pg_temp.rec('R1: ' || r.who || ' ' || r.nm || ' vorher = nachher', r.h0 = r.h1,
      'zeilen=' || split_part(r.h1, '/', 2) || ' hash_vorher=' || left(r.h0, 8) || ' hash_nachher=' || left(r.h1, 8));
  end loop;
  -- R2: Mitglied sieht dieselben Buchungszeilen/Rollen wie Eric (Erics Rolle auf Erics Buchungen)
  for r in select a.nm, a.hv ha, b2.hv hb from t_h a join t_h b2 on b2.nm = a.nm and b2.phase = a.phase and b2.who = 'member'
            where a.who = 'eric' and a.phase = 1 and a.nm in ('unified_transactions', 'monthly_flows', 'monthly_umbuchungen', 'monthly_flow_totals', 'category_tree(struktur)') order by 1 loop
    perform pg_temp.rec('R2: Mitglied sieht dasselbe wie Eric: ' || r.nm, r.ha = r.hb, 'zeilen=' || split_part(r.ha, '/', 2));
  end loop;
  -- R3: Mitglied hat keine eigenen Overrides -> category_tree zeigt ihm keine Steuerwerte (Aufruferwerte)
  perform pg_temp.act(v_mem);
  v_cnt := pg_temp.q('select count(*) from public.category_tree where tax_role_effective is not null or euer_zeile_effective is not null')::bigint;
  perform pg_temp.act(null);
  perform pg_temp.rec('R3: category_tree fuer Mitglied ohne Overrides: keine Steuerwerte (kein Rueckfall auf Erics Spalten)', v_cnt = 0, 'zeilen_mit_wert=' || v_cnt);

  -- ===== Struktur =====
  begin
    perform pg_temp.rec('S1: unified_transactions hat weiter 36 Spalten, category_tree 11',
      (select count(*) from pg_attribute where attrelid = 'public.unified_transactions'::regclass and attnum > 0 and not attisdropped) = 36
      and (select count(*) from pg_attribute where attrelid = 'public.category_tree'::regclass and attnum > 0 and not attisdropped) = 11, null);
    perform pg_temp.rec('S2: security_invoker auf allen Auswertungs-Views',
      (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
         and c.relname in ('category_tree', 'unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'monthly_umbuchungen', 'account_balance_sums_unified')
         and coalesce(c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true'], false)) = 6, null);
    perform pg_temp.rec('S3: anon hat keinen Zugriff, authenticated nur SELECT (category_tree, unified_transactions)',
      not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('category_tree', 'unified_transactions'))
      and (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and table_name = 'unified_transactions') = array['SELECT']
      and (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and table_name = 'category_tree') = array['SELECT'], null);
  exception when others then
    perform pg_temp.act(null);
    perform pg_temp.rec('S: Struktur', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- ===== Personen-Fixture (als Superuser; alles wird zurueckgerollt) =====
  begin
    insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values
      (v_f, 'fx-peer-' || v_f || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
      (v_x, 'fx-outsider-' || v_x || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
    insert into public.household_members (household_id, user_id, role) values (v_hh, v_f, 'member');

    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_eric, 'fx-a-eric', 'checking', 'EUR', v_ibA) returning id into v_ae;
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_f, 'fx-b-peer', 'checking', 'EUR', v_ibB) returning id into v_af;

    -- Baum: root -> child; d (Legacy-Spalte tax_role = 'lohn', KEIN Override); k1 <-> k2 (Zyklus ohne Wurzel)
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'fx-root', 'expense', 0) returning id into v_root;
    insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-child', 'expense', 0, v_root) returning id into v_child;
    insert into public.categories (user_id, name, type, sort_order, tax_role) values (v_eric, 'fx-legacy', 'expense', 0, 'lohn') returning id into v_d;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'fx-k1', 'expense', 0) returning id into v_k1;
    insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-k2', 'expense', 0, v_k1) returning id into v_k2;
    update public.categories set parent_id = v_k2 where id = v_k1;

    insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile) values
      (v_root, v_eric, 'betriebsausgabe', 20),
      (v_root, v_f, 'privat', null),
      (v_child, v_f, null, 33),
      (v_k1, v_eric, 'lohn', null);

    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, 'DE00EXTERN', -10, current_date, 'fx b1', v_child) returning id into v_b1;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_f, v_ibB, 'DE00EXTERN', -11, current_date, 'fx b2', v_child) returning id into v_b2;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, 'DE00EXTERN', -12, current_date, 'fx b3', v_d) returning id into v_b3;

    -- T1: Buchung Eric auf child: erbt Erics root-Override (betriebsausgabe/20), egal wer fragt
    -- T2: Buchung Peer auf child: SEINE Werte (tax 'privat' von root, euer 33 vom child)
    -- T3: Buchung Eric auf Legacy-Kategorie: NULL (kein Override), obwohl die Spalte 'lohn' sagt
    foreach v_a in array array['eric', 'peer', 'service'] loop
      perform pg_temp.act(case v_a when 'eric' then v_eric when 'peer' then v_f else null end);
      v_b := pg_temp.q('select tax_role_effective || ''/'' || euer_zeile_effective from public.unified_transactions where id = ''' || v_b1 || '''');
      v_c := pg_temp.q('select tax_role_effective || ''/'' || euer_zeile_effective from public.unified_transactions where id = ''' || v_b2 || '''');
      perform pg_temp.rec('T1/T2: Sicht ' || v_a || ': Erics Buchung traegt Erics Rolle, Peer-Buchung die des Peers',
        v_b = 'betriebsausgabe/20' and v_c = 'privat/33', null);
      v_bool := pg_temp.q('select (tax_role_effective is null and euer_zeile_effective is null)::text from public.unified_transactions where id = ''' || v_b3 || '''')::boolean;
      perform pg_temp.act(null);
      perform pg_temp.rec('T3: Sicht ' || v_a || ': Buchung ohne Override des Besitzers -> NULL (kein Rueckfall auf Legacy-Spalte)', v_bool, null);
    end loop;

    -- T4: monthly_flows/monthly_umbuchungen tragen die Rolle des Buchungsbesitzers
    perform pg_temp.act(v_f);
    v_cnt := pg_temp.q('select count(*) from public.monthly_flows where user_id = ''' || v_f || ''' and tax_role_effective = ''privat''')::bigint;
    -- Erics Zeilen derselben Fixture-Kategorie tragen Erics Rolle (nicht die des Peers)
    v_a := pg_temp.q('select count(*) from public.monthly_flows where user_id = ''' || v_eric || ''' and category_id = ''' || v_child || ''' and tax_role_effective = ''betriebsausgabe''');
    v_b := pg_temp.q('select count(*) from public.monthly_flows where user_id = ''' || v_eric || ''' and category_id = ''' || v_child || ''' and tax_role_effective is distinct from ''betriebsausgabe''');
    perform pg_temp.act(null);
    perform pg_temp.rec('T4: monthly_flows: Peer-Zeilen mit Peer-Rolle, Erics Zeilen derselben Kategorie mit Erics Rolle', v_cnt >= 1 and v_a::bigint >= 1 and v_b::bigint = 0, 'peer=' || v_cnt || ' eric_ok=' || v_a || ' eric_abweichend=' || v_b);

    -- T5: category_tree = Aufruferwerte; Zyklus: nur eigener Wert
    perform pg_temp.act(v_eric);
    v_a := pg_temp.q('select tax_role_effective || ''/'' || euer_zeile_effective from public.category_tree where id = ''' || v_child || '''');
    v_b := pg_temp.q('select coalesce(tax_role_effective, ''null'') from public.category_tree where id = ''' || v_k1 || '''');
    v_c := pg_temp.q('select coalesce(tax_role_effective, ''null'') from public.category_tree where id = ''' || v_k2 || '''');
    perform pg_temp.act(v_f);
    v_cnt := 0;
    perform pg_temp.rec('T5a: category_tree als Eric: child erbt betriebsausgabe/20', v_a = 'betriebsausgabe/20', null);
    perform pg_temp.rec('T5b: Zyklus-Knoten nur eigener Wert (k1 lohn, k2 NULL, wie vorher)', v_b = 'lohn' and v_c = 'null', null);
    v_a := pg_temp.q('select tax_role_effective || ''/'' || euer_zeile_effective from public.category_tree where id = ''' || v_child || '''');
    perform pg_temp.act(v_x);
    v_b := pg_temp.q('select coalesce(tax_role_effective, ''null'') from public.category_tree where id = ''' || v_child || '''');
    perform pg_temp.act(null);
    perform pg_temp.rec('T5c: category_tree als Peer: child = privat/33; als Fremder: kein Wert', v_a = 'privat/33' and coalesce(v_b, 'null') = 'null', null);  -- Fremder sieht die Kategorie per RLS gar nicht (NULL)

    -- T6: Zugriff: Fremder sieht keine Overrides/effektiven Werte von Eric/Peer; Peer sieht Erics effektive Werte, aber nie die Rohtabelle
    perform pg_temp.act(v_x);
    v_cnt := pg_temp.q('select count(*) from public.fn_category_tax_effective() where user_id in (''' || v_eric || ''', ''' || v_f || ''')')::bigint;
    perform pg_temp.act(v_f);
    v_a := pg_temp.q('select count(*) from public.fn_category_tax_effective() where user_id = ''' || v_eric || '''');
    v_b := pg_temp.q('select count(*) from public.category_tax_overrides where user_id = ''' || v_eric || '''');
    perform pg_temp.act(null);
    perform pg_temp.rec('T6: Fremder 0 Zeilen; Peer sieht effektive Werte von Eric (>0), aber die Rohtabelle nicht (0)', v_cnt = 0 and v_a::bigint > 0 and v_b::bigint = 0, 'fremder=' || v_cnt || ' peer_eff=' || v_a || ' peer_roh=' || v_b);

    -- T7: Schreiben nur fuer den Besitzer: Peer darf keine Override-Zeile fuer Eric anlegen/aendern
    perform pg_temp.act(v_f);
    begin
      insert into public.category_tax_overrides (category_id, user_id, tax_role) values (v_d, v_eric, 'privat');
      v_bool := false;
    exception when others then v_bool := true; end;
    update public.category_tax_overrides set tax_role = 'privat' where category_id = v_root and user_id = v_eric;
    get diagnostics v_cnt = row_count;
    perform pg_temp.act(null);
    perform pg_temp.rec('T7: Peer kann Erics Overrides weder anlegen noch aendern', v_bool and v_cnt = 0, null);

    -- T8: Eric aendert seinen Override -> betrifft den Peer nicht
    update public.category_tax_overrides set tax_role = 'lohn' where category_id = v_root and user_id = v_eric;
    perform pg_temp.act(v_f);
    v_a := pg_temp.q('select tax_role_effective from public.unified_transactions where id = ''' || v_b2 || '''');
    perform pg_temp.act(v_eric);
    v_b := pg_temp.q('select tax_role_effective from public.unified_transactions where id = ''' || v_b1 || '''');
    perform pg_temp.act(null);
    perform pg_temp.rec('T8: Erics geaenderter Override aendert nur Erics Buchungen (Peer bleibt privat)', v_a = 'privat' and v_b = 'lohn', null);
  exception when others then
    perform pg_temp.act(null);
    perform pg_temp.rec('T: Fixture/Szenarien', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- @@ROLLBACK
  -- ===== Nach Rollback: Definitionsstand wie vorher =====
  -- (Nur sinnvoll, wenn beide Marker gesetzt sind; sonst leer lassen.)
  -- perform pg_temp.rec('RB: View-/Funktionsstand nach Rollback = Ausgangszustand', pg_temp.vstate() = v_s0, null);

  -- ===== Bericht =====
  perform pg_temp.act(null);
  select count(*) filter (where ok), count(*) into v_ok, v_all from t_res;
  select string_agg(case when ok then 'OK   ' else 'FAIL ' end || name || coalesce(' [' || wert || ']', ''), E'\n' order by ok, name) into v_rep from t_res;
  raise exception E'TAX-OVERRIDES-BERICHT %/% bestanden\n%', v_ok, v_all, v_rep;
end
$outer$;
