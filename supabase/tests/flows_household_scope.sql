-- Test Migration 20261029100000_flows_household_scope: Regressionsbeweis + Umbuchungen ueber Peer-Konten.
--
-- ACHTUNG: Dieses Skript SCHREIBT (Fixture-Nutzer/-Konten/-Buchungen, Migration, Rollback) und ist nur sicher, weil es in
-- EINEM einzigen DO-Block laeuft, der am Ende IMMER mit `raise exception` endet: die gesamte Transaktion wird zurueckgerollt,
-- nichts wird persistiert. Der Bericht steht in der Fehlermeldung ("FLOWS-HAUSHALT-BERICHT"). Keine Nutzerdaten im Bericht,
-- nur Zaehlwerte, Hashes und true/false.
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. Lesend vorher: to_regclass('public.monthly_umbuchungen'), Spaltenzahl unified_transactions, md5 ueber pg_policies und
--      ueber pg_get_viewdef der Views (siehe Abschnitt "Kontrolle" unten).
--   2. EIN execute_sql-Aufruf mit diesem Block. Marker `-- @@MIGRATION` wird durch
--         execute $m1$ <Inhalt supabase/migrations/20261029100000_flows_household_scope.sql> $m1$;
--      ersetzt, Marker `-- @@ROLLBACK` durch
--         execute $r1$ <Inhalt supabase/rollbacks/20261029100000_flows_household_scope.down.sql> $r1$;
--      Beide Marker leer lassen = Test gegen eine DB, in der die Migration schon angewendet ist (Regression dann trivial,
--      Rollbackpruefung entfaellt).
--   3. Lesend nachher: Werte aus 1 muessen identisch sein.
--
-- Regressionsbeweis: je Rolle (Eric = household_members.role 'owner', Testaccount = 'member') werden vor und nach der Migration
--   md5(string_agg(sortierte Zeilentexte)) und Zeilenzahl berechnet ueber
--   unified_transactions (nur die 34 bisherigen Spalten), monthly_flows, monthly_flow_totals, account_balance_sums_unified/_manual.
--   Vorher = Nachher muss gelten, ausserdem Eric = Testaccount (RLS zeigt dem Haushalt dieselben Zeilen).
-- Auth-Simulation: `set local role authenticated` + request.jwt.claims.

do $outer$
declare
  v_eric uuid; v_mem uuid; v_hh uuid; v_f uuid := gen_random_uuid(); v_x uuid := gen_random_uuid();
  v_ae uuid; v_af uuid; v_ax uuid; v_dup uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid; v_man uuid;
  v_cexp uuid; v_csch uuid; v_ctr uuid;
  v_ids text; v_ids_ut text;
  v_ibA text := 'DE00FXTEST0000000001'; v_ibB text := 'DE00FXTEST0000000002'; v_ibX text := 'DE00FXTEST0000000003';
  v_oc text := 'id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type, amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type, signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name, category_path, tax_role_effective, euer_zeile_effective, counts_in_flow, category_source, ai_category_id';
  v_q text[]; v_n text[] := array['unified_transactions(alt)', 'monthly_flows', 'monthly_flow_totals', 'account_balance_sums_unified', 'account_balance_sums_manual'];
  v_who uuid[]; v_wn text[] := array['eric', 'member'];
  i int; j int; v_h text; v_s0 text; v_s2 text; v_rep text; v_ok int; v_all int; r record; b boolean; n bigint; v_t text;
  v_mig_applied boolean; v_rb_applied boolean := false;
  v_c1 text; v_c2 text; v_t0 text; v_t1h text;
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

  -- Hash + Zeilenzahl einer Abfrage (sortierte Zeilentexte)
  create function pg_temp.h(p_sql text) returns text language plpgsql as
  $f$ declare v text; begin
    execute 'select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) || ''/'' || count(*) from (' || p_sql || ') x' into v;
    return v;
  end $f$;

  create function pg_temp.q(p_sql text) returns text language plpgsql as
  $f$ declare v text; begin execute p_sql into v; return v; end $f$;

  -- Definitionsstand der Auswertungs-Views + Policies + Balance-Funktion (fuer Vorher/Nachher/Nach-Rollback)
  create function pg_temp.vstate() returns text language sql as
  $f$ select concat_ws('|',
      (select md5(string_agg(c.relname || coalesce(c.reloptions::text, '') || pg_get_viewdef(c.oid, true) ||
                  coalesce((select string_agg(g.grantee || g.privilege_type, ',' order by g.grantee, g.privilege_type)
                            from information_schema.role_table_grants g
                            where g.table_schema = 'public' and g.table_name = c.relname), ''), '|' order by c.relname))
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
          and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'account_balance_sums_unified',
                            'account_balance_sums_manual', 'monthly_umbuchungen')),
      (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'v'),
      (select md5(string_agg(tablename || policyname || cmd || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname))
         from pg_policies where schemaname = 'public'),
      (select md5(p.prosrc || p.prosecdef::text || coalesce(p.proconfig::text, '')) from pg_proc p
        where p.proname = 'fn_recompute_account_balances' and p.pronamespace = 'public'::regnamespace)) $f$;

  -- ===== Ausgangslage =====
  select user_id, household_id into v_eric, v_hh from public.household_members where role = 'owner' limit 1;
  select user_id into v_mem from public.household_members where household_id = v_hh and role = 'member' limit 1;
  perform pg_temp.rec('0: Eric (owner) und Testaccount (member) im selben Haushalt gefunden', v_eric is not null and v_mem is not null, 'owner=' || (v_eric is not null) || ' member=' || (v_mem is not null));
  v_who := array[v_eric, v_mem];
  v_q := array['select ' || v_oc || ' from public.unified_transactions', 'select * from public.monthly_flows',
               'select * from public.monthly_flow_totals', 'select * from public.account_balance_sums_unified',
               'select * from public.account_balance_sums_manual'];
  v_mig_applied := to_regclass('public.monthly_umbuchungen') is not null;
  v_s0 := pg_temp.vstate();

  -- ===== Vorher: Hashes je Rolle =====
  for i in 1..2 loop
    for j in 1..array_length(v_q, 1) loop
      perform pg_temp.act(v_who[i]);
      v_h := pg_temp.h(v_q[j]);
      perform pg_temp.act(null);
      insert into t_h values (0, v_wn[i], v_n[j], v_h);
    end loop;
  end loop;

  -- @@MIGRATION

  -- ===== Nachher: Hashes je Rolle =====
  for i in 1..2 loop
    for j in 1..array_length(v_q, 1) loop
      perform pg_temp.act(v_who[i]);
      v_h := pg_temp.h(v_q[j]);
      perform pg_temp.act(null);
      insert into t_h values (1, v_wn[i], v_n[j], v_h);
    end loop;
  end loop;

  -- R: Regression (nur alte Spalten): vorher = nachher, je Rolle und Objekt; Eric = Testaccount
  for r in select a.who, a.nm, a.hv h0, b2.hv h1 from t_h a join t_h b2 on b2.who = a.who and b2.nm = a.nm and b2.phase = 1 where a.phase = 0 order by 1, 2 loop
    perform pg_temp.rec('R1: ' || r.who || ' ' || r.nm || ' vorher = nachher', r.h0 = r.h1,
      'zeilen=' || split_part(r.h1, '/', 2) || ' hash_vorher=' || left(r.h0, 8) || ' hash_nachher=' || left(r.h1, 8));
  end loop;
  for r in select a.nm, a.hv ha, b2.hv hb from t_h a join t_h b2 on b2.nm = a.nm and b2.phase = a.phase and b2.who = 'member' where a.who = 'eric' and a.phase = 1 order by 1 loop
    perform pg_temp.rec('R2: Testaccount sieht dieselben Zeilen wie Eric: ' || r.nm, r.ha = r.hb, 'zeilen=' || split_part(r.ha, '/', 2));
  end loop;

  -- ===== Struktur =====
  begin
    select string_agg(attname, ', ' order by attnum) into v_c1 from pg_attribute
      where attrelid = 'public.unified_transactions'::regclass and attnum > 0 and not attisdropped and attnum <= 34;
    select string_agg(attname, ',' order by attnum) into v_c2 from pg_attribute
      where attrelid = 'public.unified_transactions'::regclass and attnum > 34 and not attisdropped;
    perform pg_temp.rec('S1: die ersten 34 Spalten sind unveraendert und in alter Reihenfolge', v_c1 = v_oc, 'ok=' || (v_c1 = v_oc));
    perform pg_temp.rec('S2: neue Spalten stehen am Ende', v_c2 = 'counterpart_account_id,flow_kind_extern', v_c2);
    perform pg_temp.rec('S3: security_invoker auf allen Auswertungs-Views inkl. monthly_umbuchungen',
      (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
         and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'account_balance_sums_unified', 'account_balance_sums_manual', 'monthly_umbuchungen')
         and coalesce(c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true'], false)) = 6, null);
    perform pg_temp.rec('S4: anon hat keinen Zugriff, authenticated nur SELECT (unified_transactions, monthly_umbuchungen)',
      not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('unified_transactions', 'monthly_umbuchungen'))
      and (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and table_name = 'monthly_umbuchungen') = array['SELECT']
      and (select array_agg(privilege_type::text order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and table_name = 'unified_transactions') = array['SELECT'], null);
  exception when others then
    perform pg_temp.act(null);
    perform pg_temp.rec('S: Struktur', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
  end;

  -- ===== Fixtures (als Superuser; alles wird zurueckgerollt) =====
  begin
    insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values
      (v_f, 'fx-peer-' || v_f || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
      (v_x, 'fx-outsider-' || v_x || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
    insert into public.household_members (household_id, user_id, role) values (v_hh, v_f, 'member');

    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_eric, 'fx-a-eric', 'checking', 'EUR', v_ibA) returning id into v_ae;
    insert into public.accounts (user_id, name, type, currency, bank_iban, shared) values (v_f, 'fx-b-peer', 'checking', 'EUR', v_ibB, true) returning id into v_af;
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_x, 'fx-x-outsider', 'checking', 'EUR', v_ibX) returning id into v_ax;

    select id into v_cexp from public.categories where user_id = v_eric and type = 'expense' limit 1;
    if v_cexp is null then insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'fx-ausgabe', 'expense', 0) returning id into v_cexp; end if;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'Schulden', 'neutral', 0) returning id into v_csch;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'Transfers', 'neutral', 0) returning id into v_ctr;

    -- t1 Eric -> Peer (Umbuchung), t2 Gegenseite beim Peer, t3 extern (anderer Haushalt), t4 Kategorie-Override, t5 Schulden, t6 Transfers
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_eric, v_ibA, v_ibB, -50, current_date, 'fx t1') returning id into v_t1;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_f, v_ibB, v_ibA, 50, current_date, 'fx t2') returning id into v_t2;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_eric, v_ibA, v_ibX, -20, current_date, 'fx t3') returning id into v_t3;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -30, current_date, 'fx t4', v_cexp) returning id into v_t4;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -10, current_date, 'fx t5', v_csch) returning id into v_t5;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -5, current_date, 'fx t6', v_ctr) returning id into v_t6;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, transfer_to, description) values (v_eric, v_ae, 'transfer', 7, 'EUR', current_date, v_af, 'fx manuell') returning id into v_man;
    v_ids := format('%L, %L, %L, %L, %L, %L', v_t1, v_t2, v_t3, v_t4, v_t5, v_t6);
    v_ids_ut := v_ids || format(', %L', v_man);
  exception when others then
    perform pg_temp.rec('f0: Fixtures angelegt', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    v_ids := null;
  end;

  if v_ids is not null then
    -- ===== U: Klassifikation je Buchung (als Eric) =====
    begin
      perform pg_temp.act(v_eric);
      perform pg_temp.rec('U1: Eric -> Peer-Konto: umbuchung, Gegenkonto = Peer-Konto, transfer_to gesetzt',
        pg_temp.q(format('select (flow_kind = ''umbuchung'' and type = ''transfer'' and not counts_in_flow and counterpart_account_id = %L and transfer_to = %L and account_id = %L and flow_kind_extern = ''echt'')::text from public.unified_transactions where id = %L', v_af, v_af, v_ae, v_t1))::boolean, null);
      perform pg_temp.rec('U2: Gegenseite beim Peer: umbuchung, Gegenkonto = Erics Konto (Konto + Peer-Join haushaltsbasiert)',
        pg_temp.q(format('select (flow_kind = ''umbuchung'' and counterpart_account_id = %L and account_id = %L and signed_amount = 50)::text from public.unified_transactions where id = %L', v_ae, v_af, v_t2))::boolean, null);
      perform pg_temp.rec('U3: Gegen-IBAN in fremdem Haushalt (Outsider) bleibt echte Ausgabe, Gegenkonto null',
        pg_temp.q(format('select (flow_kind = ''echt'' and type = ''expense'' and counts_in_flow and counterpart_account_id is null)::text from public.unified_transactions where id = %L', v_t3))::boolean, null);
      perform pg_temp.rec('U4: Kategorie-Override (expense) macht aus Umbuchung echte Ausgabe, Gegenkonto bleibt gesetzt',
        pg_temp.q(format('select (flow_kind = ''echt'' and type = ''expense'' and counts_in_flow and counterpart_account_id = %L and transfer_to is null)::text from public.unified_transactions where id = %L', v_af, v_t4))::boolean, null);
      perform pg_temp.rec('U5: neutrale Kategorie Schulden: haushaltsweit umbuchung, flow_kind_extern = forderung',
        pg_temp.q(format('select (flow_kind = ''umbuchung'' and flow_kind_extern = ''forderung'')::text from public.unified_transactions where id = %L', v_t5))::boolean, null);
      perform pg_temp.rec('U6: neutrale Kategorie Transfers: flow_kind_extern = echt',
        pg_temp.q(format('select (flow_kind = ''umbuchung'' and flow_kind_extern = ''echt'')::text from public.unified_transactions where id = %L', v_t6))::boolean, null);
      perform pg_temp.rec('U7: manuelle Umbuchung: Gegenkonto = transfer_to',
        pg_temp.q(format('select (flow_kind = ''umbuchung'' and counterpart_account_id = %L and source = ''manual'')::text from public.unified_transactions where id = %L', v_af, v_man))::boolean, null);
      perform pg_temp.rec('U8: keine Zeilenvervielfachung (7 Fixture-Zeilen, 7 Ids)',
        pg_temp.q(format('select (count(*) = 7 and count(distinct id) = 7)::text from public.unified_transactions where id in (%s)', v_ids_ut))::boolean, null);
      perform pg_temp.act(null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('U: Klassifikation', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ===== V: Sichtbarkeit (RLS) =====
    begin
      perform pg_temp.act(v_eric); v_t0 := pg_temp.h(format('select id, account_id, counterpart_account_id, flow_kind, flow_kind_extern, type, signed_amount from public.unified_transactions where id in (%s)', v_ids_ut));
      perform pg_temp.act(v_f);    v_t1h := pg_temp.h(format('select id, account_id, counterpart_account_id, flow_kind, flow_kind_extern, type, signed_amount from public.unified_transactions where id in (%s)', v_ids_ut));
      perform pg_temp.rec('V1: Peer sieht dieselben Fixture-Zeilen (inkl. neuer Spalten) wie Eric', v_t0 = v_t1h, 'zeilen=' || split_part(v_t0, '/', 2));
      perform pg_temp.act(v_x);
      perform pg_temp.rec('V2: Outsider sieht keine Fixture-Zeile und keine Haushaltsumbuchung',
        pg_temp.q(format('select count(*)::text from public.unified_transactions where id in (%s)', v_ids_ut)) = '0'
        and pg_temp.q('select count(*)::text from public.monthly_umbuchungen') = '0', null);
      perform pg_temp.act(null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('V: Sichtbarkeit', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ===== M: monthly_flows / monthly_umbuchungen / Salden =====
    begin
      perform pg_temp.act(v_eric);
      perform pg_temp.rec('M1: monthly_flows Erics Fixture-Konto: nur echte Zeilen (t3 20 + t4 30 Ausgabe, keine Umbuchung)',
        pg_temp.q(format('select (sum(expense) = 50 and sum(income) = 0 and sum(tx_count) = 2 and bool_and(flow_kind = ''echt''))::text from public.monthly_flows where account_id = %L', v_ae))::boolean, null);
      perform pg_temp.rec('M2: monthly_flows Peer-Konto: leer (nur Umbuchung)',
        pg_temp.q(format('select count(*)::text from public.monthly_flows where account_id = %L', v_af)) = '0', null);
      perform pg_temp.rec('M3: monthly_umbuchungen Erics Konto: Abgang 72 (50 + 10 + 5 + 7 manuell), Gegenkonto Peer, 4 Zeilen',
        pg_temp.q(format('select (sum(expense) = 72 and sum(income) = 0 and sum(tx_count) = 4 and bool_and(counterpart_account_id = %L))::text from public.monthly_umbuchungen where account_id = %L', v_af, v_ae))::boolean, null);
      perform pg_temp.rec('M4: monthly_umbuchungen Peer-Konto: Zugang 57 (50 Bankseite + 7 manuelle Spiegelzeile), Gegenkonto Eric',
        pg_temp.q(format('select (sum(income) = 57 and sum(expense) = 0 and sum(tx_count) = 2 and bool_and(counterpart_account_id = %L))::text from public.monthly_umbuchungen where account_id = %L', v_ae, v_af))::boolean, null);
      perform pg_temp.rec('M5: monthly_umbuchungen trennt flow_kind_extern (forderung 10, echt 62 am Konto von Eric)',
        pg_temp.q(format('select (sum(expense) filter (where flow_kind_extern = ''forderung'') = 10 and sum(expense) filter (where flow_kind_extern = ''echt'') = 62)::text from public.monthly_umbuchungen where account_id = %L', v_ae))::boolean, null);
      -- Spiegel der App-Regel in SQL: herabstufen, wenn Gegenkonto nicht in neutralIds
      perform pg_temp.rec('D1: Scope ich (zaehlen {A}, neutral {A,B}): nichts herabgestuft',
        pg_temp.q(format('select coalesce(sum(income + expense), 0)::text from public.monthly_umbuchungen where account_id = any(array[%L]::uuid[]) and counterpart_account_id <> all(array[%L, %L]::uuid[])', v_ae, v_ae, v_af)) = '0', null);
      perform pg_temp.rec('D2: Scope ich mit privatem Peer-Konto (zaehlen {A}, neutral {A}): 62 echt + 10 forderung als Ausgabe',
        pg_temp.q(format('select (sum(expense) filter (where flow_kind_extern = ''echt'') = 62 and sum(expense) filter (where flow_kind_extern = ''forderung'') = 10 and sum(income) = 0)::text from public.monthly_umbuchungen where account_id = any(array[%L]::uuid[]) and counterpart_account_id <> all(array[%L]::uuid[])', v_ae, v_ae))::boolean, null);
      perform pg_temp.rec('D3: Scope gemeinsam (zaehlen {B}, neutral {A,B}): nichts herabgestuft',
        pg_temp.q(format('select coalesce(sum(income + expense), 0)::text from public.monthly_umbuchungen where account_id = any(array[%L]::uuid[]) and counterpart_account_id <> all(array[%L, %L]::uuid[])', v_af, v_ae, v_af)) = '0', null);
      perform pg_temp.rec('D4: Scope gemeinsam nur mit B (zaehlen {B}, neutral {B}): 57 als Einnahme',
        pg_temp.q(format('select (sum(income) = 57 and sum(expense) = 0)::text from public.monthly_umbuchungen where account_id = any(array[%L]::uuid[]) and counterpart_account_id <> all(array[%L]::uuid[])', v_af, v_af))::boolean, null);
      perform pg_temp.rec('B1: Salden unveraendert berechnet: Konto A -122, Konto B 57 (account_balance_sums_unified)',
        pg_temp.q(format('select (sum(balance) filter (where account_id = %L) = -122 and sum(balance) filter (where account_id = %L) = 57)::text from public.account_balance_sums_unified where account_id in (%L, %L)', v_ae, v_af, v_ae, v_af))::boolean, null);
      perform pg_temp.act(null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('M/D/B: Flows', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ===== I: Invarianten ueber alle sichtbaren Zeilen (Eric) =====
    begin
      perform pg_temp.act(v_eric);
      perform pg_temp.rec('I1: flow_kind_extern = flow_kind, ausser bei umbuchung (dort echt/anlage/forderung/anfangsbestand)',
        pg_temp.q('select count(*)::text from public.unified_transactions where (flow_kind <> ''umbuchung'' and flow_kind_extern is distinct from flow_kind) or (flow_kind = ''umbuchung'' and flow_kind_extern not in (''echt'', ''anlage'', ''forderung'', ''anfangsbestand''))') = '0', null);
      perform pg_temp.rec('I2: counts_in_flow passt zu flow_kind (wie flows_invariants D)',
        pg_temp.q('select count(*)::text from public.unified_transactions where counts_in_flow is distinct from (flow_kind in (''echt'', ''anlage'', ''forderung''))') = '0', null);
      perform pg_temp.rec('I3: monthly_flows ohne Umbuchung/Anfangsbestand (wie flows_invariants C)',
        pg_temp.q('select count(*)::text from public.monthly_flows where flow_kind not in (''echt'', ''anlage'', ''forderung'')') = '0', null);
      perform pg_temp.rec('I4: monthly_umbuchungen vollstaendig: tx_count = Umbuchungszeilen mit Konto + manuelle Spiegelzeilen',
        pg_temp.q('select ((select coalesce(sum(tx_count), 0) from public.monthly_umbuchungen) = (select count(*) from public.unified_transactions where flow_kind = ''umbuchung'' and account_id is not null) + (select count(*) from public.unified_transactions where flow_kind = ''umbuchung'' and source = ''manual'' and counterpart_account_id is not null))::text')::boolean, null);
      perform pg_temp.rec('I5: monthly_flow_totals = monthly_flows je Monat (wie flows_invariants B)',
        pg_temp.q('select count(*)::text from (select t.user_id, t.month from public.monthly_flow_totals t join (select user_id, month, sum(income) i, sum(expense) e from public.monthly_flows group by 1, 2) p on p.user_id = t.user_id and p.month = t.month where abs(t.income - p.i) >= 0.005 or abs(t.expense - p.e) >= 0.005) z') = '0', null);
      perform pg_temp.act(null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('I: Invarianten', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ===== K: Kontostand-Funktion (SECURITY DEFINER, ohne auth.uid(), ohne RLS) =====
    begin
      perform pg_temp.act(null);
      perform public.fn_recompute_account_balances(v_eric, current_date);
      perform public.fn_recompute_account_balances(v_f, current_date);
      perform pg_temp.rec('K1: fn_recompute_account_balances ohne Auth-Kontext: Konto A = -122, Konto B = 50 (nur Bankbuchung des Besitzers)',
        (select balance from public.account_balances where account_id = v_ae and snapshot_date = current_date) = -122
        and (select balance from public.account_balances where account_id = v_af and snapshot_date = current_date) = 50, null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('K: fn_recompute_account_balances', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;

    -- ===== X: IBAN-Dublette im Haushalt (kuenftiger Zustand ohne Phase-4-Unique) =====
    begin
      insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_eric, 'fx-dup', 'checking', 'EUR', v_ibB) returning id into v_dup;
      perform pg_temp.act(v_eric);
      perform pg_temp.rec('X1: IBAN-Dublette im Haushalt vervielfacht keine Zeilen; eigenes Konto des Besitzers hat Vorrang',
        pg_temp.q(format('select (count(*) = 7 and count(distinct id) = 7)::text from public.unified_transactions where id in (%s)', v_ids_ut))::boolean
        and pg_temp.q(format('select counterpart_account_id::text from public.unified_transactions where id = %L', v_t1)) = v_dup::text, null);
      perform pg_temp.act(null);
    exception when others then
      perform pg_temp.act(null);
      perform pg_temp.rec('X: IBAN-Dublette', false, 'FEHLER ' || sqlstate || ' ' || sqlerrm);
    end;
  end if;

  -- @@ROLLBACK
  -- Nach dem Rollback muessen Views, Rechte, Policies und Funktion exakt dem Stand vor der Migration entsprechen.
  v_rb_applied := (to_regclass('public.monthly_umbuchungen') is null) and v_mig_applied is false and exists (select 1 from pg_class where relname = 'unified_transactions');
  v_s2 := pg_temp.vstate();
  perform pg_temp.rec('Z1: Definitionsstand (Views, Rechte, Policies, Funktion) nach Rollback = vor Migration',
    v_s2 = v_s0, case when v_s2 = v_s0 then 'identisch' else 'ABWEICHUNG (oder Marker @@ROLLBACK leer / Migration schon vorher angewendet)' end);

  select count(*) filter (where ok), count(*) into v_ok, v_all from t_res;
  select string_agg(case when ok then 'ok   ' else 'FAIL ' end || name || coalesce('  [' || wert || ']', ''), E'\n' order by name) into v_rep from t_res;
  raise exception E'FLOWS-HAUSHALT-BERICHT (% von % ok; ALLES ZURUECKGEROLLT)\n%', v_ok, v_all, v_rep;
end
$outer$;
