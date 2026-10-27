-- Baseline 2026-10-26, Teil 06: Trigger (22 auf public.* + 1 auf auth.users). Alle live enabled (origin). UNGETESTET.
SET search_path = public;
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER ai_messages_touch_conversation AFTER INSERT ON public.ai_messages FOR EACH ROW EXECUTE FUNCTION touch_ai_conversation();
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_link_bank_account AFTER INSERT OR UPDATE ON public.bank_balance FOR EACH ROW EXECUTE FUNCTION fn_link_bank_account();
CREATE TRIGGER trg_snapshot_after_bank_sync AFTER INSERT OR UPDATE ON public.bank_balance FOR EACH STATEMENT EXECUTE FUNCTION fn_snapshot_after_bank_sync();
CREATE TRIGGER trg_audit_bank_transactions AFTER INSERT OR DELETE OR UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_belege AFTER INSERT OR DELETE OR UPDATE ON public.belege FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit_categories AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_combo_guard AFTER INSERT OR DELETE OR UPDATE ON public.combo_indicators FOR EACH ROW EXECUTE FUNCTION trg_combo_guard_fn();
CREATE TRIGGER trg_combos_updated_at BEFORE UPDATE ON public.combos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_indicators_updated_at BEFORE UPDATE ON public.indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_robustness_updated_at BEFORE UPDATE ON public.robustness_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_savings_goals_updated_at BEFORE UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_on_strategy_created AFTER INSERT ON public.strategies FOR EACH ROW EXECUTE FUNCTION handle_new_strategy();
CREATE TRIGGER trg_strategies_updated_at BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_submission_updated_at BEFORE UPDATE ON public.submission_checklist FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_audit_transactions AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger auf auth.users (Supabase-Schema, nicht public):
CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
