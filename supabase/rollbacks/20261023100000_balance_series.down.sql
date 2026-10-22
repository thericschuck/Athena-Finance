-- Rollback zu 20261023100000_balance_series.sql. Danach muss src/lib/account-history.ts wieder seitenweise aus
-- account_balances lesen (Stand vor dieser Migration: git show HEAD~:src/lib/account-history.ts).
drop function if exists public.balance_series(uuid, date);
