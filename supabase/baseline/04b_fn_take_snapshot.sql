-- Baseline 2026-10-26, Teil 04b: fn_take_snapshot (Funktion 20 von 20). UNGETESTET.
CREATE OR REPLACE FUNCTION public.fn_take_snapshot(target_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid              uuid;
  v_hist             boolean;
  v_depot_alt        numeric;
  v_total_checking   numeric;
  v_total_investment numeric;
  v_total_savings    numeric;
  v_total_cash       numeric;
  v_total_bausparer  numeric;
  v_total_business   numeric;
  v_total_debts      numeric;
  v_total_depot      numeric;
  v_depot_fonds      numeric;
  v_total_crypto     numeric;
  v_total_assets     numeric;
  v_net_worth        numeric;
  v_bal_rows         integer;
  v_stale            integer;
  v_unbekannt        integer;
  v_log              text[] := array[]::text[];
begin
  if target_date >= current_date then
    insert into fund_price_history (isin, price_date, price, currency)
    select fpc.isin, target_date, fpc.price, coalesce(fpc.currency, 'EUR')
    from fund_price_cache fpc
    where fpc.price > 0
    on conflict (isin, price_date) do update set price = excluded.price;
  end if;

  for v_uid in select id from auth.users loop
    v_log := v_log || format('-- %s --', v_uid);

    v_bal_rows := fn_recompute_account_balances(v_uid, target_date);
    v_log := v_log || format('  account_balances: %s Zeilen', v_bal_rows);

    select target_date < current_date
       and exists (select 1 from portfolio_snapshots ps
                    where ps.user_id = v_uid and ps.snapshot_date = target_date)
      into v_hist;

    if v_hist then
      v_log := v_log || 'Positionen: Historie vorhanden, wird nicht ueberschrieben'::text;
    else
      delete from portfolio_snapshots
      where user_id = v_uid and snapshot_date = target_date;

      insert into portfolio_snapshots
        (asset_id, user_id, quantity, price_eur, snapshot_date, portfolio_name, source)
      select
        a.id, v_uid, a.quantity,
        round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        target_date, a.portfolio_name, 'cron'
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0;

      insert into asset_valuations
        (asset_id, price_per_unit, total_value, valuation_date, source)
      select
        a.id,
        round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        round(a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        target_date,
        case when a.type in ('crypto', 'stable') then 'coingecko' else 'manual' end
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0
      on conflict (asset_id, valuation_date) do update
        set price_per_unit = case when excluded.price_per_unit > 0
                                  then excluded.price_per_unit
                                  else asset_valuations.price_per_unit end,
            total_value    = case when excluded.price_per_unit > 0
                                  then excluded.total_value
                                  else asset_valuations.total_value end,
            source         = case when excluded.price_per_unit > 0
                                   and excluded.price_per_unit is distinct from asset_valuations.price_per_unit
                                  then excluded.source
                                  else asset_valuations.source end;
    end if;

    if v_hist then
      select
        round(coalesce(sum(case when a.type = 'stock' then ps.quantity * ps.price_eur end), 0), 2),
        round(coalesce(sum(case when a.type in ('crypto','stable','fiat') then ps.quantity * ps.price_eur end), 0), 2)
      into v_total_depot, v_total_crypto
      from portfolio_snapshots ps
      join assets a on a.id = ps.asset_id
      where ps.user_id = v_uid and ps.snapshot_date = target_date;
    else
      select
        round(coalesce(sum(case when a.type = 'stock'
                                then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2),
        round(coalesce(sum(case when a.type in ('crypto','stable','fiat')
                                then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2)
      into v_total_depot, v_total_crypto
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0;
    end if;

    select count(*) into v_stale
    from assets a
    where a.user_id = v_uid and a.type in ('crypto','stable') and a.quantity > 0
      and fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) = 0;
    if v_stale > 0 then
      v_log := v_log || format('  WARN: %s Krypto-Position(en) ohne Preis', v_stale);
    end if;

    select count(*) into v_unbekannt
    from assets a
    where a.user_id = v_uid and a.quantity > 0
      and a.type not in ('crypto','stable','fiat','stock');
    if v_unbekannt > 0 then
      v_log := v_log || format('  WARN: %s Position(en) ohne Vermoegens-Bucket', v_unbekannt);
    end if;

    select round(coalesce(sum(dt.shares * fn_fund_price_eur(dt.isin, target_date)), 0), 2)
    into   v_depot_fonds
    from   depot_transactions dt
    where  dt.user_id = v_uid
      and  dt.transaction_date <= target_date;

    v_total_depot := coalesce(v_total_depot, 0) + coalesce(v_depot_fonds, 0);

    -- Vergangener Tag ohne echte Kursquelle: gespeicherten Wert behalten.
    if target_date < current_date then
      select nws.total_depot into v_depot_alt
      from net_worth_snapshots nws
      where nws.user_id = v_uid and nws.snapshot_date = target_date;

      if v_depot_alt is not null and exists (
           select 1
           from depot_transactions dt
           where dt.user_id = v_uid
             and dt.transaction_date <= target_date
             and not exists (select 1 from fund_price_history fph
                              where fph.isin = dt.isin and fph.price_date <= target_date))
      then
        v_total_depot := v_depot_alt;
        v_log := v_log || 'Depot: keine Kurshistorie zum Stichtag, Altwert bleibt'::text;
      end if;
    end if;

    select
      round(coalesce(sum(case when a.type = 'checking'         then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'investment'       then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'savings'          then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type in ('cash','other')  then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'building_savings' then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'credit'           then abs(coalesce(ab.balance, 0)) end), 0), 2)
    into
      v_total_checking, v_total_investment, v_total_savings,
      v_total_cash, v_total_bausparer, v_total_debts
    from accounts a
    left join account_balances ab on ab.account_id = a.id and ab.snapshot_date = target_date
    where a.user_id = v_uid and a.is_active = true;

    select v_total_crypto + round(coalesce(sum(coalesce(ab.balance, 0)), 0), 2)
    into   v_total_crypto
    from accounts a
    left join account_balances ab on ab.account_id = a.id and ab.snapshot_date = target_date
    where a.user_id = v_uid and a.is_active = true and a.type = 'crypto';

    v_total_business := 0;

    v_total_assets := round(
      coalesce(v_total_checking,0) + coalesce(v_total_investment,0) + coalesce(v_total_savings,0) +
      coalesce(v_total_cash,0) + coalesce(v_total_bausparer,0) + coalesce(v_total_business,0) +
      coalesce(v_total_depot,0) + coalesce(v_total_crypto,0), 2);
    v_net_worth := round(v_total_assets - coalesce(v_total_debts, 0), 2);

    insert into net_worth_snapshots (
      user_id, snapshot_date, source,
      total_checking, total_investment, total_savings, total_cash, total_bausparer,
      total_business, total_debts, total_depot, total_crypto
    ) values (
      v_uid, target_date, 'cron',
      coalesce(v_total_checking,0), coalesce(v_total_investment,0), coalesce(v_total_savings,0),
      coalesce(v_total_cash,0), coalesce(v_total_bausparer,0), coalesce(v_total_business,0),
      coalesce(v_total_debts,0), coalesce(v_total_depot,0), coalesce(v_total_crypto,0)
    )
    on conflict (user_id, snapshot_date) do update set
      total_checking   = excluded.total_checking,
      total_investment = excluded.total_investment,
      total_savings    = excluded.total_savings,
      total_cash       = excluded.total_cash,
      total_bausparer  = excluded.total_bausparer,
      total_business   = excluded.total_business,
      total_debts      = excluded.total_debts,
      total_depot      = excluded.total_depot,
      total_crypto     = excluded.total_crypto,
      source           = 'cron'
    where net_worth_snapshots.source <> 'repair';

    v_log := v_log || format('  net_worth: EUR %s  (assets %s, debts %s, depot %s, crypto %s, investment %s)',
      v_net_worth, v_total_assets, v_total_debts, v_total_depot, v_total_crypto, v_total_investment);

    perform fn_recompute_monthly_summary(v_uid, target_date);
    v_log := v_log || format('  monthly_summary [%s]: ok', to_char(target_date, 'YYYY-MM'));
  end loop;

  return jsonb_build_object('ok', true, 'date', target_date, 'log', to_jsonb(v_log));
end;
$function$;
