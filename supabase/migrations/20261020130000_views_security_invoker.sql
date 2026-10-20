-- SICHERHEITSFIX: unified_transactions und current_net_worth liefen mit den Rechten des
-- View-Besitzers (postgres) und umgingen damit die RLS der Basistabellen. Zusammen mit dem
-- Supabase-Default-Grant SELECT an `anon` konnte jeder mit dem oeffentlichen Anon-Key alle
-- Buchungen (Haendler, Betrag, Konto) und den Nettovermoegensverlauf lesen.
-- Gemessen vor dem Fix: als anon 723 Zeilen aus unified_transactions, 2 aus current_net_worth.
--
-- Mit security_invoker = on greift die RLS des Aufrufers (wie bei valuables_current,
-- open_positions, robustness_status, submission_ready). Nach dem Fix: anon sieht 0 Zeilen,
-- der eingeloggte Nutzer weiterhin alle eigenen. Service-Role und pg_cron (postgres)
-- umgehen RLS ohnehin und sind nicht betroffen.
--
-- Rueckgaengig: alter view public.<name> set (security_invoker = off);

alter view public.unified_transactions set (security_invoker = on);
alter view public.current_net_worth    set (security_invoker = on);

-- anon braucht auf diesen Views keinerlei Zugriff.
revoke all on public.unified_transactions from anon;
revoke all on public.current_net_worth    from anon;
