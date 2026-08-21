-- depot_holdings: auto-synced securities depot positions pulled via FinTS (HKWPD),
-- e.g. a Union Investment "UnionDepot" reachable through the same login as the
-- Girokonto. Distinct from the pre-existing depot_transactions/depots tables,
-- which are for MANUALLY entered holdings — this table is a point-in-time
-- snapshot that gets overwritten (not appended to) on every sync.

create table if not exists depot_holdings (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  account_label     text,       -- human-readable label from the bank (product_name), e.g. "UnionDepot"
  account_number    text,       -- Depotnummer; may have no IBAN at all
  isin              text        not null,
  name              text,
  pieces            numeric,    -- Stückzahl / Anteile
  market_value      numeric,    -- current price per share/unit
  currency          text        not null default 'EUR',
  valuation_date    date,
  total_value       numeric,    -- pieces * market_value, as reported by the bank
  acquisition_price numeric,    -- Einstandskurs, if reported
  external_id       text        not null, -- hash of (account_number + isin) for dedup/overwrite
  fetched_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- One row per (user, account, ISIN) — re-synced snapshots overwrite in place.
create unique index if not exists depot_holdings_external_id_idx
  on depot_holdings (user_id, external_id);

create index if not exists depot_holdings_user_idx
  on depot_holdings (user_id);

alter table depot_holdings enable row level security;

create policy "Users can read own depot holdings"
  on depot_holdings for select
  using (auth.uid() = user_id);

create policy "Users can insert own depot holdings"
  on depot_holdings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own depot holdings"
  on depot_holdings for update
  using (auth.uid() = user_id);

create policy "Users can delete own depot holdings"
  on depot_holdings for delete
  using (auth.uid() = user_id);
