-- PERFORMANCE: Auswertungs-Views schneller (Abschnitte 1-4 und 7 sind live angewendet; 5-6 siehe supabase/data/optional_perf_balance_series_net_worth_series.sql), Ergebnisse BYTE-IDENTISCH. Zwei Policy-Zusammenfuehrungen
-- (Advisor "multiple permissive policies"), Zugriffe unveraendert.
--
-- Befund (EXPLAIN ANALYZE als authenticated, 730 Buchungen, 6 Konten, Eric und Mitglied; siehe supabase/tests/perf_views.sql):
--   1. Jede Abfrage ueber unified_transactions plant + rechnet fix ca. 8-12 ms, unabhaengig von Filtern:
--        * category_tree (rekursiv + fn_category_tax_effective, ca. 5 ms) wird als ct-CTE materialisiert, obwohl ct nur Struktur
--          (root/path) braucht; fn_category_tax_effective laeuft damit ZWEIMAL (ct und tx).
--        * categories wird 6x gescannt (c, pc, 4x im Baum), jedes Mal mit eigener RLS-Auswertung (household_peer_ids() ist
--          SECURITY DEFINER, ca. 0,3-0,4 ms je Aufruf, nicht inlinebar).
--   2. Je Bankbuchung zwei LATERAL-Unterabfragen (Konto, Gegenkonto) mit EXISTS ueber household_members. Der Plan zeigt, dass sie
--      nur 1,4 bzw. 1,8 ms kosten (Memoize), sind aber der Grund fuer die Nested-Loop-Plaene; als Hash-Join auf eine kleine,
--      einmal berechnete Zuordnung (user, IBAN) -> Konto sind sie ohne Pro-Zeile-Arbeit und planen schneller.
--   3. fn_clean_bank_description (SET search_path => nicht inlinebar) kostet 13 ms fuer 727 Zeilen, davon 5 ms nur Funktionsaufruf-
--      Overhead. Der Ausdruck steht jetzt direkt in der View (identisch; Test prueft Gleichheit gegen die Funktion fuer alle Zeilen).
--   4. monthly_umbuchungen und account_balance_sums_unified lesen unified_transactions je ZWEIMAL (zwei UNION-Zweige) = doppelte
--      Fixkosten; jetzt ein Scan + LATERAL VALUES.
--   5. balance_series: zwei WindowAgg ueber 18354 Zeilen mit Index-Scan + RLS-Filter (45 ms); jetzt ein Window-Durchlauf (35 ms).
--   6. net_worth_series: fn_fund_price_eur wurde je (Tag x Depot-Transaktion) aufgerufen (ca. 750 Aufrufe a 0,3 ms), jetzt je (Tag, ISIN)
--      und inline (56 -> 38 ms).
--   Gemessen (beste von 3, Eric/Mitglied, Zeilen als Text): unified_transactions 33-37 -> 19 ms, mit Kontofilter 12-14 -> 5,4 ms, mit
--   Datumsfilter 18-21 -> 9,9 ms, monthly_flows 34-38 -> 17 ms, monthly_umbuchungen 21-23 -> 7,5 ms, account_balance_sums_unified
--   34-35 -> 17,7 ms, category_tree 4,6 -> 2,7 ms. Alle Hashes identisch (supabase/tests/perf_views.sql).
--   Indizes: der Plan braucht KEINE neuen. Alle genannten (accounts.user_id/bank_iban, bank_transactions user/iban/external,
--   household_members.user_id, categories.parent_id, category_tax_overrides, account_balances, depot_transactions, audit_log)
--   existieren bereits; bei 727 Zeilen waehlt der Planer ohnehin Seq-Scans. Siehe Bericht.
--
-- Unveraendert: Spaltenreihenfolge, Typen, security_invoker, Grants (CREATE OR REPLACE, security_invoker wird nachgezogen).
-- Rollback: supabase/rollbacks/20261101100000_perf_indexes_views.down.sql   Test: supabase/tests/perf_views.sql

-- 1. category_tree: RLS auf categories einmal (materialisierte cat), Steuerwerte einmal ------------------------------------
create or replace view public.category_tree as
with recursive cat as materialized (
  select c.id, c.user_id, c.name, c.parent_id, c.type from public.categories c
),
tree as (
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         c.id as root_id, c.name as root_name, 0 as depth, c.name as path,
         array[c.id] as seen
  from cat c
  where c.parent_id is null
     or not exists (select 1 from cat p where p.id = c.parent_id)
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         t.root_id, t.root_name, t.depth + 1, t.path || ' > ' || c.name,
         t.seen || c.id
  from cat c
  join tree t on c.parent_id = t.id
  where not (c.id = any (t.seen))
),
base as (
  select tree.id, tree.user_id, tree.name, tree.parent_id, tree.type, tree.root_id, tree.root_name, tree.depth, tree.path
  from tree
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type, c.id, c.name, 0, c.name
  from cat c
  where not exists (select 1 from tree t where t.id = c.id)
)
select b.id, b.user_id, b.name, b.parent_id, b.type, b.root_id, b.root_name, b.depth, b.path,
       e.tax_role_effective, e.euer_zeile_effective
from base b
left join public.fn_category_tax_effective() e
  on e.category_id = b.id and e.user_id = (select auth.uid());

alter view public.category_tree set (security_invoker = on);

-- 2. unified_transactions ----------------------------------------------------------------------------------------------------
--   cat   : categories einmal (RLS einmal)
--   tree  : Struktur (Wurzel, Pfad) wie category_tree, OHNE Steuerwerte
--   ci    : je Kategorie eine Zeile: Name/Farbe/Typ, Elternname, Wurzel, Pfad und die namensbasierte Art (forderung/anlage/echt)
--   tx    : effektive Steuerwerte je (Kategorie, Besitzer), einmal
--   accs  : accounts einmal (RLS einmal)
--   acc_map: (Buchungsbesitzer u, IBAN) -> ein Konto: das Konto des Besitzers zuerst, sonst eines aus seinem Haushalt
--            (created_at, id); ersetzt LATERAL ... EXISTS ... LIMIT 1 je Bankbuchung (gleiche Auswahlregel, Inner-/Left-Join wie vorher)
create or replace view public.unified_transactions as
with recursive cat as materialized (
  select c.id, c.name, c.color, c.type, c.parent_id from public.categories c
),
tree as (
  select c.id, c.id as root_id, c.name as root_name, c.name as path, array[c.id] as seen
  from cat c
  where c.parent_id is null
     or not exists (select 1 from cat p where p.id = c.parent_id)
  union all
  select c.id, t.root_id, t.root_name, t.path || ' > ' || c.name, t.seen || c.id
  from cat c
  join tree t on c.parent_id = t.id
  where not (c.id = any (t.seen))
),
ci as materialized (
  select c.id, c.name, c.color, c.type, p.name as parent_name,
         coalesce(t.root_id, c.id) as root_id, coalesce(t.root_name, c.name) as root_name, coalesce(t.path, c.name) as path,
         case
           when c.type = 'neutral' and coalesce(p.name, c.name) = 'Schulden' then 'forderung'
           when c.type = 'neutral' and coalesce(p.name, c.name) <> 'Transfers' then 'anlage'
           else 'echt'
         end as kind
  from cat c
  left join cat p on p.id = c.parent_id
  left join tree t on t.id = c.id
),
tx as materialized (
  select category_id, user_id, tax_role_effective, euer_zeile_effective from public.fn_category_tax_effective()
),
accs as materialized (
  select a.id, a.user_id, a.name, a.color, a.bank_iban, a.created_at from public.accounts a
),
acc_map as materialized (
  select distinct on (x.u, x.bank_iban) x.u, x.bank_iban, x.id, x.name, x.color
  from (
    select a0.user_id as u, a0.user_id as owner_id, a0.id, a0.name, a0.color, a0.bank_iban, a0.created_at
    from accs a0
    where a0.bank_iban is not null
    union all
    select m2.user_id, a0.user_id, a0.id, a0.name, a0.color, a0.bank_iban, a0.created_at
    from accs a0
    join public.household_members m1 on m1.user_id = a0.user_id
    join public.household_members m2 on m2.household_id = m1.household_id and m2.user_id <> a0.user_id
    where a0.bank_iban is not null
  ) x
  order by x.u, x.bank_iban, (x.owner_id = x.u) desc, x.created_at, x.id
)
select
  id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type,
  amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type,
  signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name,
  category_path, tax_role_effective, euer_zeile_effective,
  flow_kind = any (array['echt', 'anlage', 'forderung']) as counts_in_flow,
  category_source, ai_category_id, counterpart_account_id, flow_kind_extern
from (
  select
    t.id, t.user_id, t.account_id, a.name as account_name, a.color as account_color,
    t.category_id, ci.name as category_name, ci.color as category_color,
    t.date, t.type, t.amount, t.amount_base, t.fx_rate, t.currency, t.description, t.merchant,
    t.transfer_to, t.contract_id, t.tags,
    'manual'::text as source,
    ci.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer' then 'umbuchung'
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      else coalesce(ci.kind, 'echt')
    end as flow_kind,
    abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) as amount_eur,
    ci.root_id as root_category_id,
    ci.root_name as root_category_name,
    ci.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id,
    case when t.type = 'transfer' then t.transfer_to else null::uuid end as counterpart_account_id,
    case
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      else coalesce(ci.kind, 'echt')
    end as flow_kind_extern
  from public.transactions t
  left join accs a on a.id = t.account_id
  left join ci on ci.id = t.category_id
  left join tx on tx.category_id = t.category_id and tx.user_id = t.user_id
  union all
  select
    bt.id, bt.user_id, a.id as account_id, a.name as account_name, a.color as account_color,
    bt.category_id, ci.name as category_name, ci.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null and coalesce(ci.type, 'neutral') = 'neutral' then 'transfer'
      when bt.amount >= 0 then 'income'
      else 'expense'
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric as fx_rate,
    bt.currency,
    -- identisch zu public.fn_clean_bank_description(coalesce(description, raw_description), counterpart_name), aber ohne
    -- Funktionsaufruf (SET search_path verhindert Inlining; 5 ms Overhead je 727 Zeilen). Test: perf_views.sql, Abschnitt D.
    coalesce(
      nullif(btrim(regexp_replace(coalesce(coalesce(bt.description, bt.raw_description), ''),
        '\s*(SecureGo [Pp]lus|EREF:|MREF:|CRED:|SVWZ:|ABWA:|ABWE:|IBAN:|BIC:).*$', '')), ''),
      nullif(btrim(coalesce(bt.counterpart_name, '')), ''),
      nullif(btrim(coalesce(coalesce(bt.description, bt.raw_description), '')), '')
    ) as description,
    bt.counterpart_name as merchant,
    case when coalesce(ci.type, 'neutral') = 'neutral' then own.id else null::uuid end as transfer_to,
    null::uuid as contract_id,
    '{}'::text[] as tags,
    'bank_sync'::text as source,
    ci.type as category_type,
    bt.amount as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null and coalesce(ci.type, 'neutral') = 'neutral' then 'umbuchung'
      else coalesce(ci.kind, 'echt')
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ci.root_id as root_category_id,
    ci.root_name as root_category_name,
    ci.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id,
    own.id as counterpart_account_id,
    coalesce(ci.kind, 'echt') as flow_kind_extern
  from public.bank_transactions bt
  join acc_map a on a.u = bt.user_id and a.bank_iban = bt.account_iban
  left join acc_map own on own.u = bt.user_id and own.bank_iban = bt.counterpart_iban
  left join ci on ci.id = bt.category_id
  left join tx on tx.category_id = bt.category_id and tx.user_id = bt.user_id
) u;

alter view public.unified_transactions set (security_invoker = on);
revoke all on public.category_tree, public.unified_transactions from anon;
grant select on public.category_tree, public.unified_transactions to authenticated;
grant all on public.category_tree, public.unified_transactions to service_role;

-- 3. monthly_umbuchungen: ein Scan von unified_transactions statt zwei ----------------------------------------------------------
create or replace view public.monthly_umbuchungen as
select
  user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
  category_id, category_name, root_category_id, root_category_name, tax_role_effective,
  coalesce(sum(inc), 0) as income,
  coalesce(sum(exp), 0) as expense,
  count(*)::integer as tx_count
from (
  select u.user_id, date_trunc('month', u.date::timestamp with time zone)::date as month,
         x.account_id, x.counterpart_account_id, u.source, u.flow_kind_extern,
         u.category_id, u.category_name, u.root_category_id, u.root_category_name, u.tax_role_effective,
         x.inc, x.exp
  from public.unified_transactions u
  cross join lateral (values
    (u.account_id, u.counterpart_account_id,
     case when u.signed_amount > 0 then u.amount_eur else 0::numeric end,
     case when u.signed_amount < 0 then u.amount_eur else 0::numeric end,
     u.account_id is not null),
    (u.counterpart_account_id, u.account_id, u.amount_eur, 0::numeric,
     u.source = 'manual' and u.counterpart_account_id is not null)
  ) as x(account_id, counterpart_account_id, inc, exp, ok)
  where u.flow_kind = 'umbuchung' and x.ok
) y
group by user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
         category_id, category_name, root_category_id, root_category_name, tax_role_effective;

alter view public.monthly_umbuchungen set (security_invoker = on);
revoke all on public.monthly_umbuchungen from anon, authenticated, service_role;
grant select on public.monthly_umbuchungen to authenticated, service_role;

-- 4. account_balance_sums_unified: ein Scan statt zwei --------------------------------------------------------------------------
create or replace view public.account_balance_sums_unified as
select user_id, account_id, sum(delta) as balance, (count(*) filter (where eigen))::integer as tx_count
from (
  select u.user_id, x.account_id, x.eigen, x.delta
  from public.unified_transactions u
  cross join lateral (values
    (u.account_id, true,
     case u.type
       when 'income'::text   then u.amount
       when 'expense'::text  then - u.amount
       when 'transfer'::text then u.signed_amount
       else 0::numeric
     end),
    (case when u.source = 'manual' and u.type = 'transfer' then u.transfer_to end, false, u.amount)
  ) as x(account_id, eigen, delta)
  where x.account_id is not null
) m
group by user_id, account_id;

alter view public.account_balance_sums_unified set (security_invoker = on);

-- 7. Policies zusammenfuehren (Advisor "multiple permissive policies"), Zugriffe unveraendert -----------------------------------
-- portfolio_snapshots: bisher own_data (ALL, public: auth.uid() = user_id) + household_portfolio_snapshots_select (SELECT,
--   authenticated: Asset gehoert einem Peer). Jetzt EINE SELECT-Policy (eigene ODER Peer-Asset) und je eine eigene Policy fuer
--   INSERT/UPDATE/DELETE mit der alten Bedingung (ALL ohne with check => with check = using).
drop policy if exists household_portfolio_snapshots_select on public.portfolio_snapshots;
drop policy if exists own_data on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_select on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_insert on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_update on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_delete on public.portfolio_snapshots;
create policy portfolio_snapshots_select on public.portfolio_snapshots
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or asset_id in (select a.id from public.assets a where a.user_id in (select public.household_peer_ids()))
  );
create policy portfolio_snapshots_own_insert on public.portfolio_snapshots
  for insert to public with check ((select auth.uid()) = user_id);
create policy portfolio_snapshots_own_update on public.portfolio_snapshots
  for update to public using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy portfolio_snapshots_own_delete on public.portfolio_snapshots
  for delete to public using ((select auth.uid()) = user_id);

-- user_profiles: own_profile (ALL, public: auth.uid() = id) + household_user_profiles_select (SELECT, authenticated: id in Peers).
--   household_peer_ids() enthaelt die eigene Id (solange auth.uid() nicht null), die Peer-Policy deckt "eigene Zeile" also ab.
drop policy if exists household_user_profiles_select on public.user_profiles;
drop policy if exists own_profile on public.user_profiles;
drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_own_insert on public.user_profiles;
drop policy if exists user_profiles_own_update on public.user_profiles;
drop policy if exists user_profiles_own_delete on public.user_profiles;
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (id in (select public.household_peer_ids()));
create policy user_profiles_own_insert on public.user_profiles
  for insert to public with check ((select auth.uid()) = id);
create policy user_profiles_own_update on public.user_profiles
  for update to public using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_profiles_own_delete on public.user_profiles
  for delete to public using ((select auth.uid()) = id);
