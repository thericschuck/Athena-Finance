-- Rollback zu 20261023120000_fk_indexes.sql
drop index if exists public.categories_parent_id_idx;
drop index if exists public.transactions_contract_id_idx;
drop index if exists public.transactions_transfer_to_idx;
drop index if exists public.contracts_category_id_idx;
drop index if exists public.contracts_account_id_idx;
drop index if exists public.contracts_to_account_id_idx;
drop index if exists public.assets_account_id_idx;
drop index if exists public.portfolio_snapshots_asset_id_idx;
drop index if exists public.bank_transactions_ai_category_id_idx;
