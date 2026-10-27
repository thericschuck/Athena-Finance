-- Rollback zu 20261031110000_revoke_trigger_function_execute.sql: stellt die urspruenglichen (offenen) Rechte wieder her.
grant execute on function public.trg_accounts_iban_peer()          to public, anon, authenticated;
grant execute on function public.trg_bank_balance_peer_skip()      to public, anon, authenticated;
grant execute on function public.trg_bank_transactions_peer_skip() to public, anon, authenticated;
