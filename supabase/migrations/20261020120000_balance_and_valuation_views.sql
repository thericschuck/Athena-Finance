-- Aggregations-Views statt "alle Zeilen laden und im Client summieren".
--
-- Hintergrund: PostgREST deckelt jede Antwort bei 1.000 Zeilen und liefert dabei keinen
-- Fehler (siehe src/lib/account-history.ts). Drei Lesepfade summierten bzw. dedupten
-- clientseitig und schnitten dadurch still ab:
--   - Dashboard:      alle unified_transactions -> Kontostand je Konto
--   - Konten-Seite:   alle transactions         -> Kontostand je Konto
--   - Dashboard:      alle asset_valuations     -> je Asset nur der neueste Wert
--
-- Alle Views mit security_invoker = on (wie valuables_current): die RLS des Aufrufers greift,
-- nicht die des View-Besitzers. ACHTUNG: unified_transactions selbst hat diese Option in der
-- Produktion NICHT gesetzt (siehe 20261020130000_views_security_invoker.sql); bis dahin
-- verlaesst sich account_balance_sums_unified auf den expliziten user_id-Filter der App.

-- Kontostand aus der Buchungssumme (income +, expense -, Rest neutral), exakt die Regel
-- aus computeAccountBalances() in src/lib/finance/dashboard-calc.ts.
-- tx_count zaehlt ALLE Buchungen des Kontos (auch Transfers), fuer "hat Buchungen".

create or replace view public.account_balance_sums_unified
with (security_invoker = on) as
  select
    user_id,
    account_id,
    sum(case type
          when 'income'  then  amount
          when 'expense' then -amount
          else 0::numeric
        end)            as balance,
    count(*)::integer   as tx_count
  from public.unified_transactions
  where account_id is not null
  group by user_id, account_id;

create or replace view public.account_balance_sums_manual
with (security_invoker = on) as
  select
    user_id,
    account_id,
    sum(case type
          when 'income'  then  amount
          when 'expense' then -amount
          else 0::numeric
        end)            as balance,
    count(*)::integer   as tx_count
  from public.transactions
  group by user_id, account_id;

-- Neuester Bewertungseintrag je Asset (valuation_date desc, created_at desc, wie bisher
-- im Client sortiert). asset_valuations hat kein user_id; die Eingrenzung laeuft ueber
-- asset_id und die RLS der Tabelle.

create or replace view public.asset_valuations_latest
with (security_invoker = on) as
  select distinct on (asset_id)
    asset_id,
    price_per_unit,
    total_value,
    valuation_date
  from public.asset_valuations
  order by asset_id, valuation_date desc, created_at desc;

-- Supabase vergibt auf neue Objekte in public per Default ALL an anon und authenticated.
-- Views brauchen nur Lesezugriff fuer eingeloggte Nutzer.
revoke all on public.account_balance_sums_unified from anon, authenticated;
revoke all on public.account_balance_sums_manual  from anon, authenticated;
revoke all on public.asset_valuations_latest      from anon, authenticated;
grant select on public.account_balance_sums_unified to authenticated;
grant select on public.account_balance_sums_manual  to authenticated;
grant select on public.asset_valuations_latest      to authenticated;
