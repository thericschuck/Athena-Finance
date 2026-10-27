-- Baseline 2026-10-26, Teil 08: Grants (nur Abweichungen vom Supabase-Default). UNGETESTET.
-- Supabase-Default (pg_default_acl fuer Rolle postgres, Schema public): neue Tabellen/Views/Sequenzen/Funktionen
-- bekommen automatisch alle Rechte fuer anon, authenticated, service_role (Funktionen: EXECUTE inkl. PUBLIC).
-- Diese Datei bildet nur die Live-Abweichungen davon ab und muss NACH allen anderen Teilen laufen.

-- Tabellen
REVOKE DELETE, TRUNCATE ON public.belege FROM anon, authenticated;                      -- live: anon/authenticated = arwxtm
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;   -- live: anon/authenticated = rxtm (nur lesen)
REVOKE ALL ON public._rls_policy_backup_20261023 FROM anon, authenticated;              -- live: nur postgres + service_role

-- Views: nur lesender Zugriff fuer authenticated, kein anon (security_invoker, RLS der Basistabellen greift)
REVOKE ALL ON public.account_balance_sums_manual, public.account_balance_sums_unified, public.asset_valuations_latest,
              public.category_tree, public.monthly_flow_totals, public.monthly_flows, public.unified_transactions
  FROM anon, authenticated;
GRANT SELECT ON public.account_balance_sums_manual, public.account_balance_sums_unified, public.asset_valuations_latest,
                public.category_tree, public.monthly_flow_totals, public.monthly_flows, public.unified_transactions
  TO authenticated;
REVOKE ALL ON public.current_net_worth FROM anon;  -- live: authenticated behaelt alle Rechte (arwdDxtm), anon keine
-- Views open_positions, robustness_status, submission_ready, valuables_current: Default (alle Rechte fuer anon/authenticated/service_role)

-- Funktionen
REVOKE EXECUTE ON FUNCTION public.balance_series(uuid, date) FROM PUBLIC, anon;         -- live: postgres, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.fn_audit() FROM PUBLIC, anon, authenticated;          -- live: postgres, service_role
REVOKE EXECUTE ON FUNCTION public.fn_recompute_account_balances(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_recompute_monthly_summary(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_snapshot_after_bank_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_take_snapshot(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_valuables_total(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_ai_conversation() FROM PUBLIC, anon, authenticated;
-- Alle uebrigen Funktionen (check_combo_guard, fn_asset_price_eur, fn_clean_bank_description, fn_ensure_linked_account,
-- fn_fund_price_eur, fn_link_bank_account, handle_new_strategy, search_ai_knowledge, search_ai_memories,
-- trg_combo_guard_fn, update_updated_at): Default (PUBLIC + anon/authenticated/service_role EXECUTE).
