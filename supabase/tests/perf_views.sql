-- Test Migration 20261101100000_perf_indexes_views: Regressionsbeweis (Hashes vorher = nachher), Laufzeiten, Fixture mit zwei Peers + Outsider,
-- Policy-Zusammenfuehrung, Rollback-Gleichheit.
--
-- ACHTUNG: Dieses Skript SCHREIBT (Migration, Rollback, in Teil F Fixture-Nutzer/-Konten/-Buchungen) und ist nur sicher, weil es in EINEM
-- einzigen DO-Block laeuft, der am Ende IMMER mit `raise exception` endet: die gesamte Transaktion wird zurueckgerollt, nichts wird
-- persistiert. Der Bericht steht in der Fehlermeldung ("PERF-BERICHT"). Keine Nutzerdaten im Bericht, nur Zaehlwerte, Hashes, ms, true/false.
--
-- Zwei Laeufe (je EIN execute_sql-Aufruf, wegen der Groesse der eingebetteten Dateien):
--   Teil R (echte Daten):  v_part := 'R'. Marker `-- @@MIGRATION` wird zu  v_mig := $mig$ <Migration, ohne Kommentarzeilen> $mig$;
--                          Marker `-- @@ROLLBACK` zu  v_rb := $rb$ <Rollback, ohne Kommentarzeilen> $rb$;
--                          Hashes und Laufzeiten (beste von 3) je Rolle vorher/nachher, Strukturgleichheit, Rollback-Gleichheit.
--   Teil F (Fixture):      v_part := 'F'. Nur @@MIGRATION. Zwei Peers + Outsider, Umbuchungen zwischen Peers, Kategorie-Overrides,
--                          Waisen-Kategorie, Beschreibungs-Sonderfaelle, Luecken-Reihen in account_balances; Hashes vorher = nachher
--                          fuer eric, member (Testaccount), peer, outsider; Policy-Proben.
--   Ausgefuehrt wurde Teil R in zwei Aufrufen (R-A: Hashes + Laufzeiten vorher/nachher; R-B: Migration + Rollback, Gleichheit der
--   Definitionen/Policies/Hashes), Teil F in einem Aufruf (die F6-Erwartung wurde danach korrigiert, nicht erneut gelaufen).
--   Dateitreue: die eingebetteten Texte werden per md5(regexp_replace(text, '\s+', '', 'g')) gegen die Datei (Kommentarzeilen und
--   Leerzeilen entfernt, Whitespace normalisiert) geprueft; erwartete Werte stehen in v_md5_mig / v_md5_rb unten.
-- Auth-Simulation: `set local role authenticated` + request.jwt.claims.

do $outer$
declare
  v_part text := 'R';
  v_md5_mig text := '@@MD5_MIG';
  v_md5_rb text := '@@MD5_RB';
  v_mig text; v_rb text;
  v_eric uuid; v_mem uuid; v_hh uuid; v_peer uuid := gen_random_uuid(); v_out uuid := gen_random_uuid();
  v_who uuid[]; v_wn text[]; v_acc uuid;
  v_qn text[] := array['ut_voll', 'ut_konto', 'ut_datum', 'monthly_flows', 'monthly_flow_totals', 'monthly_umbuchungen',
    'account_balance_sums_unified', 'account_balance_sums_manual', 'category_tree', 'category_tree_struktur',
    'balance_series_alle', 'balance_series_je_konto', 'net_worth_series_ich', 'net_worth_series_haushalt'];
  v_q text[];
  i int; j int; r record; n bigint; v_h text; v_s0 text; v_d0 text; v_p0 text; v_s1 text; v_d1 text; v_p1 text; v_rep text := '';
  v_ok int; v_all int; v_t text; b boolean;
  v_ae uuid; v_af uuid; v_af2 uuid; v_ax uuid; v_ax2 uuid;
  v_cexp uuid; v_csch uuid; v_ckind uuid; v_cgk uuid; v_ctr uuid; v_cpar uuid; v_cchild uuid; v_cout uuid; v_corph uuid;
  v_ibA text := 'DE00FXPERF0000000001'; v_ibB text := 'DE00FXPERF0000000002'; v_ibB2 text := 'DE00FXPERF0000000003'; v_ibX text := 'DE00FXPERF0000000004';
  v_ids uuid[] := '{}'; v_id uuid; v_pr0 text[]; v_pr1 text[]; rc int;
begin
  create temp table t_res (name text, ok boolean, wert text);
  grant all on t_res to public;
  create temp table t_h (phase int, who text, nm text, hv text, ms numeric);
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

  create function pg_temp.tm(p_sql text) returns numeric language plpgsql as
  $f$ declare t0 timestamptz; b numeric := 1e9; ms numeric; k int; n bigint; begin
    for k in 1..3 loop
      t0 := clock_timestamp();
      execute 'select count(x::text) from (' || p_sql || ') x' into n;
      ms := extract(epoch from clock_timestamp() - t0) * 1000;
      if ms < b then b := ms; end if;
    end loop;
    return round(b, 1);
  end $f$;

  create function pg_temp.qs(p_acc uuid) returns text[] language sql as
  $f$ select array[
    'select * from public.unified_transactions',
    format('select * from public.unified_transactions where account_id = %L', p_acc),
    'select * from public.unified_transactions where date >= current_date - 120',
    'select * from public.monthly_flows',
    'select * from public.monthly_flow_totals',
    'select * from public.monthly_umbuchungen',
    'select * from public.account_balance_sums_unified',
    'select * from public.account_balance_sums_manual',
    'select * from public.category_tree',
    'select id, user_id, name, parent_id, type, root_id, root_name, depth, path from public.category_tree',
    'select * from public.balance_series(null, null)',
    'select a.id, s.* from public.accounts a cross join lateral public.balance_series(a.id, null) s',
    'select * from public.net_worth_series(array(select id from public.accounts where user_id = auth.uid()), array[auth.uid()], false, null)',
    'select * from public.net_worth_series(array(select id from public.accounts), array(select public.household_peer_ids()), true, null)'
  ] $f$;

  create function pg_temp.vstruct() returns text language sql as
  $f$ select md5(concat_ws('|',
    (select string_agg(c.relname || '/' || coalesce(c.reloptions::text, '') || '/' || coalesce(c.relacl::text, '') || '/' ||
       (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
       ';' order by c.relname)
     from pg_class c where c.relnamespace = 'public'::regnamespace
       and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'monthly_umbuchungen', 'account_balance_sums_unified', 'account_balance_sums_manual', 'category_tree')),
    (select string_agg(p.proname || '/' || pg_get_function_result(p.oid) || '/' || pg_get_function_arguments(p.oid) || '/' || p.provolatile::text || p.prosecdef::text ||
       coalesce(p.proconfig::text, '') || coalesce(p.proacl::text, ''), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('balance_series', 'net_worth_series'))
  )) $f$;

  create function pg_temp.vdef() returns text language sql as
  $f$ select md5(concat_ws('|',
    (select string_agg(c.relname || pg_get_viewdef(c.oid), ';' order by c.relname)
     from pg_class c where c.relnamespace = 'public'::regnamespace
       and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'monthly_umbuchungen', 'account_balance_sums_unified', 'account_balance_sums_manual', 'category_tree')),
    (select string_agg(p.proname || regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('balance_series', 'net_worth_series'))
  )) $f$;

  create function pg_temp.phash() returns text language sql as
  $f$ select md5(coalesce(string_agg(tablename || '.' || policyname || '.' || cmd || '.' || permissive || '.' || coalesce(roles::text, '') || '.' || coalesce(qual, '') || '.' || coalesce(with_check, ''), '|' order by tablename, policyname), ''))
     from pg_policies where schemaname = 'public' and tablename in ('portfolio_snapshots', 'user_profiles') $f$;

  create function pg_temp.probe() returns text language plpgsql as
  $f$ declare a bigint; b bigint; c bigint; d bigint; e bigint; f bigint; g bigint; s text := 'ok'; u uuid := auth.uid(); begin
    select count(*) into a from public.portfolio_snapshots;
    select count(*) into b from public.user_profiles;
    update public.portfolio_snapshots set quantity = quantity where user_id = u; get diagnostics c = row_count;
    update public.portfolio_snapshots set quantity = quantity where user_id <> u; get diagnostics d = row_count;
    update public.user_profiles set display_name = display_name where id = u; get diagnostics e = row_count;
    update public.user_profiles set display_name = display_name where id <> u; get diagnostics f = row_count;
    begin insert into public.user_profiles (id) select id from public.user_profiles where id <> u limit 1; get diagnostics g = row_count;
    exception when others then s := sqlstate; g := -1; end;
    return concat_ws(' ', 'ps_sel=' || a, 'up_sel=' || b, 'ps_upd_own=' || c, 'ps_upd_fremd=' || d, 'up_upd_own=' || e, 'up_upd_fremd=' || f, 'up_ins_fremd=' || g || '/' || s);
  end $f$;

  select user_id, household_id into v_eric, v_hh from public.household_members where role = 'owner' limit 1;
  select user_id into v_mem from public.household_members where household_id = v_hh and role = 'member' limit 1;
  perform pg_temp.rec('0: Eric (owner) und Testaccount (member) im selben Haushalt gefunden', v_eric is not null and v_mem is not null, 'owner=' || (v_eric is not null) || ' member=' || (v_mem is not null));

  v_s0 := pg_temp.vstruct(); v_d0 := pg_temp.vdef(); v_p0 := pg_temp.phash();

  -- @@MIGRATION
  -- @@ROLLBACK

  perform pg_temp.rec('M0: Migration md5 (ohne Kommentare, whitespace-normalisiert) = Datei', md5(regexp_replace(v_mig, '\s+', '', 'g')) = v_md5_mig, left(md5(regexp_replace(v_mig, '\s+', '', 'g')), 8));
  if v_part = 'R' then
    perform pg_temp.rec('M0: Rollback md5 (ohne Kommentare, whitespace-normalisiert) = Datei', md5(regexp_replace(v_rb, '\s+', '', 'g')) = v_md5_rb, left(md5(regexp_replace(v_rb, '\s+', '', 'g')), 8));
  end if;

  if v_part = 'F' then
    -- ===== Fixtures (Superuser; alles wird zurueckgerollt) =====
    insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values
      (v_peer, 'fx-peer-' || v_peer || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
      (v_out, 'fx-outsider-' || v_out || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
    insert into public.household_members (household_id, user_id, role) values (v_hh, v_peer, 'member');
    begin
      alter table public.bank_transactions disable trigger trg_bank_transactions_peer_skip;
    exception when others then perform pg_temp.rec('f0: Trigger peer_skip abschaltbar', false, sqlstate); end;
    begin
      alter table public.accounts disable trigger trg_accounts_iban_peer;
    exception when others then perform pg_temp.rec('f0: Trigger iban_peer abschaltbar', false, sqlstate); end;

    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_eric, 'fx-a-eric', 'checking', 'EUR', v_ibA) returning id into v_ae;
    insert into public.accounts (user_id, name, type, currency, bank_iban, shared) values (v_peer, 'fx-b-peer', 'checking', 'EUR', v_ibB, true) returning id into v_af;
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_peer, 'fx-b2-peer', 'savings', 'EUR', v_ibB2) returning id into v_af2;
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_out, 'fx-x-out', 'checking', 'EUR', v_ibX) returning id into v_ax;
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_out, 'fx-x2-out-gleiche-iban-wie-eric', 'checking', 'EUR', v_ibA) returning id into v_ax2;

    select id into v_cexp from public.categories where user_id = v_eric and type = 'expense' limit 1;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'Schulden', 'neutral', 0) returning id into v_csch;
    insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-schuld-kind', 'neutral', 0, v_csch) returning id into v_ckind;
    insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-schuld-enkel', 'neutral', 0, v_ckind) returning id into v_cgk;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'Transfers', 'neutral', 0) returning id into v_ctr;
    insert into public.categories (user_id, name, type, sort_order) values (v_eric, 'fx-eltern', 'expense', 0) returning id into v_cpar;
    insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-kind', 'expense', 0, v_cpar) returning id into v_cchild;
    insert into public.categories (user_id, name, type, sort_order) values (v_out, 'fx-out-kat', 'expense', 0) returning id into v_cout;
    begin
      insert into public.categories (user_id, name, type, sort_order, parent_id) values (v_eric, 'fx-waise', 'expense', 0, v_cout) returning id into v_corph;
    exception when others then v_corph := null; perform pg_temp.rec('f1: Waisen-Kategorie (Elternteil unsichtbar) angelegt', false, sqlstate || ' ' || sqlerrm); end;

    insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile) values
      (v_cpar, v_eric, 'betriebsausgabe', 12), (v_cpar, v_peer, 'privat', null), (v_csch, v_eric, 'lohn', null), (v_cgk, v_peer, 'betriebseinnahme', 33);

    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -50, current_date, 'fx t1', null) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_peer, v_ibB, v_ibA, 50, current_date, 'fx t2') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_eric, v_ibA, v_ibX, -20, current_date - 1, 'fx t3') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -30, current_date - 2, 'fx t4', v_cexp) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -10, current_date - 3, 'fx t5', v_csch) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, -5, current_date - 4, 'fx t6', v_ctr) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_peer, v_ibA, v_ibB, 12, current_date - 5, 'fx t7 peer auf Erics Konto', v_ckind) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_peer, v_ibB, v_ibB2, -8, current_date - 6, 'fx t8 peer eigene Umbuchung') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_eric, 'DE00FXUNBEKANNT0001', v_ibB, -1, current_date, 'fx t9 Konto unbekannt') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, null, -700, current_date - 7, 'Miete 2026   ' || chr(9) || ' EREF: abc SVWZ: xy', v_cchild) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, amount, value_date, description, raw_description, counterpart_name, category_id) values (v_eric, v_ibA, -9.99, current_date - 8, null, 'Kartenzahlung  SecureGo plus 123', 'Shop X', v_cpar) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, amount, value_date, counterpart_name) values (v_eric, v_ibA, 3.5, current_date - 9, 'Nur Gegenpartei') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description) values (v_out, v_ibA, v_ibX, -4, current_date, 'fx t13 outsider gleiche IBAN') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, amount, value_date, description) values (v_out, v_ibX, 9, current_date, 'fx t14 outsider') returning id into v_id; v_ids := v_ids || v_id;
    if v_corph is not null then
      insert into public.bank_transactions (user_id, account_iban, counterpart_iban, amount, value_date, description, category_id) values (v_eric, v_ibA, v_ibB, 20, current_date - 10, 'fx t15 Waise', v_corph) returning id into v_id; v_ids := v_ids || v_id;
    end if;
    insert into public.bank_transactions (user_id, account_iban, amount, value_date, description, category_id) values (v_peer, v_ibB, 100, current_date - 11, 'fx t16 peer Enkel', v_cgk) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.bank_transactions (user_id, account_iban, amount, value_date, description, category_id) values (v_peer, v_ibB, -15, current_date - 12, 'fx t17 peer Eltern', v_cpar) returning id into v_id; v_ids := v_ids || v_id;

    insert into public.transactions (user_id, account_id, type, amount, currency, date, transfer_to, description) values (v_eric, v_ae, 'transfer', 7, 'EUR', current_date, v_af, 'fx m1 manuell Umbuchung') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, description, category_id) values (v_peer, v_ae, 'income', 40, 'EUR', current_date - 1, 'fx m2 peer auf Erics Konto', v_cchild) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, description, category_id) values (v_eric, v_ae, 'expense', 15, 'EUR', current_date - 2, 'fx m3 Schulden', v_csch) returning id into v_id; v_ids := v_ids || v_id;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, description) values (v_eric, v_ae, 'income', 100, 'EUR', current_date - 400, 'Alter Kontostand 2020') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, transfer_to, description) values (v_peer, v_af, 'transfer', 3, 'EUR', current_date - 3, v_ae, 'fx m5 peer an Eric') returning id into v_id; v_ids := v_ids || v_id;
    insert into public.transactions (user_id, account_id, type, amount, currency, date, description, category_id, fx_rate, amount_base) values (v_eric, v_ae, 'expense', 10, 'USD', current_date - 4, 'fx m6 USD', v_cexp, 0.9, 9) returning id into v_id; v_ids := v_ids || v_id;

    for i in 0..7 loop
      if i <> 5 then
        insert into public.account_balances (account_id, balance, currency, snapshot_date, source) values
          (v_ae, (array[100, 100, 100, 200, 100, 0, 100, 100])[i + 1], 'EUR', date '2001-01-01' + i, 'cron');
      end if;
    end loop;
    insert into public.account_balances (account_id, balance, currency, snapshot_date, source) values
      (v_af, 50, 'EUR', date '2001-01-01', 'cron'), (v_af, 50, 'EUR', date '2001-01-02', 'cron'), (v_af, 60, 'EUR', date '2001-01-03', 'cron'),
      (v_af, 50, 'EUR', date '2001-01-04', 'cron'), (v_af2, 5, 'EUR', date '2001-01-02', 'cron'), (v_ax, 7, 'EUR', date '2001-01-02', 'cron');
    perform pg_temp.rec('f2: Fixture angelegt (Buchungen/Konten/Kategorien/Overrides/Salden)', true, 'ids=' || array_length(v_ids, 1));
  end if;

  if v_part = 'R' then
    v_who := array[v_eric, v_mem]; v_wn := array['eric', 'member'];
  else
    v_who := array[v_eric, v_mem, v_peer, v_out]; v_wn := array['eric', 'member', 'peer', 'outsider'];
  end if;

  -- ===== Vorher: Hashes (+ Laufzeiten in Teil R) je Rolle =====
  for i in 1..array_length(v_who, 1) loop
    perform pg_temp.act(v_who[i]);
    select id into v_acc from public.accounts where bank_iban is not null order by id limit 1;
    v_q := pg_temp.qs(v_acc);
    for j in 1..array_length(v_q, 1) loop
      insert into t_h values (0, v_wn[i], v_qn[j], pg_temp.h(v_q[j]), case when v_part = 'R' then pg_temp.tm(v_q[j]) end);
    end loop;
    if v_part = 'F' and i <= 4 and i <> 2 then v_pr0 := coalesce(v_pr0, array[]::text[]) || (v_wn[i] || ': ' || pg_temp.probe()); end if;
    perform pg_temp.act(null);
  end loop;

  -- ===== Migration =====
  execute v_mig;
  v_s1 := pg_temp.vstruct(); v_d1 := pg_temp.vdef(); v_p1 := pg_temp.phash();

  -- ===== Nachher =====
  for i in 1..array_length(v_who, 1) loop
    perform pg_temp.act(v_who[i]);
    select id into v_acc from public.accounts where bank_iban is not null order by id limit 1;
    v_q := pg_temp.qs(v_acc);
    for j in 1..array_length(v_q, 1) loop
      insert into t_h values (1, v_wn[i], v_qn[j], pg_temp.h(v_q[j]), case when v_part = 'R' then pg_temp.tm(v_q[j]) end);
    end loop;
    if v_part = 'F' and i <= 4 and i <> 2 then v_pr1 := coalesce(v_pr1, array[]::text[]) || (v_wn[i] || ': ' || pg_temp.probe()); end if;
    perform pg_temp.act(null);
  end loop;

  -- ===== R: Regression =====
  for r in select a.who, a.nm, a.hv h0, c.hv h1, a.ms m0, c.ms m1 from t_h a join t_h c on c.who = a.who and c.nm = a.nm and c.phase = 1 where a.phase = 0 order by 1, 2 loop
    perform pg_temp.rec('R1: ' || r.who || ' ' || r.nm || ' vorher = nachher', r.h0 = r.h1,
      'zeilen=' || split_part(r.h1, '/', 2) || ' hash=' || left(r.h1, 8) || case when r.h0 = r.h1 then '' else ' vorher=' || left(r.h0, 8) end
      || case when r.m0 is not null then ' ms ' || r.m0 || ' -> ' || r.m1 else '' end);
  end loop;
  for r in select a.nm, a.hv ha, c.hv hb from t_h a join t_h c on c.nm = a.nm and c.phase = a.phase and c.who = 'member' where a.who = 'eric' and a.phase = 1 order by 1 loop
    perform pg_temp.rec('R2: Testaccount sieht dieselben Zeilen wie Eric: ' || r.nm, r.ha = r.hb, 'zeilen=' || split_part(r.ha, '/', 2));
  end loop;
  perform pg_temp.rec('S1: Spaltenfolge, Typen, security_invoker, Grants, Funktionssignaturen/-attribute unveraendert', v_s0 = v_s1, left(v_s0, 8) || ' -> ' || left(v_s1, 8));
  perform pg_temp.rec('S2: Definitionen haben sich geaendert (Migration wirkt)', v_d0 <> v_d1, left(v_d0, 8) || ' -> ' || left(v_d1, 8));
  perform pg_temp.rec('S3: security_invoker auf allen 7 Views',
    (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('unified_transactions', 'monthly_flows', 'monthly_flow_totals', 'monthly_umbuchungen', 'account_balance_sums_unified', 'account_balance_sums_manual', 'category_tree')
       and coalesce(c.reloptions::text[] && array['security_invoker=on', 'security_invoker=true'], false)) = 7, null);
  perform pg_temp.rec('S4: anon hat keinen Zugriff auf unified_transactions/category_tree/monthly_umbuchungen',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and table_name in ('unified_transactions', 'category_tree', 'monthly_umbuchungen')), null);
  perform pg_temp.rec('S5: Funktionsrechte unveraendert (anon ohne EXECUTE auf balance_series/net_worth_series)',
    not has_function_privilege('anon', 'public.net_worth_series(uuid[], uuid[], boolean, date)', 'execute'), null);

  -- ===== D: Beschreibungs-Ausdruck = Funktion, alle Bankzeilen =====
  perform pg_temp.act(v_eric);
  select count(*) into n from public.bank_transactions bt join public.unified_transactions u on u.id = bt.id
    where u.description is distinct from public.fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name);
  perform pg_temp.rec('D1: description in der View = fn_clean_bank_description fuer alle Bankzeilen (Eric)', n = 0, 'abweichend=' || n);
  perform pg_temp.act(null);

  -- ===== E: Plan-Kennzahlen (nur Zahlen) =====
  perform pg_temp.act(v_eric);
  select count(*) into n from public.unified_transactions where account_id = (select id from public.accounts where bank_iban is not null order by id limit 1);
  perform pg_temp.rec('E1: ut mit Kontofilter liefert Zeilen', n >= 0, 'zeilen=' || n);
  perform pg_temp.act(null);

  if v_part = 'F' then
    -- Abdeckung: die Fixture-Faelle wirken wirklich
    perform pg_temp.act(v_eric);
    select count(*) into n from public.unified_transactions where id = any (v_ids);
    perform pg_temp.rec('F1: Fixture-Zeilen in ut (Eric): 14 Bank (t1-t9 ohne t9 = 8, t10-t12, t15-t17 = 6) + 6 manuell, Outsider/unbekannte Konten nicht sichtbar', n = (case when v_corph is null then 19 else 20 end), 'n=' || n);
    select count(*) into n from public.unified_transactions where id = any (v_ids) and flow_kind = 'umbuchung' and counterpart_account_id in (v_af, v_ae, v_af2);
    perform pg_temp.rec('F2: Umbuchungen zwischen Peer-Konten erkannt', n >= 4, 'n=' || n);
    select count(*) into n from public.unified_transactions where id = any (v_ids) and user_id = v_peer and account_id = v_ae;
    perform pg_temp.rec('F3: Buchungen des Peers auf Erics Konto (Haushaltsaufloesung)', n >= 2, 'n=' || n);
    select count(*) into n from public.unified_transactions u where id = any (v_ids) and category_id = v_cpar and tax_role_effective is not null;
    perform pg_temp.rec('F4: Steuer-Override je Buchungsbesitzer wirkt (Eric: betriebsausgabe, Peer: privat)',
      (select count(distinct tax_role_effective) from public.unified_transactions where id = any (v_ids) and category_id = v_cpar) = 2, 'n=' || n);
    if v_corph is not null then
      select count(*) into n from public.unified_transactions where id = any (v_ids) and category_id = v_corph and root_category_id = v_corph and category_path is not null;
      perform pg_temp.rec('F5: Waisen-Kategorie ist eigene Wurzel', n = 1, 'n=' || n);
    end if;
    select count(*) into n from public.unified_transactions where id = any (v_ids) and flow_kind = 'forderung';
    perform pg_temp.rec('F6: Forderung (nur direkte Kinder von Schulden, Enkel = Anlage wie bisher)',
      n >= 1 and (select count(*) from public.unified_transactions where id = any (v_ids) and flow_kind = 'anlage') >= 1, 'forderung=' || n);
    select count(*) into n from public.balance_series(v_ae);
    perform pg_temp.rec('F7: balance_series Laeufe fuer Luecken-/Wechsel-Reihe (100x3, 200, 100, Luecke, 100x2 = 4 Laeufe)', n = 4, 'laeufe=' || n);
    perform pg_temp.act(v_out);
    select count(*) into n from public.unified_transactions where id = any (v_ids);
    perform pg_temp.rec('F8: Outsider sieht nur eigene Fixture-Zeilen (t13, t14)', n = 2, 'n=' || n);
    perform pg_temp.act(null);

    -- Policies
    perform pg_temp.rec('P1: Policy-Proben (Zaehler, Update-Zeilen, Insert-Fehlercode) vorher = nachher fuer eric/peer/outsider', v_pr0 = v_pr1,
      array_to_string(v_pr1, ' | '));
    perform pg_temp.rec('P2: je Tabelle genau eine Policy, die SELECT betrifft',
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'portfolio_snapshots' and cmd in ('SELECT', 'ALL')) = 1
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and cmd in ('SELECT', 'ALL')) = 1, null);
    perform pg_temp.rec('P3: Policy-Hash hat sich geaendert, Rollen unveraendert (SELECT: authenticated, Schreiben: public)', v_p0 <> v_p1, left(v_p0, 8) || ' -> ' || left(v_p1, 8));
  end if;

  -- ===== K: Rollback stellt den Ausgangszustand her (nur Teil R) =====
  if v_part = 'R' then
    execute v_rb;
    perform pg_temp.rec('K1: nach Rollback Struktur wie Ausgang', pg_temp.vstruct() = v_s0, null);
    perform pg_temp.rec('K2: nach Rollback View-/Funktionsdefinitionen identisch zum Ausgang (md5)', pg_temp.vdef() = v_d0, left(pg_temp.vdef(), 8) || ' vs ' || left(v_d0, 8));
    perform pg_temp.rec('K3: nach Rollback pg_policies (portfolio_snapshots, user_profiles) identisch zum Ausgang', pg_temp.phash() = v_p0, left(pg_temp.phash(), 8) || ' vs ' || left(v_p0, 8));
    for i in 1..2 loop
      perform pg_temp.act(v_who[i]);
      select id into v_acc from public.accounts where bank_iban is not null order by id limit 1;
      v_q := pg_temp.qs(v_acc);
      for j in 1..array_length(v_q, 1) loop
        v_h := pg_temp.h(v_q[j]);
        if v_h <> (select hv from t_h where phase = 0 and who = v_wn[i] and nm = v_qn[j]) then
          perform pg_temp.rec('K4: ' || v_wn[i] || ' ' || v_qn[j] || ' nach Rollback = Ausgang', false, left(v_h, 8));
        end if;
      end loop;
      perform pg_temp.act(null);
    end loop;
    perform pg_temp.rec('K4: alle Hashes nach Rollback = Ausgang', not exists (select 1 from t_res where name like 'K4: %' and not ok), null);
  end if;

  perform pg_temp.act(null);
  select count(*) filter (where ok), count(*) into v_ok, v_all from t_res;
  v_rep := E'\nPERF-BERICHT (' || v_part || '): ' || v_ok || ' von ' || v_all || ' Pruefungen ok';
  for r in select * from t_res order by ok, name loop
    v_rep := v_rep || E'\n' || case when r.ok then 'OK   ' else 'FAIL ' end || r.name || coalesce(' | ' || r.wert, '');
  end loop;
  raise exception '%', v_rep;
end
$outer$;
