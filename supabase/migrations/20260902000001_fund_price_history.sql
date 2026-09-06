-- ── Fondspreis-Historie ───────────────────────────────────────────────────────
--
-- `fund_price_cache` hält nur den aktuellen Kurs. fn_take_snapshot hat ihn mit
-- `coalesce(fpc.price, 0)` gelesen — ein leerer Cache hat damit das ganze Depot
-- auf 0 € gesetzt (passiert am 2026-03-09, Depot 1.989 € → 0 €). Genau der Fehler,
-- den `fn_asset_price_eur` für Krypto schon behebt; Fonds bekommen dieselbe Kette.

create table if not exists fund_price_history (
  isin       text        not null,
  price_date date        not null,
  price      numeric     not null check (price > 0),
  currency   text        not null default 'EUR',
  created_at timestamptz not null default now(),
  primary key (isin, price_date)
);

alter table fund_price_history enable row level security;

-- Öffentliche Kursdaten ohne Personenbezug — dieselbe Freigabe wie fund_price_cache.
drop policy if exists fund_price_history_read on fund_price_history;
create policy fund_price_history_read on fund_price_history for select using (true);
drop policy if exists fund_price_history_write_auth on fund_price_history;
create policy fund_price_history_write_auth on fund_price_history for all
  using (auth.uid() is not null);

-- Startanker, damit der Fallback ab sofort etwas zu greifen hat.
insert into fund_price_history (isin, price_date, price, currency)
select fpc.isin, coalesce(fpc.fetched_at::date, current_date), fpc.price, coalesce(fpc.currency, 'EUR')
from fund_price_cache fpc
where fpc.price > 0
on conflict (isin, price_date) do nothing;

/**
 * Fondskurs zum Stichtag, in dieser Reihenfolge:
 *   1. letzter bekannter Kurs bis zum Stichtag
 *   2. mengengewichteter Einstandspreis — „zu Anschaffungskosten" ist falsch,
 *      aber um Größenordnungen weniger falsch als 0 €
 * Gibt nur dann 0 zurück, wenn zu der ISIN überhaupt nichts bekannt ist.
 *
 * ACHTUNG: Für vergangene Stichtage ist der Einstandspreis-Fallback schlechter
 * als ein schon gespeicherter Snapshot-Wert. fn_take_snapshot fängt das ab —
 * siehe den Depot-Historien-Schutz dort.
 */
create or replace function fn_fund_price_eur(p_isin text, p_date date)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select fph.price
       from fund_price_history fph
      where fph.isin = p_isin
        and fph.price_date <= p_date
      order by fph.price_date desc
      limit 1),
    (select round(sum(dt.amount_eur) / nullif(sum(dt.shares), 0), 4)
       from depot_transactions dt
      where dt.isin = p_isin
        and dt.shares > 0),
    0);
$function$;
