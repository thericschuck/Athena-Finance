-- Bank integration tables: bank_transactions and bank_balance

-- ── bank_transactions ──────────────────────────────────────────────────────────
create table if not exists bank_transactions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  account_iban    text        not null,
  account_bic     text,
  amount          numeric     not null,  -- positive = credit, negative = debit
  currency        text        not null default 'EUR',
  value_date      date        not null,
  entry_date      date,
  description     text,
  counterpart_name  text,
  counterpart_iban  text,
  counterpart_bic   text,
  category        text,
  raw_description text,
  external_id     text,       -- hash of (iban + value_date + amount + description) for dedup
  created_at      timestamptz not null default now()
);

-- Unique constraint for deduplication
create unique index if not exists bank_transactions_external_id_idx
  on bank_transactions (user_id, external_id)
  where external_id is not null;

-- Index for common queries
create index if not exists bank_transactions_user_date_idx
  on bank_transactions (user_id, value_date desc);

create index if not exists bank_transactions_user_iban_idx
  on bank_transactions (user_id, account_iban);

-- RLS
alter table bank_transactions enable row level security;

create policy "Users can read own transactions"
  on bank_transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on bank_transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on bank_transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on bank_transactions for delete
  using (auth.uid() = user_id);


-- ── bank_balance ───────────────────────────────────────────────────────────────
create table if not exists bank_balance (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  account_iban    text        not null,
  account_bic     text,
  account_name    text,
  booked_balance  numeric     not null default 0,
  available_balance numeric   not null default 0,
  currency        text        not null default 'EUR',
  fetched_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- One balance row per user per account (upsert on account_iban)
create unique index if not exists bank_balance_user_iban_idx
  on bank_balance (user_id, account_iban);

-- RLS
alter table bank_balance enable row level security;

create policy "Users can read own balances"
  on bank_balance for select
  using (auth.uid() = user_id);

create policy "Users can insert own balances"
  on bank_balance for insert
  with check (auth.uid() = user_id);

create policy "Users can update own balances"
  on bank_balance for update
  using (auth.uid() = user_id);

create policy "Users can delete own balances"
  on bank_balance for delete
  using (auth.uid() = user_id);
