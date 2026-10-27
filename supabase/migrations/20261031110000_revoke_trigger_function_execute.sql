-- HAERTUNG nach 20261031100000_household_invites.sql: Die drei IBAN-Trigger-Funktionen waren per RPC fuer anon/authenticated
-- aufrufbar (Advisor 0028/0029). Trigger-Funktionen werden nur von Triggern ausgefuehrt; EXECUTE wird nur beim CREATE TRIGGER
-- geprueft, nie beim Ausloesen. Auf der Live-DB am 2026-10-27 per apply_migration angewendet
-- (Name: revoke_trigger_function_execute); Sync-Pfad danach per rueckgerolltem Test geprueft.
-- Rueckgaengig: supabase/rollbacks/20261031110000_revoke_trigger_function_execute.down.sql
revoke all on function public.trg_accounts_iban_peer()          from public, anon, authenticated;
revoke all on function public.trg_bank_balance_peer_skip()      from public, anon, authenticated;
revoke all on function public.trg_bank_transactions_peer_skip() from public, anon, authenticated;
grant execute on function public.trg_accounts_iban_peer()          to service_role;
grant execute on function public.trg_bank_balance_peer_skip()      to service_role;
grant execute on function public.trg_bank_transactions_peer_skip() to service_role;
