/**
 * unified_transactions ist eine reine Lese-View (UNION über zwei Tabellen, nicht schreibbar), hatte
 * aber noch die Supabase-Standard-Rechte ALL für `authenticated`. Wirksam war das nie — Postgres
 * lehnt Schreibzugriffe auf eine UNION-View ab —, aber ein Recht, das nichts bewirken soll, gehört
 * nicht dorthin. Jetzt: nur SELECT, wie bei allen anderen Auswertungs-Views.
 *
 * Rollback: supabase/rollbacks/20261021170000_unified_transactions_read_only_grants.down.sql
 */
revoke all on public.unified_transactions from anon, authenticated;
grant select on public.unified_transactions to authenticated;
