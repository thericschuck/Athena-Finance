-- ─────────────────────────────────────────────────────────────────────────────
-- kraken_order_log — Audit-Trail für automatisiert ausgeführte Kraken-Trades
-- (Rebalancing per Knopfdruck, siehe rebalance-execution.ts).
--
-- Bewusst eine eigene, schlanke Tabelle statt der vorhandenen `positions`/
-- `trade_fills` (die gehören zum separaten Algo-Trading-Subsystem mit FKs auf
-- exchange_connections/trading_pairs/strategies — falsche Form dafür) und statt
-- `asset_audit_log` (das protokolliert manuelle Bestands-Edits, keine echten
-- Kraken-Orders).
--
-- Absichtlich OHNE Los-/FIFO-Felder: für die Krypto-Spekulationssteuer (§23
-- EStG, 1-Jahres-Haltefrist) braucht es später eine eigene Zuordnung von
-- Verkäufen zu Kauf-Losen. Diese Tabelle liefert dafür genug Rohdaten
-- (Zeitpunkt, Menge, Preis in EUR, Richtung), ohne das jetzt schon zu bauen.
create table if not exists kraken_order_log (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  -- Verweist auf die ai_pending_actions-Zeile, falls über Athena-Chat oder den
  -- Button ausgelöst (beide Wege legen eine pending_action an) — null wäre nur
  -- für einen künftigen Direkt-Trade ohne Bestätigungs-Flow denkbar, kommt in
  -- diesem Feature nicht vor, das Feld bleibt trotzdem nullable statt starr.
  pending_action_id uuid        references ai_pending_actions(id) on delete set null,
  -- Gruppiert alle Legs EINES Rebalancing-Laufs (mehrere Trades pro Klick).
  leg_group         uuid        not null,
  kraken_pair       text        not null,
  side              text        not null check (side in ('buy', 'sell')),
  order_type        text        not null default 'market',
  requested_volume  numeric     not null,
  filled_volume     numeric,
  price_eur         numeric,
  cost_eur          numeric,
  fee_eur           numeric,
  kraken_order_id   text,
  status            text        not null check (status in ('filled', 'partial', 'failed')),
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists kraken_order_log_user_idx      on kraken_order_log (user_id, created_at desc);
create index if not exists kraken_order_log_leg_group_idx on kraken_order_log (leg_group);

alter table kraken_order_log enable row level security;

create policy "Users can read own kraken order log"   on kraken_order_log for select using (auth.uid() = user_id);
create policy "Users can insert own kraken order log" on kraken_order_log for insert with check (auth.uid() = user_id);
