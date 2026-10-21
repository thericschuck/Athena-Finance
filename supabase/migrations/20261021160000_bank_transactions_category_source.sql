/**
 * `bank_transactions.category_source` — woher die Kategorie einer Bankbuchung stammt.
 *
 *   'auto'    automatisch gesetzt (Regel oder gelernte Zuordnung beim Sync bzw. Nachziehen)
 *   'manual'  vom Nutzer gesetzt oder bestätigt
 *   NULL      keine Kategorie, oder Altbestand vor dieser Spalte (zählt wie 'manual')
 *
 * Zweck: Die gelernte Zuordnung „Gegenpartei X ist immer Kategorie Y" darf nur aus Entscheidungen
 * des Nutzers lernen. Sonst würde ein falscher Regeltreffer beim nächsten Sync als „gelernt"
 * gelten und sich selbst verstärken.
 *
 * Rollback: supabase/rollbacks/20261021160000_bank_transactions_category_source.down.sql
 */

alter table public.bank_transactions
  add column if not exists category_source text;

alter table public.bank_transactions
  drop constraint if exists bank_transactions_category_source_check;
alter table public.bank_transactions
  add constraint bank_transactions_category_source_check
  check (category_source is null or category_source in ('auto', 'manual'));

comment on column public.bank_transactions.category_source is
  'auto = Regel/gelernt beim Sync, manual = vom Nutzer gesetzt, NULL = keine Kategorie oder Altbestand (zählt wie manual).';
