-- Crypto-Tab: Preis-Robustheit + Herkunft von Assets
--
-- Hintergrund (Stand 31.08.2026):
--   `fn_take_snapshot` bewertete Krypto ausschliesslich ueber `crypto_price_cache`
--   (`coalesce(cpc.price_eur, 0)`). Diese Tabelle wird von der Edge Function
--   `daily-snapshot` befuellt, die per pg_cron OHNE Authorization-Header aufgerufen wird und
--   deshalb an `verify_jwt` scheitert -- der Cache stand seit 11.03.2026 auf genau zwei
--   Zeilen (BITCOIN, CONVEX-FINANCE). Jeder Lauf von fn_take_snapshot hat damit korrekte,
--   von der Vercel-Route geschriebene Tageskurse mit 0 ueberschrieben.
--
-- Zwei Aenderungen dagegen:
--   1. `fn_asset_price_eur()` -- gestaffelte Preisermittlung statt "Cache oder 0".
--   2. Der Upsert in `asset_valuations` stuft einen vorhandenen Preis nie mehr auf 0 zurueck.
--
-- Zusaetzlich: `assets.source` trennt vom Kraken-Sync gespiegelte Bestaende von manuell
-- gepflegten. Ohne das loescht der Prune-Schritt in `syncFromKraken()` jeden manuellen
-- Eintrag im Portfolio "Kraken" -- am 29.08.2026 sind so 463 EUR aus dem Bestand gefallen.

-- ─── 1. Herkunft von Assets ───────────────────────────────────────────────────
alter table assets
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_source_check'
  ) then
    alter table assets
      add constraint assets_source_check check (source in ('manual', 'kraken'));
  end if;
end
$$;

-- Bestehende Kraken-Spiegel-Zeilen ruecklaeufig markieren: alles, was der Sync angelegt hat,
-- traegt exchange='Kraken'. Manuelle Eintraege in einem gleichnamigen Portfolio haben das
-- Feld nicht gesetzt und bleiben damit 'manual'.
update assets set source = 'kraken'
where exchange = 'Kraken' and source = 'manual';

create index if not exists idx_assets_user_source on assets (user_id, source);

comment on column assets.source is
  'Herkunft: ''kraken'' = vom Exchange-Sync gespiegelt (darf vom Sync geloescht/ueberschrieben '
  'werden), ''manual'' = vom Nutzer gepflegt (der Sync fasst diese Zeilen nie an).';

-- ─── 2. Gestaffelte Preisermittlung ───────────────────────────────────────────
-- Reihenfolge fuer Krypto/Stablecoins:
--   a) Bewertung, die fuer DIESEN Tag schon geschrieben wurde (der Kraken-Sync laeuft alle
--      6 Stunden und liefert den Kurs der Boerse, auf der die Bestaende liegen)
--   b) frischer CoinGecko-Cache (max. 2 Tage alt, > 0)
--   c) letzter bekannter echter Kurs VOR dem Stichtag
--   d) Einstandspreis
--   e) 0
-- Fuer Depot/ETF/Aktien gewinnt der Einstandspreis, weil der sich aendern kann und dann
-- nicht von einer alten Bewertung eingefroren werden darf.
-- Fiat wird mit seinem Nennwert bewertet (EUR = 1); vorher fiel EUR immer auf 0.
create or replace function fn_asset_price_eur(
  p_asset_id uuid,
  p_symbol   text,
  p_type     text,
  p_avg      numeric,
  p_date     date
)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_type = 'fiat' then
      case when upper(coalesce(p_symbol, '')) in ('EUR', 'ZEUR') then 1 else
        coalesce(
          (select av.price_per_unit
             from asset_valuations av
            where av.asset_id = p_asset_id
              and av.valuation_date <= p_date
              and av.price_per_unit > 0
            order by av.valuation_date desc, av.created_at desc
            limit 1),
          0)
      end

    when p_type in ('crypto', 'stable') then
      coalesce(
        -- 1. Was heute schon jemand geschrieben hat (Kraken-Sync alle 6 h) -- der Kurs der
        --    Boerse, auf der die Bestaende tatsaechlich liegen.
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date = p_date
            and av.price_per_unit > 0
          order by av.created_at desc
          limit 1),
        -- 2. Frischer CoinGecko-Cache (max. 2 Tage alt).
        (select cpc.price_eur
           from crypto_price_cache cpc
          where cpc.symbol = upper(p_symbol)
            and cpc.price_eur > 0
            and cpc.updated_at > (p_date::timestamptz - interval '2 days')
          limit 1),
        -- 3. Letzter bekannter echter Kurs vor dem Stichtag.
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date < p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        nullif(p_avg, 0),
        0)

    else
      coalesce(
        nullif(p_avg, 0),
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date <= p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        0)
  end;
$$;

comment on function fn_asset_price_eur(uuid, text, text, numeric, date) is
  'EUR-Preis eines Assets zum Stichtag. Krypto gestaffelt: heutige Bewertung (Kraken-Sync) -> '
  'frischer CoinGecko-Cache -> letzter bekannter Kurs -> Einstandspreis -> 0. Verhindert, dass '
  'ein leerer crypto_price_cache eine 0-Bewertung erzeugt.';

-- ─── 3. fn_take_snapshot: Preisquelle austauschen, kein Downgrade auf 0 ───────
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
  v_stale            integer;
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
      round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
      target_date,
      a.portfolio_name,
      'cron'
    from assets a
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0;

    -- == Schritt 2b: Asset Valuations =========================================
    -- `do update` schreibt eine 0 nie ueber einen bereits vorhandenen Preis. Ohne diesen
    -- Schutz macht ein einzelner Lauf mit leerem Kurs-Cache die Tageshistorie kaputt.
    insert into asset_valuations
      (asset_id, price_per_unit, total_value, valuation_date, source)
    select
      a.id,
      round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
      round(a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
      target_date,
      case when a.type in ('crypto', 'stable') then 'coingecko' else 'manual' end
    from assets a
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0
    on conflict (asset_id, valuation_date) do update
      set price_per_unit = case when excluded.price_per_unit > 0
                                then excluded.price_per_unit
                                else asset_valuations.price_per_unit end,
          total_value    = case when excluded.price_per_unit > 0
                                then excluded.total_value
                                else asset_valuations.total_value end,
          -- Quelle nur mitziehen, wenn sich der Preis wirklich geaendert hat. Sonst haette
          -- der naechtliche Snapshot einen unveraendert durchgereichten Kraken-Kurs jedes
          -- Mal als 'coingecko' etikettiert.
          source         = case when excluded.price_per_unit > 0
                                 and excluded.price_per_unit is distinct from asset_valuations.price_per_unit
                                then excluded.source
                                else asset_valuations.source end;

    -- == Schritt 2c: Summen ===================================================
    select
      round(coalesce(sum(case when a.type in ('depot','etf','stock','fund')
                              then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2),
      round(coalesce(sum(case when a.type in ('crypto','stable')
                              then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2)
    into v_total_depot, v_total_crypto
    from assets a
    where a.user_id = v_uid
      and a.quantity is not null
      and a.quantity > 0;

    -- Wie viele Krypto-Positionen konnten gar nicht bewertet werden? Steht im Log, damit ein
    -- toter Kurs-Cache auffaellt, statt sich als stille 0 durch die Historie zu ziehen.
    select count(*) into v_stale
    from assets a
    where a.user_id = v_uid
      and a.type in ('crypto','stable')
      and a.quantity > 0
      and fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) = 0;
    if v_stale > 0 then
      v_log := v_log || format('  WARN: %s Krypto-Position(en) ohne Preis', v_stale);
    end if;

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
