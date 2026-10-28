-- HAUSHALT PHASE 3 (Paket B): Nettovermoegensverlauf scope-richtig aus granularen Quellen.
-- Plan: docs/haushalt-multiuser.md (Abschnitt 5 "Snapshots/Vermoegensverlauf"), docs/haushalt-scope-api.md.
--
-- Problem: net_worth_snapshots ist pro User und Tag aggregiert. Der Besitzer-Snapshot enthaelt das geteilte Konto; die Summe
-- zweier User-Snapshots zaehlt es doppelt, und "nur Malik" oder "nur gemeinsam" ist aus der Aggregation nicht zu rekonstruieren.
-- Granular sind: account_balances (Saldo je Konto und Tag), portfolio_snapshots (Position je Asset und Tag) und
-- depot_transactions x fund_price_history (Fondsdepots; fn_take_snapshot rechnet sie je Tag aus den Transaktionen).
--
-- Was: public.net_worth_series(p_account_ids, p_owner_ids, p_include_shared, p_from) liefert je Tag dieselben Toepfe wie
-- fn_take_snapshot (Live-Definition v3, Stand 2026-10-27):
--   checking = Konten type checking | investment = investment | savings = savings | cash = cash, other
--   bausparer = building_savings | debts = ABS(Saldo) der Konten type credit (positiv gespeichert)
--   crypto = Positionen type crypto/stable/fiat (portfolio_snapshots) + Konten type crypto
--   depot = Positionen type stock (portfolio_snapshots) + Fonds (depot_transactions.shares * fn_fund_price_eur(isin, tag))
--   business = 0 (Spalte nur noch Historie), assets = Summe der Toepfe ohne Schulden, net_worth = assets - debts.
--   Nur AKTIVE Konten (wie fn_take_snapshot). Sachwerte/Inventar sind wie im Snapshot nicht enthalten.
-- Parameter kommen aus dem ScopeContext der App: p_account_ids = ctx.accountIds (jedes Konto genau einmal, deshalb zaehlt das
-- geteilte Konto in "gemeinsam" nur einmal), p_owner_ids = ctx.ownerIds, p_include_shared = ctx.includeShared (Positionen und
-- Fondstransaktionen: eigene ODER shared, gemeinsam: user_id in Peers; wie applyOwnerScope).
-- Tage: alle Tage, an denen ein Scope-Konto einen account_balances-Eintrag ODER eine Position einen portfolio_snapshots-Eintrag hat,
-- frühestens ab dem ersten Positions-Snapshot im Scope (davor fehlen Krypto/Aktien in den Rohdaten).
--
-- SECURITY INVOKER + search_path '': die RLS des Aufrufers greift (Haushalts-Peers sehen account_balances/assets/depot_transactions;
-- portfolio_snapshots bekommt unten eine Peer-SELECT-Policy). Die Parameter sind nur ein Filter, keine Sicherheitsgrenze.
--
-- Bekannte Abweichungen zu net_worth_snapshots (bewusst, im Test dokumentiert):
--   - source='repair'-Zeilen (von Hand korrigierte Snapshots) sind in net_worth_snapshots editiert; die Funktion rechnet neu.
--   - fn_take_snapshot behaelt fuer vergangene Tage ohne Fondskurs-Historie den gespeicherten Depot-Altwert; das kennt die Funktion nicht.
--   - Tage ohne account_balances/portfolio_snapshots (Altbestand vor Einfuehrung von account_balances) fehlen in der Funktion.
--   - Rundung: Snapshot rundet Positionssumme aus ungerundeten Preisen, portfolio_snapshots.price_eur ist auf 2 Stellen gerundet.
-- Gemessen (rueckrollender Test 2026-10-26, Eric, Scope 'ich'): net_worth_snapshots hat 233 Tage, die Funktion 67 (erst ab dem
-- ersten Positions-Snapshot); auf diesen 67 Tagen sind 40 exakt gleich, 27 weichen ab: 22 nur im Krypto-Topf (Rundung, Abweichung
-- unter 0,50 EUR, kein Tag darueber), 5 nur im Depot-Topf (Fonds-Altwert/Rundung), keine source='repair'-Tage betroffen. Alle
-- Konten-Toepfe (checking, investment, savings, cash, bausparer, debts) sind an allen 67 Tagen identisch. Die 166 aelteren
-- Snapshot-Tage fehlen in der Funktion (keine Positions-Rohdaten).
-- Darum liest die App im Scope 'ich' bei Nutzern ohne Partner WEITER net_worth_snapshots (Regression); die Funktion kommt nur bei
-- Scope != 'ich' oder Haushalt mit Partner zum Einsatz.
--
-- portfolio_snapshots ist bisher owner-only (own_data). Neue SELECT-Policy: lesbar, wenn das Asset einem Haushalts-Peer gehoert
-- (gleiches Muster wie asset_valuations_household). Schreiben bleibt owner-only (own_data). Schreibwege (fn_take_snapshot) sind
-- SECURITY DEFINER und unberuehrt.
--
-- Rollback: supabase/rollbacks/20261029110000_net_worth_series_scope.down.sql
-- Test:     supabase/tests/net_worth_series_scope.sql
-- NUR ALS DATEI vorbereitet, nicht live angewendet.

drop policy if exists household_portfolio_snapshots_select on public.portfolio_snapshots;
create policy household_portfolio_snapshots_select on public.portfolio_snapshots
  for select to authenticated
  using (asset_id in (select a.id from public.assets a where a.user_id in (select public.household_peer_ids())));

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

comment on function public.net_worth_series(uuid[], uuid[], boolean, date) is
  'Nettovermoegensverlauf je Tag aus account_balances, portfolio_snapshots und depot_transactions (Toepfe wie fn_take_snapshot). Scope ueber Konto-IDs/Owner-IDs, RLS des Aufrufers.';

revoke all on function public.net_worth_series(uuid[], uuid[], boolean, date) from public, anon;
grant execute on function public.net_worth_series(uuid[], uuid[], boolean, date) to authenticated, service_role;
