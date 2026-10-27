-- RLS-Isolationstest Haushalt (Phase 1 + 2): Eric (Owner), Malik (Mitglied), Outsider (kein Haushalt).
--
-- ACHTUNG: Dieses Skript SCHREIBT (Fixture-Nutzer, Testzeilen, Migrationen, Rollbacks) und ist nur sicher, weil es
-- in EINEM einzigen DO-Block laeuft, der am Ende IMMER mit `raise exception` endet. Postgres rollt dadurch die gesamte
-- Transaktion zurueck: nichts wird persistiert. Der Testbericht steht in der Fehlermeldung (Zeile "ISOLATIONSTEST-BERICHT").
--
-- So laeuft es (Live-DB, Sicherheitsprotokoll):
--   1. Vorher lesend kontrollieren (Zaehlungen Tabellen/Policies/shared-Spalten/Funktionen, accounts, audit_log, Hash ueber pg_policies).
--   2. EIN execute_sql-Aufruf (MCP) bzw. ein einziger Lauf im SQL-Editor mit diesem Block. Keine Teile ausserhalb.
--      Die Marker `-- @@MIGRATIONEN` / `-- @@ROLLBACKS` unten werden beim Ausfuehren durch
--         execute $m1$ <Inhalt der Migrationsdatei> $m1$;   (je Datei eigener Tag $m1$..$m6$ bzw. $r1$..$r6$)
--      ersetzt, in dieser Reihenfolge:
--        Migrationen: 20261027100000, 20261027110000, 20261027120000, 20261028100000, 20261028110000, 20261028120000
--        Rollbacks (umgekehrt): 20261028120000, 20261028110000, 20261028100000, 20261027120000, 20261027110000, 20261027100000
--      Soll nur gegen eine DB getestet werden, in der die Migrationen schon angewendet sind: Marker @@MIGRATIONEN und
--      @@ROLLBACKS leer lassen (Test k vergleicht dann trivial).
--   3. Nachher lesend kontrollieren: Werte aus Schritt 1 muessen identisch sein. Falls der Aufruf NICHT per Exception endet,
--      sofort per SELECT pruefen, dass nichts persistiert ist.
-- Auth-Simulation: `set local role authenticated` + `request.jwt.claims` ({"sub":...}); auth.uid() liest dieses Claim.
-- Ergebnis je Test: (name, ok, wert). Keine Nutzerdaten im Bericht, nur Zaehlwerte und true/false.

do $outer$
declare
  v_eric uuid; v_mal uuid; v_out uuid := gen_random_uuid(); v_hh uuid;
  v_hash0 text; v_hash1 text; v_hash2 text; v_state0 text; v_state1 text; v_state2 text;
  v_rep text; v_ok int; v_all int;
  t text; n bigint; x_e bigint; x_m bigint; x_o bigint; n_e bigint; n_m bigint; n_o bigint; rc int;
  v_con uuid; v_val uuid; v_val_out uuid; v_cat uuid; v_hhc uuid; b boolean; arr uuid[]; exp uuid[];
  t0 timestamptz; ms numeric;
  v_tabs text[] := array['accounts','transactions','bank_transactions','bank_balance','contracts','debts','savings_goals',
    'valuables','valuable_valuations','valuable_images','valuable_documents','depots','depot_transactions','savings_plans',
    'depot_holdings','budget_categories','budget_items','assets','categories','asset_audit_log',
    'account_balances','contract_executions','debt_payments','asset_valuations'];
  v_oo text[] := array['exchange_keys','belege','ai_conversations','reports','user_settings','net_worth_snapshots',
    'portfolio_snapshots','kraken_trades','insights','income_targets','category_tax_overrides'];
  v_views text[] := array['v_audit_feed','category_tree','unified_transactions','monthly_flows'];
  v_fn0 text; v_s text; v_cat_a0 bigint; v_cat_a1 bigint; v_fremd uuid; v_ecat uuid;
  v_audit_tabs text[] := array['transactions','bank_transactions','accounts','contracts','debts',
    'savings_goals','valuables','assets','depots','depot_transactions','savings_plans','budget_categories','budget_items'];
begin
  -- ===== Infrastruktur (temporaer, wird mit der Transaktion verworfen) =====
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

  create function pg_temp.cnt(t text) returns bigint language plpgsql as
  $f$ declare n bigint; begin execute format('select count(*) from public.%I', t) into n; return n; end $f$;

  -- Zeilen, die dem Nutzer u gehoeren (Kind-Tabellen ueber das Elternobjekt); als Superuser aufrufen
  create function pg_temp.own(t text, u uuid) returns bigint language plpgsql as
  $f$ declare n bigint; begin
    if t = 'account_balances' then
      select count(*) into n from public.account_balances where account_id in (select id from public.accounts where user_id = u);
    elsif t = 'contract_executions' then
      select count(*) into n from public.contract_executions where contract_id in (select id from public.contracts where user_id = u);
    elsif t = 'debt_payments' then
      select count(*) into n from public.debt_payments where debt_id in (select id from public.debts where user_id = u);
    elsif t = 'asset_valuations' then
      select count(*) into n from public.asset_valuations where asset_id in (select id from public.assets where user_id = u);
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('select count(*) from public.%I where user_id = $1', t) into n using u;
    else n := 0; end if;
    return n;
  end $f$;

  create function pg_temp.phash() returns text language sql as
  $f$ select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||'.'||cmd||'.'||coalesce(roles::text,'')||'.'||coalesce(qual,'')||'.'||coalesce(with_check,''),'|' order by schemaname,tablename,policyname))
      from pg_policies where schemaname in ('public','storage') $f$;

  create function pg_temp.state() returns text language sql as
  $f$ select concat_ws('|',
     (select count(*) from pg_tables where schemaname='public'),
     (select count(*) from pg_policies where schemaname='public'),
     (select count(*) from information_schema.columns where table_schema='public' and column_name='shared'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
     (select count(*) from pg_trigger where not tgisinternal and tgname like 'trg_audit_%'),
     (select md5(regexp_replace(p.prosrc,'\s+','','g') || p.prosecdef::text || coalesce(p.proconfig::text,'')) from pg_proc p where p.proname='fn_audit' and p.pronamespace='public'::regnamespace),
     (select count(*) from information_schema.columns where table_schema='public' and table_name='audit_log'),
     (select count(*) from pg_trigger where not tgisinternal and tgname='trg_categories_set_household'),
     (select count(*) from information_schema.columns where table_schema='public' and table_name='categories' and column_name='household_id')) $f$;

  v_fn0 := (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='fn_audit' and p.pronamespace='public'::regnamespace);
  v_hash0 := pg_temp.phash();
  v_state0 := pg_temp.state();

  select count(*) into v_cat_a0 from public.audit_log where table_name = 'categories';

  -- @@MIGRATIONEN (hier die sechs Bloecke einfuegen:  v_s := $mN$ ...Dateiinhalt... $mN$; perform pg_temp.rec('md5 ...', md5(regexp_replace(v_s,'\s+','','g')) = '<erwartet>', ...); execute v_s;)

  select count(*) into v_cat_a1 from public.audit_log where table_name = 'categories';
  perform pg_temp.rec('o: Backfill erzeugt keine neuen audit_log-Zeilen fuer categories', v_cat_a0 = v_cat_a1, 'vorher=' || v_cat_a0 || ' nachher=' || v_cat_a1);

  v_hash1 := pg_temp.phash();
  v_state1 := pg_temp.state();
  perform pg_temp.rec('m0: Migrationen veraendern pg_policies (Hash neu)', v_hash1 <> v_hash0, v_state0 || ' -> ' || v_state1);

  -- ===== Fixture =====
  select m.user_id, m.household_id into v_eric, v_hh from public.household_members m where m.role = 'owner' limit 1;
  perform pg_temp.rec('m1: Owner Eric in household_members gefunden', v_eric is not null, (v_eric is not null)::text);
  select count(*) into n from public.households where name = 'Haushalt Schuck';
  perform pg_temp.rec('m2: Haushalt Schuck genau einmal', n = 1, n::text);
  select count(*) into n from public.accounts where shared;
  perform pg_temp.rec('m3: genau 1 geteiltes Konto', n = 1, n::text);
  select count(*) into n from information_schema.columns where table_schema='public' and column_name='shared' and table_name in
    ('accounts','valuables','depots','depot_holdings','depot_transactions','savings_plans','contracts','debts','savings_goals','budget_categories','budget_items','assets');
  perform pg_temp.rec('m4: shared-Spalte auf 12 Tabellen', n = 12, n::text);

  v_mal := gen_random_uuid();
  insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values
    (v_mal, 'fx-malik-' || v_mal || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
    (v_out, 'fx-outsider-' || v_out || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
  insert into public.household_members (household_id, user_id, role) values (v_hh, v_mal, 'member');
  -- Outsider: eigenes Inventarstueck (Fixture, als Superuser) fuer Eltern-Besitz-Tests
  insert into public.valuables (user_id, name) values (v_out, 'fx-out-valuable') returning id into v_val_out;
  -- synthetische Audit-Zeile fuer belege (owner-only), Besitzer Eric
  begin
    insert into public.audit_log (user_id, table_name, action, owner_id, actor_id, actor_kind)
    values (v_eric, 'belege', 'UPDATE', v_eric, v_eric, 'user');
  exception when others then
    perform pg_temp.rec('f0: synthetische belege-Audit-Zeile angelegt', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ===== z: Auth-Simulation =====
  perform pg_temp.act(v_mal);
  perform pg_temp.rec('z1: auth.uid() liefert Malik, Rolle authenticated', auth.uid() = v_mal and current_user = 'authenticated', 'uid_ok=' || (auth.uid() = v_mal)::text);
  perform pg_temp.act(null);
  perform pg_temp.rec('z2: ohne Claim auth.uid() null (System)', auth.uid() is null, (auth.uid() is null)::text);

  -- ===== a, b, l: Sichtbarkeit je Tabelle (Eric/Malik/Outsider), Rekursion =====
  t0 := clock_timestamp();
  foreach t in array v_tabs loop
    begin
      perform pg_temp.act(null);
      n_e := pg_temp.own(t, v_eric); n_m := pg_temp.own(t, v_mal); n_o := pg_temp.own(t, v_out);
      perform pg_temp.act(v_eric); x_e := pg_temp.cnt(t);
      perform pg_temp.act(v_mal);  x_m := pg_temp.cnt(t);
      perform pg_temp.act(v_out);  x_o := pg_temp.cnt(t);
      perform pg_temp.act(null);
      perform pg_temp.rec('a: Malik sieht wie Eric: ' || t, x_m = x_e and x_m = n_e + n_m,
        'eric_eigen=' || n_e || ' eric_sicht=' || x_e || ' malik_sicht=' || x_m || case when n_e = 0 then ' (Tabelle leer: nicht aussagekraeftig)' else '' end);
      perform pg_temp.rec('b: Outsider sieht nur Eigenes: ' || t, x_o = n_o, 'outsider_sicht=' || x_o || ' outsider_eigen=' || n_o);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('a/b/l: ' || t, false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  ms := extract(milliseconds from clock_timestamp() - t0);
  perform pg_temp.rec('l: alle Tabellen-SELECTs (3 Rollen) ohne Rekursionsfehler', not exists (select 1 from pg_temp.t_res where name like 'a/b/l:%'), 'gesamt_ms=' || round(ms));

  -- Views (security_invoker) unter Malik/Outsider
  t0 := clock_timestamp();
  foreach t in array v_views loop
    begin
      if to_regclass('public.' || t) is null then
        perform pg_temp.rec('l: View ' || t, false, 'View fehlt');
      else
        perform pg_temp.act(v_mal);  x_m := pg_temp.cnt(t);
        perform pg_temp.act(v_out);  x_o := pg_temp.cnt(t);
        perform pg_temp.act(null);
        perform pg_temp.rec('l: View ' || t || ' lesbar ohne Fehler', true, 'malik=' || x_m || ' outsider=' || x_o);
      end if;
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('l: View ' || t, false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  ms := extract(milliseconds from clock_timestamp() - t0);
  perform pg_temp.rec('l: View-Laufzeit (Info)', true, 'ms=' || round(ms));

  -- ===== c: owner-only =====
  foreach t in array v_oo loop
    begin
      if to_regclass('public.' || t) is null then
        perform pg_temp.rec('c: owner-only ' || t, false, 'Tabelle fehlt');
        continue;
      end if;
      perform pg_temp.act(null);
      n_m := pg_temp.own(t, v_mal); n_o := pg_temp.own(t, v_out);
      perform pg_temp.act(v_eric); x_e := pg_temp.cnt(t);
      perform pg_temp.act(v_mal);
      begin x_m := pg_temp.cnt(t); exception when insufficient_privilege then x_m := n_m; end;
      perform pg_temp.act(v_out);
      begin x_o := pg_temp.cnt(t); exception when insufficient_privilege then x_o := n_o; end;
      perform pg_temp.act(null);
      perform pg_temp.rec('c: owner-only fuer Malik/Outsider privat: ' || t, x_m = n_m and x_o = n_o,
        'eric_sicht=' || x_e || ' malik_sicht=' || x_m || ' (eigen ' || n_m || ') outsider_sicht=' || x_o || ' (eigen ' || n_o || ')'
        || case when x_e = 0 then ' (Eric-Tabelle leer: nicht aussagekraeftig)' else '' end);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('c: owner-only ' || t, false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- ===== g: user_profiles =====
  perform pg_temp.act(v_mal); select count(*) into x_m from public.user_profiles where id = v_eric;
  perform pg_temp.act(v_out); select count(*) into x_o from public.user_profiles where id = v_eric;
  perform pg_temp.act(null);
  perform pg_temp.rec('g1: Malik sieht Profil von Eric', x_m = 1, x_m::text);
  perform pg_temp.rec('g2: Outsider sieht Profil von Eric nicht', x_o = 0, x_o::text);
  perform pg_temp.act(v_mal);
  update public.user_profiles set display_name = display_name where id = v_eric; get diagnostics rc = row_count;
  perform pg_temp.rec('g3: Malik schreibt fremdes Profil: 0 Zeilen', rc = 0, rc::text);
  perform pg_temp.act(v_out);
  update public.user_profiles set display_name = display_name where id = v_eric; get diagnostics rc = row_count;
  perform pg_temp.act(null);
  perform pg_temp.rec('g4: Outsider schreibt fremdes Profil: 0 Zeilen', rc = 0, rc::text);

  -- ===== j: Funktionen =====
  exp := array(select u from unnest(array[v_eric, v_mal]) u order by u);
  perform pg_temp.act(v_mal);
  select public.is_household_member(v_hh) into b; select array_agg(x order by x) into arr from public.household_peer_ids() x;
  perform pg_temp.rec('j1: Malik: is_household_member(Haushalt)=true', b, b::text);
  perform pg_temp.rec('j2: Malik: household_peer_ids = {Eric, Malik}', arr = exp, 'anzahl=' || coalesce(cardinality(arr), 0));
  perform pg_temp.act(v_out);
  select public.is_household_member(v_hh) into b; select array_agg(x order by x) into arr from public.household_peer_ids() x;
  perform pg_temp.rec('j3: Outsider: is_household_member(Haushalt)=false', b = false, b::text);
  perform pg_temp.rec('j4: Outsider: household_peer_ids = {er selbst}', arr = array[v_out], 'anzahl=' || coalesce(cardinality(arr), 0));
  perform pg_temp.act(null);
  select count(*) into n from public.household_peer_ids();
  perform pg_temp.rec('j5: ohne Claim: household_peer_ids leer', n = 0, n::text);
  -- Haushalts-Tabellen: Mitglieder sehen Haushalt, Outsider nicht
  perform pg_temp.act(v_mal); x_m := pg_temp.cnt('households') + pg_temp.cnt('household_members');
  perform pg_temp.act(v_out); x_o := pg_temp.cnt('households') + pg_temp.cnt('household_members');
  perform pg_temp.act(null);
  perform pg_temp.rec('j6: households/household_members: Malik >0, Outsider 0', x_m >= 3 and x_o = 0, 'malik=' || x_m || ' outsider=' || x_o);

  -- ===== d: Schreiben =====
  select id into v_con from public.contracts where user_id = v_eric order by id limit 1;
  select id into v_val from public.valuables where user_id = v_eric order by id limit 1;
  perform pg_temp.rec('d0: Eric hat Vertrag und Inventar fuer Schreibtests', v_con is not null and v_val is not null, (v_con is not null)::text || '/' || (v_val is not null)::text);

  perform pg_temp.act(v_mal);
  begin
    insert into public.accounts (user_id, name, type, currency) select v_mal, 'fx-konto', type, 'EUR' from public.accounts where user_id = v_eric limit 1;
    get diagnostics rc = row_count;
    perform pg_temp.rec('d1: Malik legt Konto fuer sich an', rc = 1, rc::text);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d1: Malik legt Konto fuer sich an', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.contracts set notes = coalesce(notes, '') || '#fx' where id = v_con; get diagnostics rc = row_count;
    perform pg_temp.rec('d2: Malik aendert Vertrag von Eric (1 Zeile)', rc = 1, rc::text);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d2: Malik aendert Vertrag von Eric', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.accounts (user_id, name, type, currency) select v_out, 'fx-konto-fremd', type, 'EUR' from public.accounts where user_id = v_eric limit 1;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d3: Malik legt Konto mit user_id=Outsider an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d3: Malik legt Konto mit user_id=Outsider an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d3: Malik legt Konto mit user_id=Outsider an: verweigert', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.valuable_valuations (valuable_id, user_id, wert, bewertet_am) values (v_val, v_mal, 1, date '1900-01-01'); get diagnostics rc = row_count;
    perform pg_temp.rec('d4: Malik legt Bewertung (user_id=Malik) auf Erics Inventar an', rc = 1, rc::text);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d4: Malik legt Bewertung auf Erics Inventar an', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.valuable_valuations (valuable_id, user_id, wert) values (v_val_out, v_mal, 1);
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d5: Malik haengt Bewertung an fremdes Inventar (Outsider): verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d5: Malik haengt Bewertung an fremdes Inventar (Outsider): verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d5: Bewertung an fremdes Inventar', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.category_tax_overrides (category_id, user_id)
    select c.id, v_eric from public.categories c
    where not exists (select 1 from public.category_tax_overrides o where o.category_id = c.id and o.user_id = v_eric) limit 1;
    get diagnostics rc = row_count;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d6: Malik schreibt Steuer-Override fuer Eric: verweigert/0 Zeilen', rc = 0, 'rc=' || rc);
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d6: Malik schreibt Steuer-Override fuer Eric: verweigert/0 Zeilen', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('d6: Steuer-Override fuer Eric', false, sqlstate || ' ' || sqlerrm);
  end;

  perform pg_temp.act(v_out);
  begin
    insert into public.valuable_valuations (valuable_id, user_id, wert) values (v_val, v_out, 1);
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d7: Outsider legt Bewertung auf Erics Inventar an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d7: Outsider legt Bewertung auf Erics Inventar an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d7: Outsider-Bewertung', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.valuable_valuations (valuable_id, user_id, wert) values (v_val, v_eric, 1);
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d8: Outsider legt Bewertung mit user_id=Eric an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d8: Outsider legt Bewertung mit user_id=Eric an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('d8: Outsider-Bewertung user_id=Eric', false, sqlstate || ' ' || sqlerrm);
  end;

  -- ===== e: Outsider kann Erics Daten nicht aendern/loeschen =====
  perform pg_temp.act(v_out);
  foreach t in array array['contracts','accounts','transactions','bank_transactions','debts','valuables','categories','savings_goals','assets'] loop
    begin
      execute format('update public.%I set user_id = user_id where user_id = $1', t) using v_eric; get diagnostics rc = row_count;
      execute format('delete from public.%I where user_id = $1', t) using v_eric; get diagnostics n = row_count;
      perform pg_temp.rec('e: Outsider update/delete auf Eric-Zeilen: 0/0 ' || t, rc = 0 and n = 0, 'update=' || rc || ' delete=' || n);
    exception when others then
      perform pg_temp.act(v_out);
      perform pg_temp.rec('e: Outsider update/delete ' || t, sqlstate = '42501', 'Fehler ' || sqlstate);
    end;
  end loop;
  perform pg_temp.act(null);
  select count(*) into n from public.contracts where user_id = v_eric;
  perform pg_temp.rec('e2: Erics Vertraege nach Outsider-Loeschversuch unveraendert (>0)', n > 0, n::text);

  -- ===== f: audit_log =====
  select count(*) into n from public.audit_log
   where record_id = v_con and table_name = 'contracts' and actor_id = v_mal and actor_kind = 'user' and owner_id = v_eric and user_id = v_mal;
  perform pg_temp.rec('f1: Aenderung durch Malik: actor_id=Malik, actor_kind=user, owner_id=Eric', n >= 1, n::text);
  update public.contracts set notes = coalesce(notes, '') || '#sys' where id = v_con;
  select count(*) into n from public.audit_log
   where record_id = v_con and table_name = 'contracts' and actor_id is null and actor_kind = 'system' and owner_id = v_eric;
  perform pg_temp.rec('f2: Aenderung unter reset role (Service/Superuser): actor_kind=system', n = 1, n::text);
  select count(*) into n from public.audit_log where owner_id = v_eric and table_name = any (v_audit_tabs);
  perform pg_temp.act(v_mal); select count(*) into x_m from public.audit_log where owner_id = v_eric and table_name = any (v_audit_tabs);
  perform pg_temp.rec('f3: Malik sieht alle Audit-Zeilen von Erics Haushaltstabellen', x_m = n and n > 0, 'eric_zeilen=' || n || ' malik_sicht=' || x_m);
  select count(*) into x_m from public.audit_log where table_name = 'belege';
  perform pg_temp.act(v_eric); select count(*) into x_e from public.audit_log where table_name = 'belege';
  perform pg_temp.rec('f4: Malik sieht keine belege-Audit-Zeilen (Eric schon)', x_m = 0 and x_e >= 1, 'malik=' || x_m || ' eric=' || x_e);
  perform pg_temp.act(null); n_o := pg_temp.own('audit_log', v_out);
  perform pg_temp.act(v_out);
  select count(*) into x_o from public.audit_log where owner_id = v_eric or user_id = v_eric;
  select count(*) into n from public.audit_log;
  perform pg_temp.act(null);
  perform pg_temp.rec('f5: Outsider sieht keine Audit-Zeilen von Eric', x_o = 0 and n = n_o, 'eric_zeilen_sichtbar=' || x_o || ' gesamt_sichtbar=' || n || ' eigene=' || n_o);
  select count(*) into n from public.v_audit_feed where false;
  perform pg_temp.act(v_mal);
  select count(*) into x_m from public.v_audit_feed where record_id = v_con and actor_id = v_mal;
  perform pg_temp.act(null);
  perform pg_temp.rec('f6: v_audit_feed zeigt Malik die eigene Aktion', x_m >= 1, x_m::text);

  -- p: Malik sieht keine categories-Audit-Zeilen von Eric (Policy listet categories nicht mehr)
  select count(*) into n from public.audit_log where table_name = 'categories' and owner_id = v_eric;
  perform pg_temp.act(v_mal);
  select count(*) into x_m from public.audit_log where table_name = 'categories' and owner_id = v_eric;
  perform pg_temp.act(v_eric);
  select count(*) into x_e from public.audit_log where table_name = 'categories' and owner_id = v_eric;
  perform pg_temp.act(null);
  perform pg_temp.rec('p: Malik sieht keine categories-Audit-Zeilen von Eric (Eric schon)', x_m = 0 and x_e = n and n > 0, 'gesamt=' || n || ' malik=' || x_m || ' eric=' || x_e);

  -- n: asset_audit_log fuer Peers nur SELECT + INSERT
  select action into t from public.asset_audit_log where user_id = v_eric limit 1;
  perform pg_temp.act(v_mal);
  begin
    insert into public.asset_audit_log (user_id, asset_name, asset_symbol, action) values (v_mal, 'fx', 'FX', coalesce(t, 'update'));
    get diagnostics rc = row_count;
    perform pg_temp.rec('n1: Malik fuegt asset_audit_log-Zeile an', rc = 1, rc::text);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('n1: Malik fuegt asset_audit_log-Zeile an', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.asset_audit_log set asset_name = asset_name where user_id = v_eric; get diagnostics rc = row_count;
    delete from public.asset_audit_log where user_id = v_eric; get diagnostics n = row_count;
    perform pg_temp.rec('n2: Malik aendert/loescht asset_audit_log von Eric: 0/0 Zeilen', rc = 0 and n = 0, 'update=' || rc || ' delete=' || n);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('n2: Malik update/delete asset_audit_log', sqlstate = '42501', 'Fehler ' || sqlstate);
  end;
  begin
    insert into public.asset_audit_log (user_id, asset_name, asset_symbol, action) values (v_out, 'fx', 'FX', coalesce(t, 'update'));
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('n3: Malik fuegt asset_audit_log mit user_id=Outsider an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('n3: Malik fuegt asset_audit_log mit user_id=Outsider an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('n3: asset_audit_log user_id=Outsider', false, sqlstate || ' ' || sqlerrm);
  end;
  perform pg_temp.act(null);
  select count(*) into n from public.asset_audit_log where user_id = v_eric;
  perform pg_temp.rec('n4: Erics asset_audit_log-Zeilen nach Loeschversuch unveraendert (>0)', n > 0, n::text);

  -- m: categories-Schreibschutz (user_id / household_id muessen zusammenpassen)
  insert into public.households (name) values ('fx-fremd-haushalt') returning id into v_fremd;
  select id into v_ecat from public.categories where user_id = v_eric order by id limit 1;
  perform pg_temp.act(v_mal);
  begin
    insert into public.categories (user_id, name, type) select v_out, 'fx-kat-out', type from public.categories where user_id = v_eric limit 1;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m1: Malik legt Kategorie mit user_id=Outsider an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m1: Malik legt Kategorie mit user_id=Outsider an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m1: Kategorie user_id=Outsider', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.categories (user_id, name, type, household_id) select v_mal, 'fx-kat-fremd', type, v_fremd from public.categories where user_id = v_eric limit 1;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m2: Malik legt Kategorie mit household_id eines fremden Haushalts an: verweigert', false, 'WURDE ANGELEGT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m2: Malik legt Kategorie mit household_id eines fremden Haushalts an: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m2: Kategorie fremde household_id', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.categories set household_id = v_fremd where id = v_ecat;
    get diagnostics rc = row_count;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m3: Malik schreibt Erics Kategorie auf fremde household_id um: verweigert', false, 'rc=' || rc);
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m3: Malik schreibt Erics Kategorie auf fremde household_id um: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m3: Umschreiben household_id', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.categories set user_id = v_out where id = v_ecat;
    get diagnostics rc = row_count;
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m4: Malik schreibt Erics Kategorie auf user_id=Outsider um: verweigert', false, 'rc=' || rc);
  exception when insufficient_privilege then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m4: Malik schreibt Erics Kategorie auf user_id=Outsider um: verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m4: Umschreiben user_id', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.categories set name = name || '#fx' where id = v_ecat; get diagnostics rc = row_count;
    perform pg_temp.rec('m5: Malik darf Erics Kategorie normal aendern (1 Zeile)', rc = 1, rc::text);
  exception when others then
    perform pg_temp.act(v_mal);
    perform pg_temp.rec('m5: Malik aendert Erics Kategorie', false, sqlstate || ' ' || sqlerrm);
  end;
  perform pg_temp.act(null);

  -- ===== h: categories =====
  perform pg_temp.act(v_mal);
  begin
    insert into public.categories (user_id, name, type) select v_mal, 'fx-kat', type from public.categories where user_id = v_eric limit 1 returning household_id into v_hhc;
    perform pg_temp.act(v_eric); select count(*) into x_e from public.categories where name = 'fx-kat';
    perform pg_temp.rec('h1: Neue Kategorie durch Malik: household_id automatisch = Haushalt', v_hhc = v_hh, (v_hhc = v_hh)::text);
    perform pg_temp.rec('h2: Eric sieht Maliks neue Kategorie', x_e = 1, x_e::text);
  exception when others then
    perform pg_temp.act(null);
    perform pg_temp.rec('h1: Neue Kategorie durch Malik', false, sqlstate || ' ' || sqlerrm);
  end;
  perform pg_temp.act(v_out);
  begin
    select count(*) into x_o from public.categories where name = 'fx-kat' or user_id = v_eric;
    perform pg_temp.rec('h3: Outsider sieht keine Kategorien des Haushalts', x_o = 0, x_o::text);
    insert into public.categories (user_id, name, type) select v_out, 'fx-kat-out', 'x' where false;
  exception when others then
    perform pg_temp.act(null);
    perform pg_temp.rec('h3: Outsider-Kategorien', false, sqlstate || ' ' || sqlerrm);
  end;
  perform pg_temp.act(null);

  -- ===== i: fund_price_history / fund_prices =====
  perform pg_temp.act(v_out);
  begin
    insert into public.fund_price_history (isin, price_date, price, currency) values ('ZZ-FX', current_date, 1, 'EUR');
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i1: authenticated INSERT fund_price_history verweigert', false, 'INSERT ERLAUBT');
  exception when insufficient_privilege then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i1: authenticated INSERT fund_price_history verweigert', true, sqlstate);
  when others then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i1: INSERT fund_price_history', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    update public.fund_price_history set price = price; get diagnostics rc = row_count;
    delete from public.fund_price_history; get diagnostics n = row_count;
    perform pg_temp.rec('i2: authenticated UPDATE/DELETE fund_price_history: 0 Zeilen', rc = 0 and n = 0, 'update=' || rc || ' delete=' || n);
  exception when others then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i2: UPDATE/DELETE fund_price_history', sqlstate = '42501', 'Fehler ' || sqlstate);
  end;
  select count(*) into n from public.fund_price_history;
  perform pg_temp.rec('i3: fund_price_history bleibt lesbar (SELECT-Policy)', n > 0, 'zeilen=' || n);
  begin
    insert into public.fund_prices (isin, fund_name, price, price_date) values ('ZZ-FX', 'fx', 1, current_date);
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i4: fund_prices bewusst offen (nur Doku): INSERT durch authenticated', true, 'erlaubt (bekannte offene Luecke)');
  exception when others then
    perform pg_temp.act(v_out);
    perform pg_temp.rec('i4: fund_prices bewusst offen (nur Doku): INSERT durch authenticated', true, 'verweigert ' || sqlstate);
  end;
  perform pg_temp.act(null);

  -- ===== k: Rollbacks =====
  -- @@ROLLBACKS (hier die sechs Bloecke einfuegen: v_s := $rN$ ...Dateiinhalt... $rN$; execute v_s;  Phase 2 dann Phase 1, jeweils umgekehrt)

  perform pg_temp.act(null);
  v_hash2 := pg_temp.phash();
  v_state2 := pg_temp.state();
  perform pg_temp.rec('k1: pg_policies-Hash nach Rollbacks = Vorher-Hash', v_hash2 = v_hash0, 'vorher=' || v_hash0 || ' nachher=' || v_hash2);
  perform pg_temp.rec('k2: Katalogzustand nach Rollbacks = vorher (Tabellen|Policies|shared|Funktionen|audit-Trigger|fn_audit-Hash|audit_log-Spalten|Kat-Trigger|household_id)', v_state2 = v_state0, v_state0 || ' // ' || v_state2);

  perform pg_temp.rec('k3: fn_audit Rohtext-Hash wie vorher (Info; k2 vergleicht whitespace-normalisiert)', true, 'gleich=' || ((select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname='fn_audit' and p.pronamespace='public'::regnamespace) = v_fn0));

  -- ===== Bericht =====
  select count(*) filter (where ok), count(*) into v_ok, v_all from pg_temp.t_res;
  select string_agg(case when ok then 'OK   ' else 'FAIL ' end || name || ' | ' || coalesce(wert, ''), E'\n' order by ctid) into v_rep from pg_temp.t_res where name !~ '^(a|b): ';
  v_rep := v_rep || E'\na-Zeilen (Tabelle:malik_sicht) ok=' || (select count(*) filter (where ok) from pg_temp.t_res where name like 'a: %') || '/' || (select count(*) from pg_temp.t_res where name like 'a: %') || ': '
    || (select string_agg(substr(name, 26) || ':' || regexp_replace(wert, '.*malik_sicht=([0-9]+).*', '\1'), ', ' order by ctid) from pg_temp.t_res where name like 'a: %')
    || E'\nb-Zeilen ok=' || (select count(*) filter (where ok) from pg_temp.t_res where name like 'b: %') || '/' || (select count(*) from pg_temp.t_res where name like 'b: %');
  raise exception E'ISOLATIONSTEST-BERICHT (% von % ok; ALLES ZURUECKGEROLLT)\n%', v_ok, v_all, v_rep;
end
$outer$;
