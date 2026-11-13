-- Rollback zu 20261113110000_savings_plan_unique_per_month.sql: entfernt den Unique-Index wieder.
-- Danach schützt nur noch die Prüfung in supabase/functions/execute-savings-plans vor Doppelbuchungen.
drop index if exists public.depot_transactions_savings_plan_monat_uidx;
