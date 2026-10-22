/**
 * bank_transactions: Herkunft "ai" und der Vorschlag der KI als eigene Spalte.
 *
 * `category_source`: neu 'ai' = die Kategorie hat die KI gesetzt (nach Regeln und gelernter Zuordnung).
 *   Wie 'auto' zählt sie NICHT als gelernt: sonst bestätigte sich die KI an ihren eigenen Fehlern.
 * `ai_category_id`: was die KI vorgeschlagen hat. Bleibt stehen, auch wenn der Nutzer die Kategorie später ändert
 *   (dann steht category_source = 'manual', category_id = seine Wahl). Daraus ergeben sich
 *     - die Trefferquote der KI (ai_category_id = category_id) und
 *     - "Korrekturen" (ai_category_id <> category_id), die die KI beim nächsten Mal als Beispiele bekommt.
 *
 * Rollback: supabase/rollbacks/20261022130000_bank_transactions_ai_category.down.sql
 */
alter table public.bank_transactions
  add column if not exists ai_category_id uuid references public.categories (id) on delete set null;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_category_source_check;
alter table public.bank_transactions
  add constraint bank_transactions_category_source_check
  check (category_source is null or category_source in ('auto', 'manual', 'ai'));

comment on column public.bank_transactions.ai_category_id is
  'Vorschlag der KI-Kategorisierung (bleibt nach einer Korrektur durch den Nutzer stehen; Grundlage für Trefferquote und Korrektur-Beispiele).';

create index if not exists bank_transactions_ai_category_idx
  on public.bank_transactions (user_id) where ai_category_id is not null;
