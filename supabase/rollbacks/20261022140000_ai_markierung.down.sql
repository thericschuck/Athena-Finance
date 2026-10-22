-- Rollback zu 20261022140000_ai_markierung.sql.
--
-- Die zusätzlichen View-Spalten (category_source, ai_category_id) sind HARMLOS: nichts außer der Transaktionsliste
-- liest sie. Der einfachste Rollback ist deshalb, nur die neue Tabellenspalte zu entfernen. Sie ist von der View
-- nicht abhängig:
alter table public.bank_transactions drop column if exists ai_checked_at;

-- Will man die View wirklich auf den alten Stand zurücksetzen (z. B. um danach auch
-- 20261022130000_bank_transactions_ai_category.down.sql auszuführen, das ai_category_id entfernt und dafür die View
-- NICHT mehr daran hängen darf), geht das nicht per CREATE OR REPLACE, weil das keine Spalten entfernen kann. Dann:
--   1. drop view public.monthly_flow_totals; drop view public.monthly_flows; drop view public.account_balance_sums_unified;
--      drop view public.unified_transactions;
--   2. neu anlegen, jeweils mit `with (security_invoker = on)`:
--        supabase/migrations/20261022120000_own_iban_category_override.sql   (unified_transactions)
--        supabase/migrations/20261020120000_balance_and_valuation_views.sql   (account_balance_sums_unified, nur diese View daraus)
--        supabase/migrations/20261021120000_monthly_flows.sql                (monthly_flows)
--        supabase/migrations/20261021130000_monthly_flow_totals.sql          (monthly_flow_totals)
--   3. Rechte erneut: supabase/migrations/20261021170000_unified_transactions_read_only_grants.sql
--   4. supabase/tests/flows_invariants.sql ausführen; jede Zeile muss ok = true sein.
