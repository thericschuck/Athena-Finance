-- ─── crypto_price_cache ───────────────────────────────────────────────────────
-- Stores the latest CoinGecko price per symbol (fetched by Edge Function).
create table if not exists crypto_price_cache (
  symbol     text        primary key,
  price_eur  numeric     not null default 0,
  updated_at timestamptz not null default now()
);

-- ─── fn_take_snapshot ─────────────────────────────────────────────────────────
-- Calculates and upserts all daily snapshot tables for every user.
-- Called by the daily-snapshot Edge Function after prices are refreshed.
create or replace function fn_take_snapshot(target_date date default current_date)
returns jsonb
language plpgsql
security definer   -- runs as postgres; bypasses RLS, can read auth.users
set search_path = public
as $$
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
  v_log              text[] := array[]::text[];
begin
  -- ── Loop over every auth user ──────────────────────────────────────────────
  for v_uid in select id from auth.users loop
    v_log := v_log || format('── %s ──', v_uid);

    -- ── Step 1: Account Balances ─────────────────────────────────────────────
    -- Running balance = sum of all transactions ≤ target_date per account
    insert into account_balances (account_id, balance, currency, snapshot_date, source)
    select
      a.id,
      round(coalesce(sum(
        case
          when t.type = 'income'                    then  coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
          when t.type = 'expense'                   then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
          when t.type = 'transfer' and t.account_id  = a.id then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
          when t.type = 'transfer' and t.transfer_to = a.id then  coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
          else 0
        end
      ), 0), 2) as balance,
      a.currency,
      target_date,
      'cron'
    from accounts a
    left join transactions t
      on t.user_id = v_uid
      and t.date <= target_date
      and (t.account_id = a.id or t.transfer_to = a.id)
    where a.user_id = v_uid
      and a.is_active = true
    group by a.id, a.currency
    on conflict (account_id, snapshot_date) do update
      set balance = excluded.balance,
          source  = 'cron';

    -- ── Step 2: Portfolio Snapshots ──────────────────────────────────────────
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

    -- ── Step 2b: Asset Valuations ────────────────────────────────────────────
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

    -- ── Step 2c: Calculate totals ────────────────────────────────────────────
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

    -- Add depot-module value (depot_transactions × fund_price_cache)
    select v_total_depot + round(coalesce(sum(dt.shares * coalesce(fpc.price, 0)), 0), 2)
    into   v_total_depot
    from   depot_transactions dt
    left join fund_price_cache fpc on dt.isin = fpc.isin
    where  dt.user_id = v_uid;

    -- ── Step 3: Net Worth Snapshot ───────────────────────────────────────────
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

    v_log := v_log || format('  net_worth: €%s  (assets €%s, debts €%s, depot €%s, crypto €%s)',
      v_net_worth, v_total_assets, v_total_debts, v_total_depot, v_total_crypto);

    -- ── Step 4: Monthly Finance Summary ─────────────────────────────────────
    insert into monthly_finance_summary (
      user_id, month, source,
      salary, food, leisure, subscriptions, savings_transfer, pocket_money,
      other_income, other_expenses, total_income, total_expenses
    )
    select
      v_uid,
      date_trunc('month', target_date)::date,
      'cron',
      -- salary
      round(coalesce(sum(case when t.type = 'income'
        and (lower(c.name) like '%gehalt%' or lower(c.name) like '%lohn%' or lower(c.name) like '%salary%')
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- food
      round(coalesce(sum(case when t.type = 'expense'
        and (lower(c.name) like '%lebensmittel%' or lower(c.name) like '%supermarkt%'
          or lower(c.name) like '%food%' or lower(c.name) like '%groceries%')
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- leisure
      round(coalesce(sum(case when t.type = 'expense'
        and (lower(c.name) like '%freizeit%' or lower(c.name) like '%leisure%'
          or lower(c.name) like '%entertainment%' or lower(c.name) like '%sport%' or lower(c.name) like '%hobby%')
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- subscriptions
      round(coalesce(sum(case when t.type = 'expense'
        and (lower(c.name) like '%abo%' or lower(c.name) like '%subscription%'
          or lower(c.name) like '%streaming%' or lower(c.name) like '%software%' or lower(c.name) like '%mitglied%')
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- savings_transfer
      round(coalesce(sum(case
        when lower(c.name) like '%sparen%' or lower(c.name) like '%saving%'
          or lower(c.name) like '%übertrag%' or lower(c.name) like '%transfer%'
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- pocket_money
      round(coalesce(sum(case when t.type = 'expense'
        and (lower(c.name) like '%taschengeld%' or lower(c.name) like '%pocket%')
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- other_income
      round(coalesce(sum(case when t.type = 'income'
        and lower(c.name) not like '%gehalt%' and lower(c.name) not like '%lohn%'
        and lower(c.name) not like '%salary%' and lower(c.name) not like '%sparen%'
        and lower(c.name) not like '%saving%' and lower(c.name) not like '%übertrag%'
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- other_expenses
      round(coalesce(sum(case when t.type = 'expense'
        and lower(c.name) not like '%lebensmittel%' and lower(c.name) not like '%supermarkt%'
        and lower(c.name) not like '%food%'         and lower(c.name) not like '%groceries%'
        and lower(c.name) not like '%freizeit%'     and lower(c.name) not like '%leisure%'
        and lower(c.name) not like '%sport%'        and lower(c.name) not like '%hobby%'
        and lower(c.name) not like '%abo%'          and lower(c.name) not like '%subscription%'
        and lower(c.name) not like '%streaming%'    and lower(c.name) not like '%mitglied%'
        and lower(c.name) not like '%sparen%'       and lower(c.name) not like '%saving%'
        and lower(c.name) not like '%übertrag%'     and lower(c.name) not like '%transfer%'
        and lower(c.name) not like '%taschengeld%'  and lower(c.name) not like '%pocket%'
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- total_income
      round(coalesce(sum(case when t.type = 'income'
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2),
      -- total_expenses
      round(coalesce(sum(case when t.type = 'expense'
        then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1)) end), 0), 2)
    from transactions t
    left join categories c on c.id = t.category_id
    where t.user_id = v_uid
      and t.date >= date_trunc('month', target_date)::date
      and t.date <  (date_trunc('month', target_date) + interval '1 month')::date
      and t.type != 'transfer'
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

  end loop;

  return jsonb_build_object('ok', true, 'date', target_date, 'log', to_jsonb(v_log));
end;
$$;

-- Grant execute to service role (Edge Function uses service role key)
grant execute on function fn_take_snapshot(date) to service_role;
