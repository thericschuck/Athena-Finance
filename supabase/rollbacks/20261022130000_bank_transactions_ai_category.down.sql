-- Rollback zu 20261022130000_bank_transactions_ai_category.sql. Von der KI gesetzte Kategorien werden zu 'auto'
-- (sie behalten ihre Kategorie, zählen weiter nicht als gelernt); der gemerkte KI-Vorschlag geht verloren.
drop index if exists public.bank_transactions_ai_category_idx;
update public.bank_transactions set category_source = 'auto' where category_source = 'ai';
alter table public.bank_transactions drop constraint if exists bank_transactions_category_source_check;
alter table public.bank_transactions
  add constraint bank_transactions_category_source_check
  check (category_source is null or category_source in ('auto', 'manual'));
alter table public.bank_transactions drop column if exists ai_category_id;
