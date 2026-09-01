-- Nachrechnen der Historie, die der alte fn_take_snapshot (Migration 20260311000000)
-- falsch geschrieben hat. Setzt 20260831000000 voraus.
--
-- Bewusst NICHT ueber `select fn_take_snapshot(d) from generate_series(...)`: diese Funktion
-- bewertet in Schritt 2/2b/2c Depot und Krypto mit den HEUTIGEN Preisen. Ueber die ganze
-- Historie aufgerufen wuerde sie die Kurshistorie in portfolio_snapshots, asset_valuations
-- und net_worth_snapshots.total_depot/total_crypto platt buegeln -- jeder Tag saehe aus wie
-- heute. Deshalb werden hier nur die drei Dinge nachgezogen, die tatsaechlich falsch waren.


-- == 1. account_balances ======================================================
--
-- Mengenbasiert statt 3.000 Einzelaufrufe von fn_recompute_account_balances: taegliche
-- Deltas einmal bilden, dann per Fensterfunktion aufkumulieren.
--
-- Fuer bank-verknuepfte Konten gilt dieselbe Regel wie in der Funktion -- vom heutigen
-- booked_balance rueckwaerts. `seither` ist dort ein eigener Lateral-Join; hier ergibt es
-- sich billiger als (Gesamtsumme - bisher), weil beide Groessen ohnehin auf dieselbe Menge
-- (alles bis heute) eingeschraenkt sind.
with mov as (
  select ut.account_id as acc, coalesce(ut.booked_date, ut.date) as d, ut.signed_amount as delta
  from unified_transactions ut
  where ut.account_id is not null
    and coalesce(ut.booked_date, ut.date) <= current_date
  union all
  select ut.transfer_to, coalesce(ut.booked_date, ut.date),
         coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1))
  from unified_transactions ut
  where ut.source = 'manual' and ut.type = 'transfer' and ut.transfer_to is not null
    and coalesce(ut.booked_date, ut.date) <= current_date
),
spanne as (
  select least(
           (select min(ab.snapshot_date) from account_balances ab),
           (select min(m.d) from mov m)
         ) as von
),
tage as (
  select generate_series(von, current_date, interval '1 day')::date as d from spanne
),
daily as (select acc, d, sum(delta) as delta from mov group by 1, 2),
tot   as (select acc, sum(delta) as total from mov group by 1),
raster as (
  select a.id as acc, a.currency, bb.booked_balance, t.d
  from accounts a
  cross join tage t
  left join bank_balance bb
    on bb.user_id = a.user_id and a.bank_iban is not null and bb.account_iban = a.bank_iban
  where a.is_active = true
),
kum as (
  select r.*,
         sum(coalesce(dl.delta, 0)) over (
           partition by r.acc order by r.d rows between unbounded preceding and current row
         ) as bisher
  from raster r
  left join daily dl on dl.acc = r.acc and dl.d = r.d
)
insert into account_balances (account_id, balance, currency, snapshot_date, source)
select k.acc,
       round(case when k.booked_balance is not null
                  then k.booked_balance - (coalesce(t.total, 0) - k.bisher)
                  else k.bisher end, 2),
       k.currency, k.d, 'cron'
from kum k
left join tot t on t.acc = k.acc
on conflict (account_id, snapshot_date) do update
  set balance = excluded.balance, source = 'cron';


-- == 2. monthly_finance_summary ===============================================
--
-- Vorher standen hier nur sechs Monate, davon zwei komplett leer (August und Maerz 2026 mit
-- 0,00/0,00). Danach: jeder Monat, in dem es ueberhaupt Buchungen gibt.
do $$
declare u uuid; m date;
begin
  for u in select distinct user_id from accounts loop
    for m in
      select distinct date_trunc('month', ut.date)::date
      from unified_transactions ut where ut.user_id = u
      order by 1
    loop
      perform fn_recompute_monthly_summary(u, m);
    end loop;
  end loop;
end $$;


-- == 3. net_worth_snapshots ===================================================
--
-- Nur die kontogetriebenen Toepfe. total_depot und total_crypto bleiben stehen, weil sie den
-- Kurs des jeweiligen Tages tragen -- neu berechnet waeren sie der heutige Kurs.
with eimer as (
  select a.user_id, ab.snapshot_date,
    round(coalesce(sum(case when a.type in ('checking','investment') then ab.balance end),0),2) as checking,
    round(coalesce(sum(case when a.type = 'savings' then ab.balance end),0),2) as savings,
    round(coalesce(sum(case when a.type = 'cash' then ab.balance end),0),2) as cash,
    round(coalesce(sum(case when a.type in ('bausparer','building_savings') then ab.balance end),0),2) as bausparer,
    round(coalesce(sum(case when a.type = 'business' then ab.balance end),0),2) as business,
    round(coalesce(sum(case when a.type in ('loan','credit','debt') then abs(ab.balance) end),0),2) as debts
  from accounts a
  join account_balances ab on ab.account_id = a.id
  where a.is_active = true
  group by 1, 2
)
update net_worth_snapshots n set
  total_checking  = e.checking,
  total_savings   = e.savings,
  total_cash      = e.cash,
  total_bausparer = e.bausparer,
  total_business  = e.business,
  total_debts     = e.debts
from eimer e
where e.user_id = n.user_id and e.snapshot_date = n.snapshot_date
  and (n.total_checking, n.total_savings, n.total_cash, n.total_bausparer, n.total_business, n.total_debts)
      is distinct from (e.checking, e.savings, e.cash, e.bausparer, e.business, e.debts);
