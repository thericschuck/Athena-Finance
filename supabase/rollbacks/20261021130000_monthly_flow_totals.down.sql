-- Rollback zu 20261021130000_monthly_flow_totals.sql (vor 20261021140000 ausführen, falls dort
-- schon zurückgerollt wurde, in umgekehrter Reihenfolge).
drop view if exists public.monthly_flow_totals;
