-- HAUSHALT PHASE 4: Einladung, Beitritt, Kategorien-Zusammenfuehrung, IBAN-Dubletten im Haushalt, Mitglied entfernen.
-- Plan: docs/haushalt-multiuser.md (Abschnitte 4, 5, Phase 4), Ablauf: docs/haushalt-einladung.md.
-- Voraussetzung: households_members, household_rls, audit_actor, categories_household (Tabelle category_tax_overrides).
--
-- Warum: Malik bekommt einen eigenen Account (Signup nur per Einladung), tritt dem Haushalt bei, sein Kategorienbaum wird in
-- den Haushaltsbaum ueberfuehrt, und ein gemeinsam verknuepftes Bankkonto darf keine Doppelkonten/Doppelbuchungen erzeugen.
--
-- Wie:
--  1. household_invites: token_hash = sha256(Klartext-Token). Der Klartext wird NIE gespeichert und steht nur im Link, den der
--     Owner einmal sieht. RLS: nur Owner des Haushalts darf lesen/anlegen/loeschen (Initplan, Rolle authenticated). SPALTENRECHTE
--     (Muster bank_connections): token_hash ist fuer authenticated nicht lesbar; UPDATE gibt es nicht (Annahme nur serverseitig).
--  2. fn_accept_household_invite(token_hash, user, email): SECURITY DEFINER, search_path '', EXECUTE nur service_role. Prueft
--     Token (existiert, nicht abgelaufen, nicht benutzt, E-Mail passt case-insensitiv UND entspricht dem auth.users-Eintrag),
--     traegt den Nutzer als 'member' ein (Nutzer schon in anderem Haushalt: Fehler already_in_other_household), markiert die
--     Einladung benutzt, ruft die Kategorien-Zusammenfuehrung. Alle Token-Fehler sind EIN Fehlercode (invite_invalid), damit
--     Unbefugte nicht erfahren, ob ein Token existiert, abgelaufen oder benutzt ist.
--  3. fn_merge_user_categories_into_household(user, household): idempotent, Abgeleitet aus supabase/data/haushalt_kategorien_merge_entwurf.sql
--     (Pfad+Typ-Matching, Wurzeln Schulden/Transfers immer auf die Haushaltswurzel, FKs umhaengen, Steuer-Overrides des Nutzers
--     auf die Zielkategorie, neue Aeste behalten). Audit-Rauschen: fn_audit ueberspringt Zeilen, wenn auth.uid() null ist UND die
--     Transaktions-Variable app.audit_skip = '1' gesetzt ist (nur Service-Role-/SQL-Kontext; ein eingeloggter Nutzer kann die Audit-
--     Protokollierung dadurch NICHT umgehen).
--  4. IBAN-Dubletten im Haushalt: (a) accounts: Trigger verbietet eine bank_iban, die bei einem Konto eines anderen Mitglieds
--     steht; (b) fn_ensure_linked_account legt kein Konto an, wenn ein Peer die IBAN besitzt (Besitzer synchronisiert); die
--     fest verdrahtete institution 'Raiffeisenbank' entfaellt (bank_balance.bank_label, sonst bank_connections.label bei genau
--     einer Verbindung, sonst 'Bank'); (c) bank_balance/bank_transactions: BEFORE-INSERT ueberspringt Zeilen (return null), wenn ein
--     Peer die IBAN besitzt (accounts.bank_iban oder bank_balance) bzw. dieselbe account_iban + external_id schon hat. Eigene
--     Zeilen und Nutzer ohne Haushalt sind nie betroffen; der Upsert-Pfad on_conflict (user_id, external_id) bleibt intakt.
--  5. fn_remove_household_member(household, user, actor): nur Owner, nicht sich selbst, nur Rolle member. Die Daten des Mitglieds
--     bleiben bei ihm (user_id). Regel fuer geteilte Objekte: alle shared-Flags des Mitglieds werden auf false gesetzt (sonst
--     wuerde ein spaeterer Wiederbeitritt stillschweigend wieder teilen). Kategorien: das Mitglied bekommt eine PRIVATE KOPIE des
--     aktuellen Haushaltsbaums (Buchungen/Vertraege/Steuer-Overrides des Mitglieds werden auf die Kopie umgehaengt); vom Mitglied
--     angelegte Kategorien gehen an den Owner (der Haushaltsbaum bleibt vollstaendig). Danach wird die Mitgliedschaft geloescht.
--     Konten des Mitglieds, die der Haushalt mitgezaehlt hat, verschwinden aus der Haushaltssicht (RLS), bleiben aber beim Mitglied.
-- Idempotent soweit moeglich (create or replace, if not exists). Rueckgaengig: supabase/rollbacks/20261031100000_household_invites.down.sql
-- Test: supabase/tests/household_invites.sql (rueckrollend, ein DO-Block)

-- 0. Hilfsfunktionen ----------------------------------------------------------------------------------------------------
create or replace function public.is_household_owner(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create or replace function public.fn_norm_iban(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g'));
$$;

-- Mitglieder desselben Haushalts OHNE den Nutzer selbst. Nur intern (EXECUTE nur service_role/Owner der Funktion).
create or replace function public.fn_household_peer_users(p_user uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m2.user_id
  from public.household_members m1
  join public.household_members m2 on m2.household_id = m1.household_id and m2.user_id <> m1.user_id
  where m1.user_id = p_user;
$$;

-- true, wenn ein Haushaltsmitglied (ausser p_user) die IBAN besitzt (Konto oder bank_balance). Aufrufer: eingeloggter Nutzer nur
-- fuer sich selbst (Schutz vor Ausforschen fremder Haushalte), service_role/Trigger fuer jeden.
create or replace function public.fn_iban_peer_owned(p_user uuid, p_iban text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_n text := public.fn_norm_iban(p_iban);
begin
  if (select auth.uid()) is not null and (select auth.uid()) <> p_user then return false; end if;
  if v_n = '' then return false; end if;
  return exists (
    select 1 from public.accounts a
    where a.user_id in (select public.fn_household_peer_users(p_user))
      and a.bank_iban is not null and public.fn_norm_iban(a.bank_iban) = v_n
  ) or exists (
    select 1 from public.bank_balance b
    where b.user_id in (select public.fn_household_peer_users(p_user))
      and public.fn_norm_iban(b.account_iban) = v_n
  );
end;
$$;

revoke all on function public.is_household_owner(uuid)        from public, anon;
revoke all on function public.fn_household_peer_users(uuid)   from public, anon, authenticated;
revoke all on function public.fn_iban_peer_owned(uuid, text)  from public, anon;
grant execute on function public.is_household_owner(uuid)       to authenticated, service_role;
grant execute on function public.fn_household_peer_users(uuid)  to service_role;
grant execute on function public.fn_iban_peer_owned(uuid, text) to authenticated, service_role;

-- 1. Einladungen --------------------------------------------------------------------------------------------------------
create table if not exists public.household_invites (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households (id) on delete cascade,
  email        text        not null,
  role         text        not null default 'member',
  token_hash   text        not null unique,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  used_at      timestamptz,
  used_by      uuid        references auth.users (id) on delete set null,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.household_invites is
  'Haushalts-Einladung. token_hash = sha256(Klartext-Token), der Klartext wird nie gespeichert. authenticated darf token_hash nicht lesen; Annahme nur ueber fn_accept_household_invite (service_role).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_invites_role_check'
                 and conrelid = 'public.household_invites'::regclass) then
    alter table public.household_invites add constraint household_invites_role_check check (role in ('member'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_invites_email_check'
                 and conrelid = 'public.household_invites'::regclass) then
    alter table public.household_invites
      add constraint household_invites_email_check
      check (email = lower(btrim(email)) and char_length(email) between 3 and 320 and position('@' in email) > 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_invites_expiry_check'
                 and conrelid = 'public.household_invites'::regclass) then
    alter table public.household_invites
      add constraint household_invites_expiry_check check (expires_at <= created_at + interval '14 days');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_invites_token_hash_check'
                 and conrelid = 'public.household_invites'::regclass) then
    alter table public.household_invites add constraint household_invites_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists household_invites_household_idx on public.household_invites (household_id);
create index if not exists household_invites_created_by_idx on public.household_invites (created_by);
create index if not exists household_invites_used_by_idx on public.household_invites (used_by);

alter table public.household_invites enable row level security;

drop policy if exists household_invites_owner_select on public.household_invites;
create policy household_invites_owner_select on public.household_invites
  for select to authenticated
  using ((select public.is_household_owner(household_id)));

drop policy if exists household_invites_owner_insert on public.household_invites;
create policy household_invites_owner_insert on public.household_invites
  for insert to authenticated
  with check ((select public.is_household_owner(household_id)) and created_by = (select auth.uid()));

drop policy if exists household_invites_owner_delete on public.household_invites;
create policy household_invites_owner_delete on public.household_invites
  for delete to authenticated
  using ((select public.is_household_owner(household_id)));

revoke all on table public.household_invites from anon, authenticated;
grant select (id, household_id, email, role, expires_at, used_at, used_by, created_by, created_at)
  on public.household_invites to authenticated;
grant insert (household_id, email, role, token_hash, expires_at, created_by) on public.household_invites to authenticated;
grant delete on public.household_invites to authenticated;
grant all on table public.household_invites to service_role;

-- 2. Audit: Zeilen waehrend der Zusammenfuehrung nicht protokollieren (nur Service-Kontext) -------------------------------
create or replace function public.fn_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_id    uuid;
  v_old   jsonb;
  v_new   jsonb;
begin
  -- Sammelvorgaenge der Service-Role (z. B. Kategorien-Zusammenfuehrung) setzen app.audit_skip. Eingeloggte Nutzer koennen
  -- damit nichts umgehen: bei auth.uid() <> null wird die Variable ignoriert.
  if v_actor is null and coalesce(current_setting('app.audit_skip', true), '') = '1' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if TG_OP <> 'INSERT' then v_old := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then v_new := to_jsonb(new); end if;

  if TG_OP = 'UPDATE' and (v_old = v_new or (v_old - 'updated_at') = (v_new - 'updated_at')) then
    return new;
  end if;

  v_owner := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
  if coalesce(v_actor, v_owner) is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := (coalesce(v_new, v_old) ->> 'id')::uuid;

  insert into public.audit_log
    (user_id, actor_id, actor_kind, owner_id, table_name, record_id, action, old_values, new_values)
  values (
    coalesce(v_actor, v_owner),
    v_actor,
    case when v_actor is not null then 'user' else 'system' end,
    v_owner,
    TG_TABLE_NAME, v_id, TG_OP, v_old, v_new
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

-- 3. Kategorien-Zusammenfuehrung -----------------------------------------------------------------------------------------
create or replace function public.fn_merge_user_categories_into_household(p_user uuid, p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merged int := 0;
  v_new    int := 0;
  v_prev   text := current_setting('app.audit_skip', true);
begin
  if not exists (select 1 from public.household_members m where m.household_id = p_household and m.user_id = p_user) then
    raise exception 'merge_not_member' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('merge:' || p_household::text));
  perform set_config('app.audit_skip', '1', true);

  drop table if exists pg_temp.cat_merge_map;
  create temp table cat_merge_map on commit drop as
  with recursive t as (
    select c.id, c.user_id, c.type, lower(btrim(c.name)) as pfad, 0 as depth, array[c.id] as seen
    from public.categories c
    where c.parent_id is null and (c.household_id = p_household or c.user_id = p_user)
    union all
    select c.id, c.user_id, c.type, t.pfad || ' > ' || lower(btrim(c.name)), t.depth + 1, t.seen || c.id
    from public.categories c join t on c.parent_id = t.id
    where not c.id = any (t.seen) and (c.household_id = p_household or c.user_id = p_user)
  )
  select m.id as src_id, tgt.id as target_id
  from t m
  left join lateral (
    select h.id
    from t h
    join public.categories hc on hc.id = h.id
    where hc.household_id = p_household
      and h.user_id <> p_user
      and h.pfad = m.pfad
      and (h.type = m.type or (m.depth = 0 and m.pfad in ('schulden', 'transfers')))
    order by coalesce((select hm.role = 'owner' from public.household_members hm
                       where hm.household_id = p_household and hm.user_id = h.user_id), false) desc,
             h.id::text
    limit 1
  ) tgt on true
  where m.user_id = p_user;

  -- Steuer-Overrides: vorhandene Overrides des Nutzers, dann die (eingefrorenen) Legacy-Spalten. Nie ueberschreiben.
  insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
  select m.target_id, o.user_id, o.tax_role, o.euer_zeile, o.business_share
  from pg_temp.cat_merge_map m
  join public.category_tax_overrides o on o.category_id = m.src_id and o.user_id = p_user
  where m.target_id is not null
  on conflict (category_id, user_id) do nothing;

  insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
  select m.target_id, p_user, c.tax_role, c.euer_zeile, c.business_share
  from pg_temp.cat_merge_map m
  join public.categories c on c.id = m.src_id
  where m.target_id is not null
    and (c.tax_role is not null or c.euer_zeile is not null or c.business_share is not null)
  on conflict (category_id, user_id) do nothing;

  -- FKs umhaengen (nur gemergte).
  update public.transactions t set category_id = m.target_id
    from pg_temp.cat_merge_map m where t.category_id = m.src_id and m.target_id is not null;
  update public.bank_transactions t set category_id = m.target_id
    from pg_temp.cat_merge_map m where t.category_id = m.src_id and m.target_id is not null;
  update public.bank_transactions t set ai_category_id = m.target_id
    from pg_temp.cat_merge_map m where t.ai_category_id = m.src_id and m.target_id is not null;
  update public.contracts t set category_id = m.target_id
    from pg_temp.cat_merge_map m where t.category_id = m.src_id and m.target_id is not null;

  -- Kinder gemergter Kategorien (neue Aeste) an die Haushaltskategorie haengen, bevor die Quelle geloescht wird
  -- (parent_id-FK ist ON DELETE SET NULL und wuerde sie sonst still zu Wurzeln machen).
  update public.categories c set parent_id = m.target_id
    from pg_temp.cat_merge_map m
    where c.parent_id = m.src_id and m.target_id is not null
      and c.id not in (select x.src_id from pg_temp.cat_merge_map x where x.target_id is not null);

  -- Neue Aeste behalten (Ersteller bleibt user_id) und gehoeren zum Haushalt.
  update public.categories c set household_id = p_household
    where c.user_id = p_user and c.household_id is distinct from p_household;
  select count(*) into v_new from pg_temp.cat_merge_map where target_id is null;

  delete from public.categories c using pg_temp.cat_merge_map m where c.id = m.src_id and m.target_id is not null;
  get diagnostics v_merged = row_count;

  perform set_config('app.audit_skip', coalesce(v_prev, ''), true);
  return jsonb_build_object('merged', v_merged, 'new_branches', v_new);
end;
$$;

-- 4. Einladung annehmen --------------------------------------------------------------------------------------------------
create or replace function public.fn_accept_household_invite(p_token_hash text, p_user uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.household_invites%rowtype;
  v_mail text;
  v_cur uuid;
begin
  select * into v_inv from public.household_invites where token_hash = p_token_hash for update;
  select lower(btrim(u.email)) into v_mail from auth.users u where u.id = p_user;

  if not found or v_inv.id is null or v_inv.used_at is not null or v_inv.expires_at <= now()
     or v_mail is null or v_mail <> lower(btrim(coalesce(p_email, ''))) or v_mail <> v_inv.email then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  select m.household_id into v_cur from public.household_members m where m.user_id = p_user;
  if v_cur is not null and v_cur <> v_inv.household_id then
    raise exception 'already_in_other_household' using errcode = 'P0001';
  end if;
  if v_cur is null and exists (
    select 1 from (
      select public.fn_norm_iban(a.bank_iban) as i from public.accounts a where a.user_id = p_user and a.bank_iban is not null
      union select public.fn_norm_iban(b.account_iban) from public.bank_balance b where b.user_id = p_user
    ) mine
    join (
      select public.fn_norm_iban(a.bank_iban) as i from public.accounts a
        where a.bank_iban is not null and a.user_id in (select m.user_id from public.household_members m where m.household_id = v_inv.household_id)
      union select public.fn_norm_iban(b.account_iban) from public.bank_balance b
        where b.user_id in (select m.user_id from public.household_members m where m.household_id = v_inv.household_id)
    ) theirs on theirs.i = mine.i and mine.i <> ''
  ) then
    raise exception 'iban_conflict' using errcode = 'P0001';
  end if;
  if v_cur is null then
    insert into public.household_members (household_id, user_id, role) values (v_inv.household_id, p_user, v_inv.role);
  end if;

  update public.household_invites set used_at = now(), used_by = p_user where id = v_inv.id;
  perform public.fn_merge_user_categories_into_household(p_user, v_inv.household_id);
  return v_inv.household_id;
end;
$$;

-- 5. Mitglied entfernen ---------------------------------------------------------------------------------------------------
create or replace function public.fn_remove_household_member(p_household uuid, p_user uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := current_setting('app.audit_skip', true);
  v_copied int := 0;
begin
  if p_user = p_actor then raise exception 'remove_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.household_members m
                 where m.household_id = p_household and m.user_id = p_actor and m.role = 'owner') then
    raise exception 'remove_not_owner' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.household_members m
                 where m.household_id = p_household and m.user_id = p_user and m.role = 'member') then
    raise exception 'remove_not_member' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('merge:' || p_household::text));
  perform set_config('app.audit_skip', '1', true);

  -- Private Kopie des Haushaltsbaums fuer das Mitglied.
  drop table if exists pg_temp.cat_split_map;
  create temp table cat_split_map on commit drop as
  select c.id as old_id, gen_random_uuid() as new_id
  from public.categories c where c.household_id = p_household;

  insert into public.categories (id, user_id, name, parent_id, type, icon, color, budget_monthly, sort_order,
                                 tax_role, euer_zeile, business_share, household_id)
  select m.new_id, p_user, c.name, pm.new_id, c.type, c.icon, c.color, c.budget_monthly, c.sort_order,
         c.tax_role, c.euer_zeile, c.business_share, null
  from pg_temp.cat_split_map m
  join public.categories c on c.id = m.old_id
  left join pg_temp.cat_split_map pm on pm.old_id = c.parent_id;
  get diagnostics v_copied = row_count;

  insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
  select m.new_id, p_user, o.tax_role, o.euer_zeile, o.business_share
  from pg_temp.cat_split_map m
  join public.category_tax_overrides o on o.category_id = m.old_id and o.user_id = p_user
  on conflict (category_id, user_id) do nothing;

  update public.transactions t set category_id = m.new_id
    from pg_temp.cat_split_map m where t.user_id = p_user and t.category_id = m.old_id;
  update public.bank_transactions t set category_id = m.new_id
    from pg_temp.cat_split_map m where t.user_id = p_user and t.category_id = m.old_id;
  update public.bank_transactions t set ai_category_id = m.new_id
    from pg_temp.cat_split_map m where t.user_id = p_user and t.ai_category_id = m.old_id;
  update public.contracts t set category_id = m.new_id
    from pg_temp.cat_split_map m where t.user_id = p_user and t.category_id = m.old_id;

  -- Overrides des Mitglieds auf den Originalen entfallen, die Originale (auch die vom Mitglied angelegten) gehen an den Owner.
  delete from public.category_tax_overrides o
    using pg_temp.cat_split_map m where o.category_id = m.old_id and o.user_id = p_user;
  update public.categories c set user_id = p_actor
    from pg_temp.cat_split_map m where c.id = m.old_id and c.user_id = p_user;

  -- Geteilte Objekte des Mitglieds wieder privat.
  update public.accounts           set shared = false where user_id = p_user and shared;
  update public.contracts          set shared = false where user_id = p_user and shared;
  update public.debts              set shared = false where user_id = p_user and shared;
  update public.savings_goals      set shared = false where user_id = p_user and shared;
  update public.valuables          set shared = false where user_id = p_user and shared;
  update public.assets             set shared = false where user_id = p_user and shared;
  update public.depots             set shared = false where user_id = p_user and shared;
  update public.depot_holdings     set shared = false where user_id = p_user and shared;
  update public.depot_transactions set shared = false where user_id = p_user and shared;
  update public.savings_plans      set shared = false where user_id = p_user and shared;
  update public.budget_categories  set shared = false where user_id = p_user and shared;
  update public.budget_items       set shared = false where user_id = p_user and shared;

  delete from public.household_members where household_id = p_household and user_id = p_user;
  -- Der Trigger categories_set_household hat die Kopien beim Einfuegen dem Haushalt zugeordnet (Nutzer war noch Mitglied):
  -- jetzt privat machen, sonst waeren sie fuer das Mitglied unsichtbar.
  update public.categories c set household_id = null
    from pg_temp.cat_split_map m where c.id = m.new_id;

  perform set_config('app.audit_skip', coalesce(v_prev, ''), true);
  return jsonb_build_object('categories_copied', v_copied);
end;
$$;

revoke all on function public.fn_merge_user_categories_into_household(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fn_accept_household_invite(text, uuid, text)         from public, anon, authenticated;
revoke all on function public.fn_remove_household_member(uuid, uuid, uuid)         from public, anon, authenticated;
grant execute on function public.fn_merge_user_categories_into_household(uuid, uuid) to service_role;
grant execute on function public.fn_accept_household_invite(text, uuid, text)         to service_role;
grant execute on function public.fn_remove_household_member(uuid, uuid, uuid)         to service_role;

-- 6. IBAN-Dubletten ---------------------------------------------------------------------------------------------------------
create or replace function public.trg_accounts_iban_peer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.bank_iban is null then return new; end if;
  if tg_op = 'UPDATE' and new.bank_iban is not distinct from old.bank_iban then return new; end if;
  if exists (
    select 1 from public.accounts a
    where a.user_id in (select public.fn_household_peer_users(new.user_id))
      and a.id <> new.id and a.bank_iban is not null
      and public.fn_norm_iban(a.bank_iban) = public.fn_norm_iban(new.bank_iban)
  ) then
    raise exception 'Diese IBAN ist im Haushalt bereits bei einem anderen Mitglied verknuepft. Dort wird das Konto synchronisiert; es kann dort als "Geteiltes Konto" markiert werden.'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_accounts_iban_peer on public.accounts;
create trigger trg_accounts_iban_peer
  before insert or update of bank_iban on public.accounts
  for each row execute function public.trg_accounts_iban_peer();

create or replace function public.trg_bank_balance_peer_skip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Eigene IBAN (Upsert bestehender Zeile, Konto vorhanden): immer durchlassen, auch wenn ein Peer sie ebenfalls hat.
  if exists (select 1 from public.bank_balance b where b.user_id = new.user_id
             and public.fn_norm_iban(b.account_iban) = public.fn_norm_iban(new.account_iban))
     or exists (select 1 from public.accounts a where a.user_id = new.user_id and a.bank_iban is not null
                and public.fn_norm_iban(a.bank_iban) = public.fn_norm_iban(new.account_iban)) then
    return new;
  end if;
  if public.fn_iban_peer_owned(new.user_id, new.account_iban) then return null; end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_balance_peer_skip on public.bank_balance;
create trigger trg_bank_balance_peer_skip
  before insert on public.bank_balance
  for each row execute function public.trg_bank_balance_peer_skip();

create or replace function public.trg_bank_transactions_peer_skip()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Nutzer ohne Haushaltspeers: sofort durch (kein weiterer Zugriff).
  if not exists (select 1 from public.fn_household_peer_users(new.user_id)) then return new; end if;
  -- Eigene IBAN (eigenes Konto) oder eigene Zeile mit gleicher IBAN+external_id (Upsert): durchlassen.
  if exists (select 1 from public.accounts a where a.user_id = new.user_id and a.bank_iban is not null
             and public.fn_norm_iban(a.bank_iban) = public.fn_norm_iban(new.account_iban))
     or (new.external_id is not null and exists (
           select 1 from public.bank_transactions o where o.user_id = new.user_id and o.external_id = new.external_id
             and public.fn_norm_iban(o.account_iban) = public.fn_norm_iban(new.account_iban))) then
    return new;
  end if;
  if public.fn_iban_peer_owned(new.user_id, new.account_iban) then return null; end if;
  if new.external_id is not null and exists (
    select 1 from public.bank_transactions b
    where b.user_id in (select public.fn_household_peer_users(new.user_id))
      and b.external_id = new.external_id
      and public.fn_norm_iban(b.account_iban) = public.fn_norm_iban(new.account_iban)
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_transactions_peer_skip on public.bank_transactions;
create trigger trg_bank_transactions_peer_skip
  before insert on public.bank_transactions
  for each row execute function public.trg_bank_transactions_peer_skip();

create or replace function public.fn_ensure_linked_account(p_user_id uuid, p_iban text, p_account_name text, p_booked_balance numeric, p_currency text)
 returns uuid
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_account_id uuid;
  v_norm_iban  text := upper(replace(p_iban, ' ', ''));
  v_inst       text;
begin
  select id into v_account_id from accounts
    where user_id = p_user_id and bank_iban = p_iban;

  if v_account_id is null then
    -- Besitzt ein Haushaltsmitglied die IBAN, synchronisiert dieses das Konto: hier nichts anlegen.
    if public.fn_iban_peer_owned(p_user_id, p_iban) then
      return null;
    end if;

    -- Match an existing manual account whose free-text iban (Girokonto's full IBAN, or
    -- Geschäftsanteile's bare Genossenschaftsanteil-Nummer) is a substring of the synced IBAN.
    select id into v_account_id from accounts
      where user_id = p_user_id
        and bank_iban is null
        and iban is not null
        and length(regexp_replace(iban, '\s', '', 'g')) > 0
        and v_norm_iban ilike '%' || upper(regexp_replace(iban, '\s', '', 'g')) || '%'
      order by created_at
      limit 1;

    if v_account_id is not null then
      update accounts set bank_iban = p_iban, updated_at = now() where id = v_account_id;
    else
      -- Bank: bank_label der Saldozeile, sonst Label der EINEN Bankverbindung, sonst neutral.
      select nullif(btrim(bb.bank_label), '') into v_inst
        from bank_balance bb where bb.user_id = p_user_id and bb.account_iban = p_iban;
      if v_inst is null and to_regclass('public.bank_connections') is not null then
        execute 'select case when count(*) = 1 then min(label) end from public.bank_connections where user_id = $1'
          into v_inst using p_user_id;
      end if;

      insert into accounts (user_id, name, type, iban, bank_iban, institution, currency, is_active)
      values (
        p_user_id,
        coalesce(p_account_name, 'Konto …' || right(p_iban, 4)),
        'checking',
        p_iban,
        p_iban,
        coalesce(nullif(btrim(v_inst), ''), 'Bank'),
        coalesce(p_currency, 'EUR'),
        true
      )
      returning id into v_account_id;
    end if;
  end if;

  -- Keep account_balances current so fn_take_snapshot's net-worth totals pick up synced
  -- accounts automatically, without any change to that function.
  -- account_balances.source is constrained to ('cron','manual','backfill') — this counts as
  -- an automated/cron-style write, not a hand-entered one.
  insert into account_balances (account_id, snapshot_date, balance, currency, source)
  values (v_account_id, current_date, p_booked_balance, coalesce(p_currency, 'EUR'), 'cron')
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance, source = excluded.source;

  return v_account_id;
end;
$function$;

-- Nur Trigger (fn_link_bank_account) rufen die Funktion auf, nie per RPC: anon (und PUBLIC) braucht kein EXECUTE.
revoke all on function public.fn_ensure_linked_account(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.fn_ensure_linked_account(uuid, text, text, numeric, text) to authenticated, service_role;
