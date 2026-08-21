-- Adds an optional bank_label column to the bank-integration tables, so that once
-- a second/third FinTS login is configured (e.g. a separate Union Investment or
-- Schwäbisch Hall access, see scripts/fints/README.md "Multi-bank"), rows can be
-- traced back to which login they came from. NULL/absent means the original
-- single-bank behavior (the Raiffeisenbank login) — nothing breaks for a setup
-- that never adds a second bank.

alter table bank_transactions add column if not exists bank_label text;
alter table bank_balance      add column if not exists bank_label text;
alter table depot_holdings    add column if not exists bank_label text;
