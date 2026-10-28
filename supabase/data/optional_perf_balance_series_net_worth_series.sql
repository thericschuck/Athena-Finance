-- OPTIONAL, NICHT ANGEWENDET: schnellere balance_series (ein Window-Durchlauf) und net_worth_series (Fondspreis je Tag und ISIN, inline).
-- Gewinn nur ca. 20-30 Prozent und dupliziert die Logik von fn_fund_price_eur (Driftrisiko) -> bewusst nicht angewendet.
-- Herkunft: Abschnitte 5-6 der Migration 20261101100000_perf_indexes_views.sql (Stand der Datei vor dem Aufteilen).

-- 5. balance_series: EIN Window-Durchlauf (lag + lead) statt zwei WindowAgg ueber 18354 Zeilen -------------------------------------
-- Ein Lauf = aufeinanderfolgende Tage mit gleichem Stand. Je Zeile wird Lauf-Beginn (st) und Lauf-Ende (en) bestimmt; nur diese
-- Zeilen (<= 2 je Lauf) werden weiterverarbeitet: Beginn-Zeile -> bis = eigenes Datum (Einzeltag-Lauf) oder Datum der naechsten
-- Beginn/Ende-Zeile (= Ende desselben Laufs, da sich Beginn und Ende je Konto abwechseln). Ergebnismenge identisch (Test: Hash,
-- Fixture mit Luecke und Stand-Wechsel).
create or replace function public.balance_series(p_account_id uuid default null::uuid, p_from date default null::date)
returns table(account_id uuid, von date, bis date, balance numeric)
language sql
stable
set search_path to ''
as $function$
  select r.account_id, r.von, r.bis, r.balance
  from (
    select e.account_id, e.d as von,
           case when e.en then e.d else lead(e.d) over (partition by e.account_id order by e.d) end as bis,
           e.balance, e.st
    from (
      select s.account_id, s.d, s.balance,
             (s.vor_d is null or s.d - s.vor_d <> 1 or s.balance is distinct from s.vor_b) as st,
             (s.nxt_d is null or s.nxt_d - s.d <> 1 or s.balance is distinct from s.nxt_b) as en
      from (
        select b.account_id, b.snapshot_date as d, b.balance,
               lag(b.snapshot_date) over w as vor_d, lag(b.balance) over w as vor_b,
               lead(b.snapshot_date) over w as nxt_d, lead(b.balance) over w as nxt_b
        from public.account_balances b
        where (p_account_id is null or b.account_id = p_account_id)
          and (p_from is null or b.snapshot_date >= p_from)
        window w as (partition by b.account_id order by b.snapshot_date)
      ) s
    ) e
    where e.st or e.en
  ) r
  where r.st
  order by r.account_id, r.von
$function$;

-- 6. net_worth_series: Fondspreis je (Tag, ISIN) statt je (Tag, Transaktion), Preisabfrage inline -------------------------------
-- sum(shares) * Preis == sum(shares * Preis) (numeric exakt); Tage ohne Transaktion: ISIN null => keine Preisabfrage, Summe 0 wie
-- vorher. Der Preis ist die Logik von fn_fund_price_eur (letzter Kurs <= Tag, sonst Durchschnittseinstand, sonst 0), inline, weil
-- die Funktion wegen SET search_path nicht inlinebar ist und je Aufruf ca. 0,3 ms kostet.
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
    select d from (select d from acc union select d from pos) u
    where d >= coalesce((select min(pos.d) from pos), d)
  ),
  fonds as (
    select x.d,
      round(coalesce(sum(case when x.isin is not null then x.sh * coalesce(
        (select fph.price from public.fund_price_history fph where fph.isin = x.isin and fph.price_date <= x.d order by fph.price_date desc limit 1),
        (select round(sum(dt2.amount_eur) / nullif(sum(dt2.shares), 0), 4) from public.depot_transactions dt2 where dt2.isin = x.isin and dt2.shares > 0),
        0) end), 0), 2) as fnd
    from (
      select dts.d, dt.isin, sum(dt.shares) as sh
      from dates dts
      left join public.depot_transactions dt
        on dt.transaction_date <= dts.d
       and (dt.user_id = any (coalesce(p_owner_ids, '{}'::uuid[])) or (coalesce(p_include_shared, false) and dt.shared))
      group by dts.d, dt.isin
    ) x
    group by x.d
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

