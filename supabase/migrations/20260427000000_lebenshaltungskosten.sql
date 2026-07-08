-- Lebenshaltungskosten module: budget_categories, budget_items, income_targets

-- ── budget_categories ──────────────────────────────────────────────────────────
create table if not exists budget_categories (
  id             uuid         primary key default gen_random_uuid(),
  name           text         not null,
  icon           text,
  monthly_budget numeric(10,2),
  sort_order     int          not null default 0,
  created_at     timestamptz  not null default now()
);

-- ── budget_items ───────────────────────────────────────────────────────────────
create table if not exists budget_items (
  id            uuid         primary key default gen_random_uuid(),
  category_id   uuid         not null references budget_categories(id) on delete cascade,
  name          text         not null,
  unit_price    numeric(10,2) not null,
  quantity      numeric(10,3) not null default 1,
  interval_days int          not null,   -- how many days this purchase/amount lasts
  notes         text,
  created_at    timestamptz  not null default now()
);

create index if not exists budget_items_category_idx on budget_items (category_id);

-- ── income_targets ─────────────────────────────────────────────────────────────
create table if not exists income_targets (
  id          uuid         primary key default gen_random_uuid(),
  label       text         not null default 'Standard',
  buffer_pct  numeric(5,2) not null default 15,
  tax_pct     numeric(5,2) not null default 30,
  savings_pct numeric(5,2) not null default 10,
  created_at  timestamptz  not null default now()
);
