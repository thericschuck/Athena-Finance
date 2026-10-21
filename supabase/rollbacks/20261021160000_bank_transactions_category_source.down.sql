-- Rollback zu 20261021160000. Die Herkunft der Kategorien geht verloren; die Kategorien selbst bleiben.
alter table public.bank_transactions drop constraint if exists bank_transactions_category_source_check;
alter table public.bank_transactions drop column if exists category_source;
