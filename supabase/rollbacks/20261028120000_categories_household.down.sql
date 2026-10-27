-- Rollback zu 20261028120000_categories_household.sql: Policies auf den Live-Stand zurueck, Trigger/Funktion,
-- Override-Tabelle und categories.household_id entfernen.
-- ACHTUNG: Daten in category_tax_overrides gehen verloren (Phase 2: nur Kopie der Spalten in categories, die
-- Spalten selbst sind unveraendert -> kein Datenverlust, solange Phase 3 noch nicht live ist). household_id geht verloren.

-- categories: Original-Policy (Live-Stand 2026-10-26): own_data, ALL, public, using ((select auth.uid()) = user_id).
drop policy if exists categories_household_all on public.categories;
drop policy if exists own_data on public.categories;
create policy own_data on public.categories
  for all to public
  using ((select auth.uid()) = user_id);

drop trigger if exists trg_categories_set_household on public.categories;
drop function if exists public.categories_set_household();

drop table if exists public.category_tax_overrides;

drop index if exists public.categories_household_id_idx;
alter table public.categories drop column if exists household_id;
