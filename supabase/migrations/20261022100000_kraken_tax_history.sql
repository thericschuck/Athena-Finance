-- Kraken-Handelshistorie fuer die Krypto-Steuer (§ 23 EStG, FIFO).
--
-- Bisher las der Sync die Trades nur fuer einen Durchschnittspreis und verwarf sie danach (und kappte bei
-- 500). FIFO braucht jeden einzelnen Kauf und Verkauf, dauerhaft und vollstaendig. Deshalb zwei Tabellen:
--   kraken_trades  jede ausgefuehrte Order-Teilausfuehrung (TradesHistory), idempotent ueber txid
--   kraken_ledger  Ein-/Auszahlungen, Staking u. a. (Ledgers) -- erklaert Bestaende ohne Kaufhistorie
-- Betraege stehen in der Quote-Waehrung des Paares; eur_kurs ist der Faktor nach EUR (1 bei EUR-Paaren).

create table public.kraken_trades (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users on delete cascade,
  txid          text        not null,
  pair          text        not null,
  base          text        not null,
  quote         text        not null,
  side          text        not null check (side in ('buy', 'sell')),
  traded_at     timestamptz not null,
  price         numeric     not null,
  vol           numeric     not null check (vol > 0),
  cost          numeric     not null check (cost >= 0),
  fee           numeric     not null default 0 check (fee >= 0),
  -- Faktor Quote-Waehrung -> EUR. null = Quote ist weder EUR noch USD, nicht bewertbar.
  eur_kurs      numeric,
  -- true = Kurs ist nicht der vom Handelstag (USD-Paare: Kurs zum Sync-Zeitpunkt).
  eur_kurs_geschaetzt boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (user_id, txid)
);

create index kraken_trades_user_time_idx on public.kraken_trades (user_id, traded_at);

create table public.kraken_ledger (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users on delete cascade,
  ledger_id     text        not null,
  refid         text,
  type          text        not null,
  subtype       text,
  asset         text        not null,
  amount        numeric     not null,
  fee           numeric     not null default 0,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (user_id, ledger_id)
);

create index kraken_ledger_user_time_idx on public.kraken_ledger (user_id, occurred_at);

alter table public.kraken_trades enable row level security;
alter table public.kraken_ledger enable row level security;

create policy "Users can manage their own kraken trades"
  on public.kraken_trades for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own kraken ledger"
  on public.kraken_ledger for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
