-- SICHERHEITSFIX: SECURITY-DEFINER-Funktionen waren fuer anon und authenticated per
-- /rest/v1/rpc/<name> aufrufbar (Supabase-Security-Advisor 0028/0029). Sie laufen mit den
-- Rechten des Besitzers und umgehen damit die RLS - z.B. konnte jeder mit dem oeffentlichen
-- Anon-Key fn_recompute_account_balances(p_uid, ...) fuer eine beliebige User-ID anstossen.
--
-- Geprueft vor dem Entzug:
--   - App-Code (src/): kein .rpc() auf eine dieser Funktionen.
--   - Edge Functions (daily-snapshot, execute-*, fetch-fund-price): bauen ihren Client mit
--     SUPABASE_SERVICE_ROLE_KEY -> behalten EXECUTE ueber service_role.
--   - Trigger (fn_audit, fn_snapshot_after_bank_sync, handle_new_user,
--     touch_ai_conversation): Postgres prueft EXECUTE nur beim Anlegen des Triggers, nicht
--     beim Ausloesen.
--   - Interne Aufrufe (fn_take_snapshot -> fn_recompute_*, fn_snapshot_after_bank_sync ->
--     fn_take_snapshot): laufen als Besitzer postgres.
--
-- EXECUTE kommt per Default auch ueber PUBLIC; deshalb von PUBLIC mitentziehen.
-- Rueckgaengig: grant execute on function public.<name>(<args>) to <rolle>;

revoke all on function public.fn_audit()                                    from public, anon, authenticated;
revoke all on function public.fn_recompute_account_balances(uuid, date)     from public, anon, authenticated;
revoke all on function public.fn_recompute_monthly_summary(uuid, date)      from public, anon, authenticated;
revoke all on function public.fn_snapshot_after_bank_sync()                 from public, anon, authenticated;
revoke all on function public.fn_take_snapshot(date)                        from public, anon, authenticated;
revoke all on function public.fn_valuables_total(uuid, date)                from public, anon, authenticated;
revoke all on function public.handle_new_user()                             from public, anon, authenticated;
revoke all on function public.touch_ai_conversation()                       from public, anon, authenticated;

grant execute on function public.fn_recompute_account_balances(uuid, date)  to service_role;
grant execute on function public.fn_recompute_monthly_summary(uuid, date)   to service_role;
grant execute on function public.fn_take_snapshot(date)                     to service_role;
grant execute on function public.fn_valuables_total(uuid, date)             to service_role;
