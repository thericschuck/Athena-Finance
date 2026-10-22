/**
 * balance_series: die Kontostand-Historie als Läufe statt als Tageszeilen.
 *
 * `account_balances` hat pro Konto und Tag eine Zeile (6 Konten x 3.054 Tage seit 2018 = 18.324 Zeilen), aber der
 * Stand ändert sich selten: Bausparverträge haben 2 verschiedene Werte, das Girokonto 339. Die App lud das bisher
 * seitenweise (3-4 Anfragen à 1.000 Zeilen nacheinander). Die Funktion fasst aufeinanderfolgende Tage mit demselben Stand zu
 * einem Lauf zusammen:
 *
 *   account_id | von        | bis        | balance
 *   Girokonto  | 2026-10-01 | 2026-10-04 | 1544.57      <- vier Tageszeilen in einer
 *
 * Das ist verlustfrei: ein Lauf endet bei jeder Änderung des Stands UND bei jeder Lücke von mehr als einem Tag, die App
 * rekonstruiert daraus (src/lib/account-history-runs.ts) exakt dieselben Tageszeilen wie vorher. Sparkline und Chart verteilen
 * ihre Punkte nach Index, brauchen also die volle Tagesreihe; nur die Übertragung wird kleiner.
 *
 * security invoker + feste search_path: es gilt die RLS der aufrufenden Rolle (account_balances hat keine user_id, die
 * Richtlinie prüft den Besitz über accounts). `p_account_id` und `p_from` grenzen ein, wie es fetchBalanceHistory tat.
 *
 * Rollback: supabase/rollbacks/20261023100000_balance_series.down.sql
 */
create or replace function public.balance_series(p_account_id uuid default null, p_from date default null)
returns table (account_id uuid, von date, bis date, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $$
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
    -- Neuer Lauf: erste Zeile, Stand ändert sich oder Lücke zum Vortag.
    select s.account_id, s.d, s.balance,
           sum(case when s.vor_d is null or s.d - s.vor_d <> 1 or s.balance is distinct from s.vor_b then 1 else 0 end)
             over (partition by s.account_id order by s.d) as lauf
    from s
  )
  select m.account_id, min(m.d) as von, max(m.d) as bis, m.balance
  from marked m
  group by m.account_id, m.lauf, m.balance
  order by m.account_id, min(m.d)
$$;

comment on function public.balance_series(uuid, date) is
  'Kontostand-Historie als Läufe (von, bis, balance): aufeinanderfolgende Tage mit gleichem Stand in einer Zeile. Verlustfrei, RLS der aufrufenden Rolle.';

revoke all on function public.balance_series(uuid, date) from public, anon;
grant execute on function public.balance_series(uuid, date) to authenticated, service_role;
