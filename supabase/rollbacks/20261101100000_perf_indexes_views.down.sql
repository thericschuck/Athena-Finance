-- Rollback von 20261101100000_perf_indexes_views.sql: stellt die vorherigen Definitionen wieder her (category_tree,
-- unified_transactions, monthly_umbuchungen, account_balance_sums_unified, balance_series, net_worth_series, Policies).
-- Die Definitionen sind woertlich die der Migrationen 20261030110000 (category_tree, unified_transactions), 20261029100000
-- (monthly_umbuchungen), 20261029110000 (net_worth_series) bzw. der Live-Stand vom 2026-10-27 (account_balance_sums_unified,
-- balance_series, Policies). Test: supabase/tests/perf_views.sql belegt per md5(pg_get_viewdef/functiondef/pg_policies) Gleichheit.

-- category_tree (Stand 20261030110000)
create or replace view public.category_tree as
with recursive tree as (
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         c.id as root_id, c.name as root_name, 0 as depth, c.name as path,
         array[c.id] as seen
  from public.categories c
  where c.parent_id is null
     or not exists (select 1 from public.categories p where p.id = c.parent_id)
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         t.root_id, t.root_name, t.depth + 1, t.path || ' > ' || c.name,
         t.seen || c.id
  from public.categories c
  join tree t on c.parent_id = t.id
  where not (c.id = any (t.seen))
),
base as (
  select tree.id, tree.user_id, tree.name, tree.parent_id, tree.type, tree.root_id, tree.root_name, tree.depth, tree.path
  from tree
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type, c.id, c.name, 0, c.name
  from public.categories c
  where not exists (select 1 from tree t where t.id = c.id)
)
select b.id, b.user_id, b.name, b.parent_id, b.type, b.root_id, b.root_name, b.depth, b.path,
       e.tax_role_effective, e.euer_zeile_effective
from base b
left join public.fn_category_tax_effective() e
  on e.category_id = b.id and e.user_id = (select auth.uid());

alter view public.category_tree set (security_invoker = on);

-- unified_transactions (Stand 20261030110000)
create or replace view public.unified_transactions as
with ct as materialized (
  select id, root_id, root_name, path from public.category_tree
),
tx as materialized (
  select category_id, user_id, tax_role_effective, euer_zeile_effective from public.fn_category_tax_effective()
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
    t.category_id, c.name as category_name, c.color as category_color,
    t.date, t.type, t.amount, t.amount_base, t.fx_rate, t.currency, t.description, t.merchant,
    t.transfer_to, t.contract_id, t.tags,
    'manual'::text as source,
    c.type as category_type,
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
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id,
    case when t.type = 'transfer' then t.transfer_to else null::uuid end as counterpart_account_id,
    case
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.transactions t
  left join public.accounts a on a.id = t.account_id
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join ct on ct.id = t.category_id
  left join tx on tx.category_id = t.category_id and tx.user_id = t.user_id
  union all
  select
    bt.id, bt.user_id, a.id as account_id, a.name as account_name, a.color as account_color,
    bt.category_id, c.name as category_name, c.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'transfer'
      when bt.amount >= 0 then 'income'
      else 'expense'
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric as fx_rate,
    bt.currency,
    public.fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name) as description,
    bt.counterpart_name as merchant,
    case when coalesce(c.type, 'neutral') = 'neutral' then own.id else null::uuid end as transfer_to,
    null::uuid as contract_id,
    '{}'::text[] as tags,
    'bank_sync'::text as source,
    c.type as category_type,
    bt.amount as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id,
    own.id as counterpart_account_id,
    case
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.bank_transactions bt
  join lateral (
    select a0.id, a0.name, a0.color
    from public.accounts a0
    where a0.bank_iban = bt.account_iban
      and (a0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = a0.user_id))
    order by (a0.user_id = bt.user_id) desc, a0.created_at, a0.id
    limit 1
  ) a on true
  left join public.categories c on c.id = bt.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join lateral (
    select o0.id
    from public.accounts o0
    where o0.bank_iban = bt.counterpart_iban
      and (o0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = o0.user_id))
    order by (o0.user_id = bt.user_id) desc, o0.created_at, o0.id
    limit 1
  ) own on true
  left join ct on ct.id = bt.category_id
  left join tx on tx.category_id = bt.category_id and tx.user_id = bt.user_id
) u;

alter view public.unified_transactions set (security_invoker = on);
revoke all on public.category_tree, public.unified_transactions from anon;
grant select on public.category_tree, public.unified_transactions to authenticated;
grant all on public.category_tree, public.unified_transactions to service_role;

-- monthly_umbuchungen (Stand 20261029100000)
create or replace view public.monthly_umbuchungen as
select
  user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
  category_id, category_name, root_category_id, root_category_name, tax_role_effective,
  coalesce(sum(inc), 0) as income,
  coalesce(sum(exp), 0) as expense,
  count(*)::integer as tx_count
from (
  select u.user_id, date_trunc('month', u.date::timestamp with time zone)::date as month,
         u.account_id, u.counterpart_account_id, u.source, u.flow_kind_extern,
         u.category_id, u.category_name, u.root_category_id, u.root_category_name, u.tax_role_effective,
         case when u.signed_amount > 0 then u.amount_eur else 0::numeric end as inc,
         case when u.signed_amount < 0 then u.amount_eur else 0::numeric end as exp
  from public.unified_transactions u
  where u.flow_kind = 'umbuchung' and u.account_id is not null
  union all
  select u.user_id, date_trunc('month', u.date::timestamp with time zone)::date,
         u.counterpart_account_id, u.account_id, u.source, u.flow_kind_extern,
         u.category_id, u.category_name, u.root_category_id, u.root_category_name, u.tax_role_effective,
         u.amount_eur, 0::numeric
  from public.unified_transactions u
  where u.flow_kind = 'umbuchung' and u.source = 'manual' and u.counterpart_account_id is not null
) x
group by user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
         category_id, category_name, root_category_id, root_category_name, tax_role_effective;

alter view public.monthly_umbuchungen set (security_invoker = on);
revoke all on public.monthly_umbuchungen from anon, authenticated, service_role;
grant select on public.monthly_umbuchungen to authenticated, service_role;

-- account_balance_sums_unified (Live-Stand)
create or replace view public.account_balance_sums_unified as
select user_id, account_id, sum(delta) as balance, (count(*) filter (where eigen))::integer as tx_count
from (
  select u.user_id, u.account_id, true as eigen,
    case u.type
      when 'income'::text then u.amount
      when 'expense'::text then - u.amount
      when 'transfer'::text then u.signed_amount
      else 0::numeric
    end as delta
  from public.unified_transactions u
  where u.account_id is not null
  union all
  select u.user_id, u.transfer_to, false, u.amount
  from public.unified_transactions u
  where u.source = 'manual'::text and u.type = 'transfer'::text and u.transfer_to is not null
) m
group by user_id, account_id;

alter view public.account_balance_sums_unified set (security_invoker = on);

-- balance_series (Live-Stand)
create or replace function public.balance_series(p_account_id uuid default null::uuid, p_from date default null::date)
 returns table(account_id uuid, von date, bis date, balance numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with s as (
    select b.account_id, b.snapshot_date as d, b.balance,
           lag(b.snapshot_date) over w as vor_d,
           lag(b.balance) over w as vor_b
    from public.account_balances b
    where (p_account_id is null or b.account_id = p_account_id)
      and (p_from is null or b.snapshot_date >= p_from)
    window w as (partition by b.account_id order by b.snapshot_date)
  ),
  marked as (
    select s.account_id, s.d, s.balance,
           sum(case when s.vor_d is null or s.d - s.vor_d <> 1 or s.balance is distinct from s.vor_b then 1 else 0 end)
             over (partition by s.account_id order by s.d) as lauf
    from s
  )
  select m.account_id, min(m.d) as von, max(m.d) as bis, m.balance
  from marked m
  group by m.account_id, m.lauf, m.balance
  order by m.account_id, min(m.d)
$function$;

-- net_worth_series (Stand 20261029110000)
create or replace function public.net_worth_series(
  p_account_ids uuid[],
  p_owner_ids uuid[],
  p_include_shared boolean default false,
  p_from date default null
)
returns table (
  snapshot_date date,
  total_checking numeric,
  total_investment numeric,
  total_savings numeric,
  total_cash numeric,
  total_bausparer numeric,
  total_business numeric,
  total_debts numeric,
  total_depot numeric,
  total_crypto numeric,
  total_assets numeric,
  net_worth numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  acc as (
    select ab.snapshot_date as d,
      round(coalesce(sum(case when a.type = 'checking'         then ab.balance end), 0), 2) as chk,
      round(coalesce(sum(case when a.type = 'investment'       then ab.balance end), 0), 2) as inv,
      round(coalesce(sum(case when a.type = 'savings'          then ab.balance end), 0), 2) as sav,
      round(coalesce(sum(case when a.type in ('cash','other')  then ab.balance end), 0), 2) as csh,
      round(coalesce(sum(case when a.type = 'building_savings' then ab.balance end), 0), 2) as bsp,
      round(coalesce(sum(case when a.type = 'credit'           then abs(ab.balance) end), 0), 2) as dbt,
      round(coalesce(sum(case when a.type = 'crypto'           then ab.balance end), 0), 2) as cry
    from public.account_balances ab
    join public.accounts a on a.id = ab.account_id
    where a.id = any (coalesce(p_account_ids, '{}'::uuid[]))
      and a.is_active
      and (p_from is null or ab.snapshot_date >= p_from)
    group by ab.snapshot_date
  ),
  pos as (
    select ps.snapshot_date as d,
      round(coalesce(sum(case when a.type = 'stock' then ps.quantity * ps.price_eur end), 0), 2) as stk,
      round(coalesce(sum(case when a.type in ('crypto','stable','fiat') then ps.quantity * ps.price_eur end), 0), 2) as cry
    from public.portfolio_snapshots ps
    join public.assets a on a.id = ps.asset_id
    where (a.user_id = any (coalesce(p_owner_ids, '{}'::uuid[])) or (coalesce(p_include_shared, false) and a.shared))
      and (p_from is null or ps.snapshot_date >= p_from)
    group by ps.snapshot_date
  ),
  dates as (
    -- Vor dem ersten Positions-Snapshot waeren Krypto/Aktien 0 (portfolio_snapshots beginnt spaeter als account_balances):
    -- solche Tage werden weggelassen, statt ein zu niedriges Vermoegen zu zeigen.
    select d from (select d from acc union select d from pos) u
    where d >= coalesce((select min(pos.d) from pos), d)
  ),
  fonds as (
    select dts.d,
      round(coalesce(sum(dt.shares * public.fn_fund_price_eur(dt.isin, dts.d)), 0), 2) as fnd
    from dates dts
    left join public.depot_transactions dt
      on dt.transaction_date <= dts.d
     and (dt.user_id = any (coalesce(p_owner_ids, '{}'::uuid[])) or (coalesce(p_include_shared, false) and dt.shared))
    group by dts.d
  ),
  teile as (
    select dts.d,
      coalesce(acc.chk, 0) as chk, coalesce(acc.inv, 0) as inv, coalesce(acc.sav, 0) as sav,
      coalesce(acc.csh, 0) as csh, coalesce(acc.bsp, 0) as bsp, coalesce(acc.dbt, 0) as dbt,
      coalesce(pos.stk, 0) + coalesce(f.fnd, 0) as dep,
      coalesce(pos.cry, 0) + coalesce(acc.cry, 0) as cry
    from dates dts
    left join acc on acc.d = dts.d
    left join pos on pos.d = dts.d
    left join fonds f on f.d = dts.d
  )
  select t.d, t.chk, t.inv, t.sav, t.csh, t.bsp, 0::numeric, t.dbt, t.dep, t.cry,
    round(t.chk + t.inv + t.sav + t.csh + t.bsp + t.dep + t.cry, 2),
    round(t.chk + t.inv + t.sav + t.csh + t.bsp + t.dep + t.cry - t.dbt, 2)
  from teile t
  order by t.d
$$;

-- Policies (Live-Stand)
drop policy if exists portfolio_snapshots_select on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_insert on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_update on public.portfolio_snapshots;
drop policy if exists portfolio_snapshots_own_delete on public.portfolio_snapshots;
create policy household_portfolio_snapshots_select on public.portfolio_snapshots
  for select to authenticated
  using (asset_id in (select a.id from public.assets a where a.user_id in (select public.household_peer_ids())));
create policy own_data on public.portfolio_snapshots
  for all to public using ((select auth.uid()) = user_id);

drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_own_insert on public.user_profiles;
drop policy if exists user_profiles_own_update on public.user_profiles;
drop policy if exists user_profiles_own_delete on public.user_profiles;
create policy household_user_profiles_select on public.user_profiles
  for select to authenticated
  using (id in (select public.household_peer_ids()));
create policy own_profile on public.user_profiles
  for all to public using ((select auth.uid()) = id);
-- Live am 2026-10-27 per apply_migration (Name: perf_views_policies) angewendet: Abschnitte 1-4 und 7. Abschnitte 5-6 liegen als Optional-Datei in supabase/data/.
