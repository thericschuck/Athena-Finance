-- Rollback zu 20261029110000_net_worth_series_scope.sql: Funktion und Peer-SELECT-Policy entfernen.
-- portfolio_snapshots behaelt own_data (unveraendert). App-Code, der net_worth_series aufruft (src/lib/data/networth-reihe.ts),
-- liest dann wieder net_worth_snapshots (Fehler wird dort abgefangen). Kein begin/commit: Aufrufer stellt die Transaktion.
drop function if exists public.net_worth_series(uuid[], uuid[], boolean, date);
drop policy if exists household_portfolio_snapshots_select on public.portfolio_snapshots;
