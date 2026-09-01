-- fn_take_snapshot rechnet ab jetzt auf `unified_transactions` statt auf `transactions`.
--
-- Das Problem: Schritt 1 (account_balances) und Schritt 4 (monthly_finance_summary) lasen
-- ausschliesslich die Tabelle `transactions`. Seit der Zusammenfuehrung von Finance und
-- Banking (Migration 20260821010000) liegen die Buchungen bank-verknuepfter Konten aber in
-- `bank_transactions`; `transactions` enthaelt nur noch die drei manuellen Eroeffnungssalden.
--
-- Der naechtliche Job (pg_cron 23:59 -> Edge Function daily-snapshot -> hier) hat dadurch
-- jede Nacht die Kontostaende aller Bankkonten auf 0,00 gesetzt:
--
--     Girokonto          29.08. 1.544,57  ->  30.08. 0,00  ->  31.08. 1.523,27 (Sync-Trigger)
--     Geteiltes Konto    29.08. 1.925,60  ->  30.08. 0,00  ->  31.08. 1.925,60
--     Geschaeftsanteile  29.08. 1.500,00  ->  30.08. 0,00  ->  31.08. 1.500,00
--
-- Schritt 3 leitet den Net Worth aus genau diesen Zeilen ab, also stuerzte auch der
-- Vermoegensverlauf jede Nacht ab (net_worth_snapshots 30.08.: total_checking 0,00).
--
-- Und monthly_finance_summary -- die Quelle fuer Monatsvergleich und KDE-Ausgabenverteilung
-- auf /analyse sowie fuer die Finanzanalyse im Dashboard -- bekam fuer August 0,00/0,00
-- statt der tatsaechlichen 5.965,13/4.223,88.
--
-- Die Rechenregeln unten sind bewusst dieselben wie in src/app/api/cron/daily-snapshot/
-- route.ts, wo sie schon richtig standen. Diese Route ist allerdings in keiner Cron-Liste
-- eingetragen (vercel.json kennt nur /api/bank-sync) -- gelaufen ist immer diese Funktion.
--
-- Schritt 1 und 4 wandern zusaetzlich in eigene Funktionen. Nicht aus Stilgruenden: der
-- Backfill (Migration 20260831000001) muss genau diese beiden Schritte fuer die Vergangenheit
-- nachziehen, ohne Schritt 2/3 mitzurechnen -- die bewerten Depot und Krypto mit den HEUTIGEN
-- Preisen und wuerden die Kurshistorie beim Nachrechnen platt buegeln.


-- == Kontostand eines Tages ===================================================
--
-- Zwei Faelle:
--
--   Konto MIT bank_iban  -> der von der Bank gemeldete booked_balance ist der Anker.
--       Fuer zurueckliegende Tage wird von diesem Anker RUECKWAERTS gerechnet: alles, was
--       zwischen dem Stichtag und heute gebucht wurde, wieder abziehen. Vorwaerts von Null
--       zu summieren geht nicht -- FinTS liefert beim Routine-Sync nur 90 Tage, die Summe
--       waere also eine Periodenbewegung und kein Saldo.
--
--   Konto OHNE bank_iban -> klassisch die Summe aller Buchungen bis zum Stichtag.
--
-- Massgeblich ist `booked_date` (Buchungstag), nicht `date` (Valuta): ob eine Buchung im
-- gemeldeten booked_balance steckt, entscheidet der Buchungstag. Siehe Migration
-- 20260830010000 -- ueber die Valuta einsortiert ergaben sich 592,50 EUR Abweichung.
--
-- Vorausbuchungen (booked_date > heute) bleiben in beiden Faellen draussen: die Bank hat sie
-- noch nicht im Saldo, und ein Stichtag in der Vergangenheit erst recht nicht.
create or replace function fn_recompute_account_balances(p_uid uuid, p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rows integer;
begin
  with mov as (
    -- Wirkung jeder Zeile auf ihr EIGENES Konto.
    select
      ut.account_id                     as acc,
      coalesce(ut.booked_date, ut.date) as d,
      ut.signed_amount                  as delta
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.account_id is not null

    union all

    -- Gegenbuchung einer MANUELLEN Umbuchung. Nur dort noetig: `transactions` speichert eine
    -- Umbuchung als eine Zeile (Abgang hier, Zugang auf transfer_to), FinTS dagegen liefert
    -- beide Seiten als eigene Buchung -- die haengen oben schon je an ihrem Konto.
    select
      ut.transfer_to,
      coalesce(ut.booked_date, ut.date),
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1))
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.source = 'manual'
      and ut.type = 'transfer'
      and ut.transfer_to is not null
  )
  insert into account_balances (account_id, balance, currency, snapshot_date, source)
  select
    a.id,
    round(case
      when bb.booked_balance is not null then bb.booked_balance - coalesce(seither.s, 0)
      else                                    coalesce(bisher.s, 0)
    end, 2),
    a.currency,
    p_date,
    'cron'
  from accounts a
  left join bank_balance bb
    on  bb.user_id       = a.user_id
    and a.bank_iban     is not null
    and bb.account_iban  = a.bank_iban
  left join lateral (
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d <= p_date
  ) bisher on true
  left join lateral (
    -- Nach dem Stichtag, aber bis heute: der Betrag, um den der Anker zu weit vorn liegt.
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d > p_date and m.d <= current_date
  ) seither on true
  where a.user_id = p_uid
    and a.is_active = true
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance,
        source  = 'cron';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;


-- == Monatssummen =============================================================
--
-- Kategorien werden wie gehabt ueber ihren Namen in Toepfe sortiert. Neu ist nur die Quelle:
-- unified_transactions liefert `category_name` fuer manuelle UND Bankbuchungen (siehe
-- Migration 20260821020000), die Zuordnung funktioniert also fuer beide gleich.
--
-- Betraege sind in unified_transactions immer positiv (Bankzeilen ueber abs()), die Richtung
-- steckt in `type` -- total_expenses bleibt damit wie bisher ein positiver Betrag.
create or replace function fn_recompute_monthly_summary(p_uid uuid, p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into monthly_finance_summary (
    user_id, month, source,
    salary, food, leisure, subscriptions, savings_transfer, pocket_money,
    other_income, other_expenses, total_income, total_expenses
  )
  select
    p_uid,
    date_trunc('month', p_month)::date,
    'cron',
    -- salary
    round(coalesce(sum(case when t.typ = 'income'
      and (t.cname like '%gehalt%' or t.cname like '%lohn%' or t.cname like '%salary%')
      then t.amt end), 0), 2),
    -- food
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%lebensmittel%' or t.cname like '%supermarkt%'
        or t.cname like '%food%' or t.cname like '%groceries%')
      then t.amt end), 0), 2),
    -- leisure
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%freizeit%' or t.cname like '%leisure%'
        or t.cname like '%entertainment%' or t.cname like '%sport%' or t.cname like '%hobby%')
      then t.amt end), 0), 2),
    -- subscriptions
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%abo%' or t.cname like '%subscription%'
        or t.cname like '%streaming%' or t.cname like '%software%' or t.cname like '%mitglied%')
      then t.amt end), 0), 2),
    -- savings_transfer
    round(coalesce(sum(case
      when t.cname like '%sparen%' or t.cname like '%saving%'
        or t.cname like '%übertrag%' or t.cname like '%transfer%'
      then t.amt end), 0), 2),
    -- pocket_money
    round(coalesce(sum(case when t.typ = 'expense'
      and (t.cname like '%taschengeld%' or t.cname like '%pocket%')
      then t.amt end), 0), 2),
    -- other_income
    round(coalesce(sum(case when t.typ = 'income'
      and t.cname not like '%gehalt%' and t.cname not like '%lohn%'
      and t.cname not like '%salary%' and t.cname not like '%sparen%'
      and t.cname not like '%saving%' and t.cname not like '%übertrag%'
      then t.amt end), 0), 2),
    -- other_expenses
    round(coalesce(sum(case when t.typ = 'expense'
      and t.cname not like '%lebensmittel%' and t.cname not like '%supermarkt%'
      and t.cname not like '%food%'         and t.cname not like '%groceries%'
      and t.cname not like '%freizeit%'     and t.cname not like '%leisure%'
      and t.cname not like '%sport%'        and t.cname not like '%hobby%'
      and t.cname not like '%abo%'          and t.cname not like '%subscription%'
      and t.cname not like '%streaming%'    and t.cname not like '%mitglied%'
      and t.cname not like '%sparen%'       and t.cname not like '%saving%'
      and t.cname not like '%übertrag%'     and t.cname not like '%transfer%'
      and t.cname not like '%taschengeld%'  and t.cname not like '%pocket%'
      then t.amt end), 0), 2),
    -- total_income
    round(coalesce(sum(case when t.typ = 'income'  then t.amt end), 0), 2),
    -- total_expenses
    round(coalesce(sum(case when t.typ = 'expense' then t.amt end), 0), 2)
  from (
    select
      ut.type                                                       as typ,
      lower(coalesce(ut.category_name, ''))                         as cname,
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1)) as amt
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.date >= date_trunc('month', p_month)::date
      and ut.date <  (date_trunc('month', p_month) + interval '1 month')::date
      and ut.type <> 'transfer'
  ) t
  on conflict (user_id, month) do update set
    salary           = excluded.salary,
    food             = excluded.food,
    leisure          = excluded.leisure,
    subscriptions    = excluded.subscriptions,
    savings_transfer = excluded.savings_transfer,
    pocket_money     = excluded.pocket_money,
    other_income     = excluded.other_income,
    other_expenses   = excluded.other_expenses,
    total_income     = excluded.total_income,
    total_expenses   = excluded.total_expenses,
    source           = 'cron';
end;
$fn$;

grant execute on function fn_recompute_account_balances(uuid, date) to service_role;
grant execute on function fn_recompute_monthly_summary(uuid, date)  to service_role;


-- == fn_take_snapshot =========================================================
--
-- Unveraendert gegenueber Migration 20260311000000 bis auf Schritt 1 und Schritt 4, die jetzt
-- die beiden Funktionen oben aufrufen. Schritt 2/2b/2c (Depot- und Kryptobewertung) und
-- Schritt 3 (Net Worth) bleiben wie sie waren -- Schritt 3 wird allein dadurch richtig, dass
-- er die nun korrekten account_balances liest.
create or replace function fn_take_snapshot(target_date date default current_date)
returns jsonb
language plpgsql
security definer   -- laeuft als postgres; umgeht RLS, darf auth.users lesen
set search_path = public
as $fn$
declare
  v_uid              uuid;
  v_total_checking   numeric;
  v_total_savings    numeric;
  v_total_cash       numeric;
  v_total_bausparer  numeric;
  v_total_business   numeric;
  v_total_debts      numeric;
  v_total_depot      numeric;
  v_total_crypto     numeric;
  v_total_assets     numeric;
  v_net_worth        numeric;
  v_bal_rows         integer;
  v_log              text[] := array[]::text[];
begin
  for v_uid in select id from auth.users loop
    v_log := v_log || format('-- %s --', v_uid);

    -- == Schritt 1: Kontostaende ==============================================
    v_bal_rows := fn_recompute_account_balances(v_uid, target_date);
    v_log := v_log || format('  account_balances: %s Zeilen', v_bal_rows);

    -- == Schritt 2: Portfolio Snapshots =======================================
    delete from portfolio_snapshots
    where user_id = v_uid and snapshot_date = target_date;

    insert into portfolio_snapshots
      (asset_id, user_id, quantity, price_eur, snapshot_date, portfolio_name, source)
    select
      a.id,
      v_uid,
      a.quantity,
      round(case
        when a.type = 'crypto' then coalesce(cpc.price_eur, 0)
        else                        coalesce(a.avg_buy_price, 0)
      end, 2),
      target_date,
      a.portfolio_name,
      'cron'
    from assets a
    left join crypto_price_cache cpc on upper(a.symbol) = cpc.symbol
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0;

    -- == Schritt 2b: Asset Valuations =========================================
    insert into asset_valuations
      (asset_id, price_per_unit, total_value, valuation_date, source)
    select
      a.id,
      round(case
        when a.type = 'crypto' then coalesce(cpc.price_eur, 0)
        else                        coalesce(a.avg_buy_price, 0)
      end, 2),
      round(a.quantity * case
        when a.type = 'crypto' then coalesce(cpc.price_eur, 0)
        else                        coalesce(a.avg_buy_price, 0)
      end, 2),
      target_date,
      case when a.type = 'crypto' then 'coingecko' else 'manual' end
    from assets a
    left join crypto_price_cache cpc on upper(a.symbol) = cpc.symbol
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0
    on conflict (asset_id, valuation_date) do update
      set price_per_unit = excluded.price_per_unit,
          total_value    = excluded.total_value,
          source         = excluded.source;

    -- == Schritt 2c: Summen ===================================================
    select
      round(coalesce(sum(case when a.type in ('depot','etf','stock','fund')
                              then a.quantity * coalesce(a.avg_buy_price, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'crypto'
                              then a.quantity * coalesce(cpc.price_eur, 0) end), 0), 2)
    into v_total_depot, v_total_crypto
    from assets a
    left join crypto_price_cache cpc on upper(a.symbol) = cpc.symbol
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0;

    -- Depot-Modul dazu (depot_transactions x fund_price_cache)
    select v_total_depot + round(coalesce(sum(dt.shares * coalesce(fpc.price, 0)), 0), 2)
    into   v_total_depot
    from   depot_transactions dt
    left join fund_price_cache fpc on dt.isin = fpc.isin
    where  dt.user_id = v_uid;

    -- == Schritt 3: Net Worth =================================================
    select
      round(coalesce(sum(case when a.type in ('checking','investment') then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'savings'                  then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'cash'                     then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type in ('bausparer','building_savings') then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'business'                 then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type in ('loan','credit','debt')   then abs(coalesce(ab.balance, 0)) end), 0), 2)
    into
      v_total_checking, v_total_savings, v_total_cash,
      v_total_bausparer, v_total_business, v_total_debts
    from accounts a
    left join account_balances ab
      on ab.account_id = a.id and ab.snapshot_date = target_date
    where a.user_id = v_uid and a.is_active = true;

    v_total_assets := round(
      coalesce(v_total_checking,  0) + coalesce(v_total_savings,  0) +
      coalesce(v_total_cash,      0) + coalesce(v_total_bausparer,0) +
      coalesce(v_total_business,  0) + coalesce(v_total_depot,    0) +
      coalesce(v_total_crypto,    0), 2);
    v_net_worth := round(v_total_assets - coalesce(v_total_debts, 0), 2);

    insert into net_worth_snapshots (
      user_id, snapshot_date, source,
      total_checking, total_savings, total_cash, total_bausparer,
      total_business, total_debts, total_depot, total_crypto
    ) values (
      v_uid, target_date, 'cron',
      coalesce(v_total_checking,  0), coalesce(v_total_savings,  0),
      coalesce(v_total_cash,      0), coalesce(v_total_bausparer,0),
      coalesce(v_total_business,  0), coalesce(v_total_debts,    0),
      coalesce(v_total_depot,     0), coalesce(v_total_crypto,   0)
    )
    on conflict (user_id, snapshot_date) do update set
      total_checking  = excluded.total_checking,
      total_savings   = excluded.total_savings,
      total_cash      = excluded.total_cash,
      total_bausparer = excluded.total_bausparer,
      total_business  = excluded.total_business,
      total_debts     = excluded.total_debts,
      total_depot     = excluded.total_depot,
      total_crypto    = excluded.total_crypto,
      source          = 'cron';

    v_log := v_log || format('  net_worth: EUR %s  (assets %s, debts %s, depot %s, crypto %s)',
      v_net_worth, v_total_assets, v_total_debts, v_total_depot, v_total_crypto);

    -- == Schritt 4: Monatssummen ==============================================
    perform fn_recompute_monthly_summary(v_uid, target_date);
    v_log := v_log || format('  monthly_summary [%s]: ok', to_char(target_date, 'YYYY-MM'));

  end loop;

  return jsonb_build_object('ok', true, 'date', target_date, 'log', to_jsonb(v_log));
end;
$fn$;

grant execute on function fn_take_snapshot(date) to service_role;
