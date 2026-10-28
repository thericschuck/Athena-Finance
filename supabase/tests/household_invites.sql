-- Rollender Test fuer 20261031100000_household_invites.sql (Einladungen, Beitritt, Kategorien-Merge, IBAN-Dubletten, Mitglied entfernen).
--
-- ACHTUNG: SCHREIBT (Fake-Nutzer @example.invalid, Testzeilen, Migration) und ist nur sicher, weil jeder Teil in EINEM einzigen
-- DO-Block laeuft, der am Ende IMMER mit `raise exception` endet -> alles wird zurueckgerollt, nichts persistiert.
-- Bericht in der Fehlermeldung ("HOUSEHOLD-INVITES-TESTBERICHT TEIL A/B"). Keine Nutzerdaten im Bericht (nur Testnamen, true/false, Zaehlwerte).
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. Vorher lesend: count(*) aus auth.users, households, household_members, household_invites (falls vorhanden), audit_log.
--   2. Je Teil EIN execute_sql-Aufruf. Marker `-- @@MIGRATION` ersetzen durch
--        v_s := $m1$ <Inhalt von supabase/migrations/20261031100000_household_invites.sql> $m1$; execute v_s;
--   3. Nachher lesend: dieselben Werte -> identisch; to_regclass('public.household_invites') null.
-- HINWEIS: Beim Live-Lauf passte die Migration plus der komplette Test nicht in EINEN execute_sql-Aufruf (Requeststate lief ab). Sie wurde
-- deshalb in fuenf kleinere Bloecke geteilt (B1 Einladungs-RLS, B2 Annahme+Merge, B3 IBAN, B4 Mitglied entfernen, B5 Regression Eric),
-- jeweils mit nur dem benoetigten Migrationsteil. Dieses Skript enthaelt dieselben Faelle in einem Block.
-- NACHTRAG (Review-Befunde): R1 Ablauf-CHECK + iban_conflict beim Beitritt, R2 Kurzschluss der IBAN-Trigger bei eigener IBAN (Dublette vor
-- Beitritt) + ACL fn_ensure_linked_account, R3 shared-Reset auch fuer depot_holdings/depot_transactions beim Entfernen. Gleiche Block-Technik.
-- TEIL A: synthetische Haushalte (Einladung, RLS, Annahme, Merge-Logik, IBAN, Entfernen).
-- TEIL B: Regression Eric (echter Haushalt, nur lesend gehasht + rueckrollende Fixture-Nutzer).

-- ===================================================== TEIL A =====================================================
do $outer$
declare
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_c uuid := gen_random_uuid();
  v_d uuid := gen_random_uuid(); v_e uuid := gen_random_uuid();
  v_h1 uuid; v_h2 uuid; v_s text; v_rep text; v_ok int; v_all int; n bigint; n2 bigint; msg text;
  r_a uuid; c_a uuid; sch_a uuid; tra_a uuid;
  d_root uuid; d_child uuid; d_new uuid; d_other uuid; d_rootinc uuid; d_sch uuid; d_tra uuid; d_bx uuid;
  acc_a uuid; acc_b uuid; res jsonb; tok text; h text;
begin
  create temp table t_res (name text, ok boolean, wert text);
  grant all on t_res to public;
  create function pg_temp.rec(p_name text, p_ok boolean, p_wert text) returns void language plpgsql as
  $f$ begin insert into pg_temp.t_res values (p_name, coalesce(p_ok, false), p_wert); end $f$;
  create function pg_temp.act(p uuid) returns void language plpgsql as
  $f$ begin
    reset role;
    if p is null then perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
  end $f$;
  create function pg_temp.hsh(p text) returns text language sql as
  $f$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $f$;

  -- @@MIGRATION (hier einfuegen:  v_s := $m1$ ...Dateiinhalt... $m1$;  execute v_s;)

  -- ===== Fixture =====
  insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at)
  select u, 'fx-' || left(u::text, 8) || '@example.invalid', 'authenticated', 'authenticated',
         '00000000-0000-0000-0000-000000000000', now(), now()
  from unnest(array[v_a, v_b, v_c, v_d, v_e]) u;
  insert into public.households (name, created_by) values ('fx-h1', v_a) returning id into v_h1;
  insert into public.households (name, created_by) values ('fx-h2', v_e) returning id into v_h2;
  insert into public.household_members (household_id, user_id, role) values
    (v_h1, v_a, 'owner'), (v_h1, v_b, 'member'), (v_h2, v_e, 'owner');

  -- Kategorien A (Haushaltsbaum): Root FXRoot (expense) > FXChild, Schulden (neutral), Transfers (neutral)
  insert into public.categories (user_id, name, type, sort_order) values (v_a, 'FXRoot', 'expense', 0) returning id into r_a;
  insert into public.categories (user_id, name, type, parent_id, sort_order) values (v_a, 'FXChild', 'expense', r_a, 0) returning id into c_a;
  insert into public.categories (user_id, name, type, sort_order) values (v_a, 'Schulden', 'neutral', 0) returning id into sch_a;
  insert into public.categories (user_id, name, type, sort_order) values (v_a, 'Transfers', 'neutral', 0) returning id into tra_a;
  insert into public.category_tax_overrides (category_id, user_id, tax_role) values (c_a, v_a, 'betriebsausgabe');

  -- Kategorien D (vor Beitritt, household_id null): gleiche Pfade mit anderer Schreibweise + neue Aeste
  insert into public.categories (user_id, name, type, sort_order) values (v_d, ' fxroot ', 'expense', 0) returning id into d_root;
  insert into public.categories (user_id, name, type, parent_id, sort_order, tax_role) values (v_d, 'FXCHILD', 'expense', d_root, 0, 'privat') returning id into d_child;
  insert into public.categories (user_id, name, type, parent_id, sort_order) values (v_d, 'FXNew', 'expense', d_child, 0) returning id into d_new;
  insert into public.categories (user_id, name, type, sort_order) values (v_d, 'FXOther', 'income', 0) returning id into d_other;
  insert into public.categories (user_id, name, type, sort_order) values (v_d, 'FXRoot', 'income', 0) returning id into d_rootinc;
  insert into public.categories (user_id, name, type, sort_order) values (v_d, 'Schulden', 'expense', 0) returning id into d_sch;
  insert into public.categories (user_id, name, type, sort_order) values (v_d, 'transfers', 'neutral', 0) returning id into d_tra;
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id, category_id, ai_category_id)
    values (v_d, 'FXIBAN-D', -1, 'EUR', current_date, 'dx1', d_child, d_root) returning id into d_bx;

  perform pg_temp.rec('a0: Migration angewendet (Tabelle da)', to_regclass('public.household_invites') is not null, null);

  -- ===== Einladungen / RLS =====
  tok := 'tok-' || gen_random_uuid()::text; h := pg_temp.hsh(tok);
  perform pg_temp.act(v_a);
  insert into public.household_invites (household_id, email, token_hash, created_by)
    values (v_h1, lower('FX-D@example.invalid'), h, v_a);
  select count(*) into n from public.household_invites;
  perform pg_temp.rec('b1: Owner legt Einladung an und sieht sie', n = 1, n::text);
  begin
    perform token_hash from public.household_invites;
    perform pg_temp.rec('b2: token_hash fuer authenticated nicht lesbar', false, 'lesbar');
  exception when insufficient_privilege then perform pg_temp.rec('b2: token_hash fuer authenticated nicht lesbar', true, null); end;
  begin
    perform * from public.household_invites;
    perform pg_temp.rec('b2b: select * scheitert bewusst', false, 'lesbar');
  exception when insufficient_privilege then perform pg_temp.rec('b2b: select * scheitert bewusst', true, null); end;
  perform pg_temp.act(v_a);
  begin
    update public.household_invites set used_at = now();
    perform pg_temp.rec('b3: UPDATE durch authenticated nicht erlaubt', false, 'ok');
  exception when insufficient_privilege then perform pg_temp.rec('b3: UPDATE durch authenticated nicht erlaubt', true, null); end;
  perform pg_temp.act(v_b);
  begin
    insert into public.household_invites (household_id, email, token_hash, created_by)
      values (v_h1, 'x@example.invalid', pg_temp.hsh('t2'), v_b);
    perform pg_temp.rec('b4: Mitglied (kein Owner) kann nicht einladen', false, 'ok');
  exception when others then perform pg_temp.rec('b4: Mitglied (kein Owner) kann nicht einladen', sqlstate = '42501', sqlstate); end;
  perform pg_temp.act(v_b);
  select count(*) into n from public.household_invites;
  perform pg_temp.rec('b5: Mitglied sieht keine Einladungen', n = 0, n::text);
  perform pg_temp.act(v_c);
  select count(*) into n from public.household_invites;
  perform pg_temp.rec('b6: Aussenstehender sieht keine Einladungen', n = 0, n::text);
  perform pg_temp.act(v_a);
  begin
    insert into public.household_invites (household_id, email, token_hash, created_by)
      values (v_h2, 'y@example.invalid', pg_temp.hsh('t3'), v_a);
    perform pg_temp.rec('b7: Owner kann nicht fuer fremden Haushalt einladen', false, 'ok');
  exception when others then perform pg_temp.rec('b7: Owner kann nicht fuer fremden Haushalt einladen', sqlstate = '42501', sqlstate); end;
  perform pg_temp.act(v_b);
  delete from public.household_invites; get diagnostics n = row_count;
  perform pg_temp.rec('b8: Mitglied kann nicht loeschen', n = 0, n::text);
  perform pg_temp.act(v_a);
  begin
    perform public.fn_accept_household_invite(h, v_d, 'fx-d@example.invalid');
    perform pg_temp.rec('b9: authenticated darf Annahme-Funktion nicht aufrufen', false, 'ok');
  exception when insufficient_privilege then perform pg_temp.rec('b9: authenticated darf Annahme-Funktion nicht aufrufen', true, null); end;
  begin
    perform public.fn_merge_user_categories_into_household(v_d, v_h1);
    perform pg_temp.rec('b10: authenticated darf Merge nicht aufrufen', false, 'ok');
  exception when insufficient_privilege then perform pg_temp.rec('b10: authenticated darf Merge nicht aufrufen', true, null); end;
  begin
    perform public.fn_remove_household_member(v_h1, v_b, v_a);
    perform pg_temp.rec('b11: authenticated darf Entfernen-Funktion nicht aufrufen', false, 'ok');
  exception when insufficient_privilege then perform pg_temp.rec('b11: authenticated darf Entfernen-Funktion nicht aufrufen', true, null); end;
  perform pg_temp.act(v_a);
  insert into public.household_invites (household_id, email, token_hash, created_by)
    values (v_h1, 'z@example.invalid', pg_temp.hsh('t9'), v_a);
  delete from public.household_invites where email = 'z@example.invalid'; get diagnostics n = row_count;
  perform pg_temp.rec('b12: Owner kann Einladung loeschen (widerrufen)', n = 1, n::text);
  perform pg_temp.act(null);

  -- ===== Annahme =====
  update auth.users set email = lower('FX-D@example.invalid') where id = v_d;
  begin perform public.fn_accept_household_invite(pg_temp.hsh('unbekannt'), v_d, 'fx-d@example.invalid');
    perform pg_temp.rec('c1: unbekanntes Token', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c1: unbekanntes Token -> invite_invalid', msg = 'invite_invalid', msg); end;
  begin perform public.fn_accept_household_invite(h, v_d, 'falsch@example.invalid');
    perform pg_temp.rec('c2: falsche E-Mail', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c2: falsche E-Mail -> invite_invalid (gleiche Meldung)', msg = 'invite_invalid', msg); end;
  begin perform public.fn_accept_household_invite(h, v_c, 'fx-d@example.invalid');
    perform pg_temp.rec('c3: Token mit fremdem Nutzer', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c3: Token mit fremdem Nutzer -> invite_invalid', msg = 'invite_invalid', msg); end;
  update public.household_invites set expires_at = now() - interval '1 minute' where token_hash = h;
  begin perform public.fn_accept_household_invite(h, v_d, 'fx-d@example.invalid');
    perform pg_temp.rec('c4: abgelaufen', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c4: abgelaufen -> invite_invalid', msg = 'invite_invalid', msg); end;
  update public.household_invites set expires_at = now() + interval '1 day' where token_hash = h;
  select count(*) into n from public.audit_log where owner_id in (v_d, v_a);
  -- E-Mail-Schreibweise des Aufrufers egal (Gross/Klein)
  perform public.fn_accept_household_invite(h, v_d, 'FX-D@Example.INVALID');
  select count(*) into n2 from public.audit_log where owner_id in (v_d, v_a);
  perform pg_temp.rec('c5: gueltige Annahme (case-insensitiv)',
    exists (select 1 from public.household_members where household_id = v_h1 and user_id = v_d and role = 'member'), null);
  perform pg_temp.rec('c6: Einladung als benutzt markiert',
    exists (select 1 from public.household_invites where token_hash = h and used_at is not null and used_by = v_d), null);
  perform pg_temp.rec('c7: Merge schreibt kein Audit-Rauschen', n2 = n, (n2 - n)::text);
  begin perform public.fn_accept_household_invite(h, v_d, 'fx-d@example.invalid');
    perform pg_temp.rec('c8: Token nicht wiederverwendbar', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c8: Token nicht wiederverwendbar -> invite_invalid', msg = 'invite_invalid', msg); end;
  -- Nutzer in anderem Haushalt
  tok := 'tok-' || gen_random_uuid()::text;
  insert into public.household_invites (household_id, email, token_hash, created_by)
    values (v_h1, (select lower(btrim(email)) from auth.users where id = v_e), pg_temp.hsh(tok), v_a);
  begin perform public.fn_accept_household_invite(pg_temp.hsh(tok), v_e, (select email from auth.users where id = v_e));
    perform pg_temp.rec('c9: Nutzer in anderem Haushalt', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('c9: Nutzer in anderem Haushalt -> already_in_other_household', msg = 'already_in_other_household', msg); end;
  perform pg_temp.rec('c10: bei Fehler nichts eingetragen, Einladung offen',
    not exists (select 1 from public.household_members where user_id = v_e and household_id = v_h1)
    and exists (select 1 from public.household_invites where token_hash = pg_temp.hsh(tok) and used_at is null), null);

  -- ===== Kategorien-Merge =====
  perform pg_temp.rec('d1: gemergte Kategorien von D geloescht (nur neue Aeste bleiben: 3)',
    (select count(*) from public.categories where user_id = v_d) = 3, (select count(*)::text from public.categories where user_id = v_d));
  perform pg_temp.rec('d2: alle Kategorien von D mit household_id',
    not exists (select 1 from public.categories where user_id = v_d and household_id is distinct from v_h1), null);
  perform pg_temp.rec('d3: Buchung zeigt auf Haushaltskategorie (category_id + ai_category_id)',
    exists (select 1 from public.bank_transactions where id = d_bx and category_id = c_a and ai_category_id = r_a), null);
  perform pg_temp.rec('d4: neuer Ast haengt unter gemergtem Elternteil',
    exists (select 1 from public.categories where id = d_new and parent_id = c_a), null);
  perform pg_temp.rec('d5: Override von D auf Zielkategorie, Override von A unveraendert',
    exists (select 1 from public.category_tax_overrides where category_id = c_a and user_id = v_d and tax_role = 'privat')
    and exists (select 1 from public.category_tax_overrides where category_id = c_a and user_id = v_a and tax_role = 'betriebsausgabe'), null);
  perform pg_temp.rec('d6: Wurzeln Schulden/Transfers genau einmal im Haushalt (auch bei abweichendem Typ/Schreibweise)',
    (select count(*) from public.categories where household_id = v_h1 and parent_id is null and lower(btrim(name)) = 'schulden') = 1
    and (select count(*) from public.categories where household_id = v_h1 and parent_id is null and lower(btrim(name)) = 'transfers') = 1, null);
  perform pg_temp.rec('d7: gleicher Pfad, anderer Typ bleibt eigener Ast (income)',
    exists (select 1 from public.categories where id = d_rootinc and household_id = v_h1), null);
  perform pg_temp.rec('d8: keine Pfadduplikate (Pfad+Typ) im Haushaltsbaum',
    (select count(*) from (
       with recursive t as (
         select id, lower(btrim(name)) pfad, type from public.categories where household_id = v_h1 and parent_id is null
         union all
         select c.id, t.pfad || ' > ' || lower(btrim(c.name)), c.type from public.categories c join t on c.parent_id = t.id)
       select pfad, type from t group by pfad, type having count(*) > 1) q) = 0, null);
  perform pg_temp.rec('d9: Kategorien von A unveraendert (4, keine geloescht)',
    (select count(*) from public.categories where user_id = v_a) = 4, null);
  select (public.fn_merge_user_categories_into_household(v_d, v_h1)) into res;
  perform pg_temp.rec('d10: zweiter Lauf idempotent (0 gemergt, 3 neue Aeste, Zahl unveraendert)',
    (res ->> 'merged')::int = 0 and (res ->> 'new_branches')::int = 3
    and (select count(*) from public.categories where user_id = v_d) = 3, res::text);
  begin
    perform public.fn_merge_user_categories_into_household(v_c, v_h1);
    perform pg_temp.rec('d11: Merge fuer Nichtmitglied scheitert', false, 'ok');
  exception when others then msg := sqlerrm; perform pg_temp.rec('d11: Merge fuer Nichtmitglied scheitert', msg = 'merge_not_member', msg); end;
  -- Audit-Skip gilt nicht fuer eingeloggte Nutzer
  select count(*) into n from public.audit_log where owner_id = v_a and table_name = 'categories';
  perform pg_temp.act(v_a);
  perform set_config('app.audit_skip', '1', true);
  update public.categories set name = 'FXRoot2' where id = r_a;
  perform pg_temp.act(null);
  select count(*) into n2 from public.audit_log where owner_id = v_a and table_name = 'categories';
  perform pg_temp.rec('d12: Audit-Skip wirkt nicht fuer eingeloggte Nutzer', n2 = n + 1, (n2 - n)::text);
  perform set_config('app.audit_skip', '', true);
  update public.categories set name = 'FXRoot' where id = r_a;

  -- ===== IBAN-Dubletten =====
  insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_a, 'fx-a', 'checking', 'EUR', 'DE00FX01') returning id into acc_a;
  begin
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_b, 'fx-b', 'checking', 'EUR', 'de00 fx01');
    perform pg_temp.rec('e1: Peer-Konto mit gleicher IBAN (normalisiert) abgelehnt', false, 'ok');
  exception when unique_violation then perform pg_temp.rec('e1: Peer-Konto mit gleicher IBAN (normalisiert) abgelehnt', true, null); end;
  insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_b, 'fx-b2', 'checking', 'EUR', 'DE00FX02') returning id into acc_b;
  begin
    update public.accounts set bank_iban = 'DE00FX01' where id = acc_b;
    perform pg_temp.rec('e2: UPDATE auf Peer-IBAN abgelehnt', false, 'ok');
  exception when unique_violation then perform pg_temp.rec('e2: UPDATE auf Peer-IBAN abgelehnt', true, null); end;
  begin
    insert into public.accounts (user_id, name, type, currency, bank_iban) values (v_c, 'fx-c', 'checking', 'EUR', 'DE00FX01');
    perform pg_temp.rec('e3: Nutzer ohne Haushalt: gleiche IBAN weiter erlaubt (Regression)', true, null);
  exception when others then perform pg_temp.rec('e3: Nutzer ohne Haushalt: gleiche IBAN weiter erlaubt (Regression)', false, sqlerrm); end;
  update public.accounts set name = 'fx-a-neu' where id = acc_a;
  perform pg_temp.rec('e4: Update ohne IBAN-Aenderung nicht blockiert', true, null);

  -- bank_balance: A synchronisiert, B (Peer) wird uebersprungen, C (kein Haushalt) normal
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency, bank_label)
    values (v_a, 'DE00FX01', 1, 1, 'EUR', 'FXBank');
  select count(*) into n from public.accounts where user_id = v_a and bank_iban = 'DE00FX01';
  perform pg_temp.rec('f1: A: Konto vorhanden, kein zweites angelegt', n = 1, n::text);
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency)
    values (v_b, 'de00 fx01', 2, 2, 'EUR');
  select count(*) into n from public.bank_balance where user_id = v_b;
  perform pg_temp.rec('f2: Peer-Saldo derselben IBAN uebersprungen', n = 0, n::text);
  select count(*) into n from public.accounts where user_id = v_b and bank_iban = 'DE00FX01';
  perform pg_temp.rec('f3: kein Konto fuer Peer angelegt', n = 0, n::text);
  perform pg_temp.rec('f4: fn_ensure_linked_account fuer Peer liefert null, legt nichts an',
    public.fn_ensure_linked_account(v_b, 'DE00FX01', 'x', 1, 'EUR') is null
    and not exists (select 1 from public.accounts where user_id = v_b and bank_iban = 'DE00FX01'), null);
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency)
    values (v_b, 'DE00FX09', 5, 5, 'EUR');
  perform pg_temp.rec('f5: eigene IBAN des Peers funktioniert (Konto, institution neutral Bank)',
    (select institution from public.accounts where user_id = v_b and bank_iban = 'DE00FX09') = 'Bank', null);
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency, bank_label)
    values (v_a, 'DE00FX03', 5, 5, 'EUR', 'FXBank');
  perform pg_temp.rec('f6: institution aus bank_label statt Raiffeisenbank',
    (select institution from public.accounts where user_id = v_a and bank_iban = 'DE00FX03') = 'FXBank', null);
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency)
    values (v_c, 'DE00FX01', 7, 7, 'EUR');
  perform pg_temp.rec('f7: Nutzer ohne Haushalt: Saldo wie bisher gespeichert',
    (select count(*) from public.bank_balance where user_id = v_c) = 1, null);
  -- Upsert-Pfad bank_balance
  insert into public.bank_balance (user_id, account_iban, booked_balance, available_balance, currency)
    values (v_a, 'DE00FX01', 11, 11, 'EUR')
    on conflict (user_id, account_iban) do update set booked_balance = excluded.booked_balance;
  perform pg_temp.rec('f8: Saldo-Upsert fuer Besitzer funktioniert',
    (select booked_balance from public.bank_balance where user_id = v_a and account_iban = 'DE00FX01') = 11, null);

  -- bank_transactions
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_a, 'DE00FX01', -1, 'EUR', current_date, 'e1');
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_b, 'DE00FX01', -1, 'EUR', current_date, 'e1');
  perform pg_temp.rec('g1: Doppel-Sync derselben Buchung beim Peer uebersprungen',
    (select count(*) from public.bank_transactions where user_id = v_b) = 0, null);
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_b, 'DE00FX01', -2, 'EUR', current_date, 'e2');
  perform pg_temp.rec('g2: neue Buchung auf IBAN im Besitz des Peers uebersprungen (Besitzer synchronisiert)',
    (select count(*) from public.bank_transactions where user_id = v_b) = 0, null);
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_a, 'DE00FX77', -1, 'EUR', current_date, 'z1');
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_b, 'DE00FX77', -1, 'EUR', current_date, 'z1'), (v_b, 'DE00FX77', -1, 'EUR', current_date, 'z2');
  perform pg_temp.rec('g2b: IBAN ohne Konto: gleiche external_id beim Peer uebersprungen, andere angelegt',
    (select count(*) from public.bank_transactions where user_id = v_b and external_id = 'z1') = 0
    and (select count(*) from public.bank_transactions where user_id = v_b and external_id = 'z2') = 1, null);
  delete from public.bank_transactions where user_id = v_b;
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_b, 'DE00FX09', -2, 'EUR', current_date, 'e1');
  perform pg_temp.rec('g3: gleiche external_id auf eigener anderer IBAN bleibt erlaubt',
    (select count(*) from public.bank_transactions where user_id = v_b) = 1, null);
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id, description)
    values (v_a, 'DE00FX01', -1, 'EUR', current_date, 'e1', 'neu')
    on conflict (user_id, external_id) do update set description = excluded.description;
  perform pg_temp.rec('g4: Upsert on_conflict (user_id, external_id) des Besitzers aktualisiert (nicht uebersprungen)',
    (select description from public.bank_transactions where user_id = v_a and external_id = 'e1') = 'neu', null);
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_a, 'DE00FX01', -3, 'EUR', current_date, 'e3')
    on conflict (user_id, external_id) do update set amount = excluded.amount;
  perform pg_temp.rec('g5: Upsert legt neue Buchung des Besitzers an',
    (select count(*) from public.bank_transactions where user_id = v_a and external_id = 'e3') = 1, null);
  insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id)
    values (v_c, 'DE00FX01', -1, 'EUR', current_date, 'e1');
  perform pg_temp.rec('g6: Nutzer ohne Haushalt unveraendert (Regression)',
    (select count(*) from public.bank_transactions where user_id = v_c) = 1, null);

  -- ===== Mitglied entfernen =====
  update public.accounts set shared = true where id = acc_a;
  update public.accounts set shared = true where id = acc_b;
  declare b_cat uuid; b_tx uuid; b_own uuid; cnt_h1 int;
  begin
    insert into public.categories (user_id, name, type, sort_order) values (v_b, 'FXBCat', 'expense', 0) returning id into b_cat;
    insert into public.bank_transactions (user_id, account_iban, amount, currency, value_date, external_id, category_id, ai_category_id)
      values (v_b, 'DE00FX09', -1, 'EUR', current_date, 'bx1', c_a, b_cat) returning id into b_tx;
    select count(*) into cnt_h1 from public.categories where household_id = v_h1;
    begin perform public.fn_remove_household_member(v_h1, v_b, v_b);
      perform pg_temp.rec('h1: sich selbst entfernen', false, 'ok');
    exception when others then msg := sqlerrm; perform pg_temp.rec('h1: sich selbst entfernen -> remove_self', msg = 'remove_self', msg); end;
    begin perform public.fn_remove_household_member(v_h1, v_a, v_b);
      perform pg_temp.rec('h2: Nicht-Owner entfernt', false, 'ok');
    exception when others then msg := sqlerrm; perform pg_temp.rec('h2: Nicht-Owner -> remove_not_owner', msg = 'remove_not_owner', msg); end;
    select count(*) into n from public.audit_log where owner_id in (v_a, v_b);
    res := public.fn_remove_household_member(v_h1, v_b, v_a);
    select count(*) into n2 from public.audit_log where owner_id in (v_a, v_b);
    perform pg_temp.rec('h3: Mitglied entfernt', not exists (select 1 from public.household_members where user_id = v_b), res::text);
    perform pg_temp.rec('h4: shared-Flag des Mitglieds zurueckgesetzt, Konto von A weiter geteilt',
      (select not shared from public.accounts where id = acc_b) and (select shared from public.accounts where id = acc_a), null);
    perform pg_temp.rec('h5: Kontodaten bleiben beim Mitglied',
      exists (select 1 from public.accounts where id = acc_b and user_id = v_b)
      and exists (select 1 from public.bank_transactions where id = b_tx and user_id = v_b), null);
    perform pg_temp.rec('h6: Buchung des Mitglieds zeigt auf private Kopie (gleicher Name, privat, Besitzer Mitglied)',
      exists (select 1 from public.bank_transactions t join public.categories c on c.id = t.category_id
              where t.id = b_tx and c.user_id = v_b and c.household_id is null and c.name = 'FXChild'), null);
    perform pg_temp.rec('h7: ai_category ebenfalls auf private Kopie',
      exists (select 1 from public.bank_transactions t join public.categories c on c.id = t.ai_category_id
              where t.id = b_tx and c.user_id = v_b and c.household_id is null and c.name = 'FXBCat'), null);
    perform pg_temp.rec('h8: Haushaltsbaum vollstaendig (gleiche Anzahl, von B angelegte Kategorie jetzt bei Owner)',
      (select count(*) from public.categories where household_id = v_h1) = cnt_h1
      and (select user_id from public.categories where id = b_cat) = v_a, null);
    perform pg_temp.rec('h9: kein Audit-Rauschen beim Entfernen', n2 = n, (n2 - n)::text);
    perform pg_temp.act(v_b);
    select count(*) into n from public.categories where user_id = v_b;
    select count(*) into n2 from public.categories where household_id = v_h1;
    perform pg_temp.rec('h10: Mitglied sieht eigene (private) Kategorien, aber nichts mehr vom Haushalt',
      n > 0 and (select count(*) from public.categories c where c.household_id = v_h1) = 0, n::text);
    perform pg_temp.act(null);
    perform pg_temp.rec('h11: Nicht-Mitglied kann nicht entfernt werden',
      (select count(*) from public.household_members where user_id = v_c) = 0, null);
    begin perform public.fn_remove_household_member(v_h1, v_c, v_a);
      perform pg_temp.rec('h12: Entfernen eines Nichtmitglieds', false, 'ok');
    exception when others then msg := sqlerrm; perform pg_temp.rec('h12: Nichtmitglied -> remove_not_member', msg = 'remove_not_member', msg); end;
  end;

  -- ===== Bericht =====
  reset role;
  select count(*) filter (where ok), count(*) into v_ok, v_all from pg_temp.t_res;
  select string_agg(name || ' [' || coalesce(wert, '') || ']', E'\n') into v_rep from pg_temp.t_res where not ok;
  raise exception E'HOUSEHOLD-INVITES-TESTBERICHT TEIL A: %/% ok\nFehlgeschlagen:\n%', v_ok, v_all, coalesce(v_rep, '(keine)');
end
$outer$;
