-- live_schema_2026-10-26.sql: Gesamtdatei = Teile in Ausfuehrungsreihenfolge (siehe README.md). UNGETESTET.

-- ===== 01a_tables.sql =====
-- Baseline 2026-10-26, Teil 01a: Sequenzen + Tabellen (A .. belege)
-- Rekonstruiert aus der Live-DB (nur lesend). UNGETESTET.
-- Constraints/FKs/Indizes folgen in 02_*.sql, RLS/Policies in 05_policies.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Live zusaetzlich: pg_stat_statements, supabase_vault, pg_cron, pg_net (plattformseitig/optional)

CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq AS bigint;

CREATE TABLE public._rls_policy_backup_20261023 (schemaname text NOT NULL, tablename text NOT NULL, policyname text NOT NULL, qual text, with_check text);
CREATE TABLE public.account_balances (id uuid DEFAULT gen_random_uuid() NOT NULL, account_id uuid NOT NULL, balance numeric(18,4) NOT NULL, currency character varying(3) NOT NULL, snapshot_date date NOT NULL, source text DEFAULT 'cron'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.accounts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, type text NOT NULL, institution text, currency character varying(3) NOT NULL, iban text, is_active boolean DEFAULT true NOT NULL, color character varying(7), sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, bank_iban text);
CREATE TABLE public.ai_conversations (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, title text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, archived_at timestamp with time zone, pinned boolean DEFAULT false NOT NULL, project_id uuid);
CREATE TABLE public.ai_files (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, conversation_id uuid, project_id uuid, pfad text NOT NULL, name text NOT NULL, media_type text NOT NULL, groesse bigint DEFAULT 0 NOT NULL, auszug text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.ai_knowledge (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, title text NOT NULL, content text NOT NULL, tags text[] DEFAULT '{}'::text[] NOT NULL, source_url text, source text DEFAULT 'user'::text NOT NULL, pinned boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('german'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(content, ''::text)))) STORED);
CREATE TABLE public.ai_logs (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, conversation_id uuid, level text DEFAULT 'info'::text NOT NULL, event text NOT NULL, message text, meta jsonb, duration_ms integer, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.ai_memories (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, key text NOT NULL, content text NOT NULL, category text DEFAULT 'general'::text NOT NULL, source text DEFAULT 'agent'::text NOT NULL, confidence real DEFAULT 1.0 NOT NULL, last_used_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('german'::regconfig, ((COALESCE(key, ''::text) || ' '::text) || COALESCE(content, ''::text)))) STORED);
CREATE TABLE public.ai_messages (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, conversation_id uuid NOT NULL, role text NOT NULL, content jsonb NOT NULL, content_text text, content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('german'::regconfig, COALESCE(content_text, ''::text))) STORED, tool_calls jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, model text, usage jsonb, finish_reason text, duration_ms integer);
CREATE TABLE public.ai_pending_actions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, conversation_id uuid, message_id uuid, action text NOT NULL, input jsonb NOT NULL, summary text NOT NULL, status text DEFAULT 'pending'::text NOT NULL, result jsonb, error text, created_at timestamp with time zone DEFAULT now() NOT NULL, resolved_at timestamp with time zone);
CREATE TABLE public.ai_projects (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, instructions text DEFAULT ''::text NOT NULL, pinned boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.ai_settings (user_id uuid NOT NULL, model text DEFAULT 'claude-opus-5'::text NOT NULL, effort text DEFAULT 'high'::text NOT NULL, web_research boolean DEFAULT true NOT NULL, memory_enabled boolean DEFAULT true NOT NULL, auto_memory boolean DEFAULT true NOT NULL, daily_message_cap integer DEFAULT 200 NOT NULL, max_steps integer DEFAULT 24 NOT NULL, custom_instructions text, updated_at timestamp with time zone DEFAULT now() NOT NULL, persona text DEFAULT 'offensiv'::text NOT NULL, persona_text text);
CREATE TABLE public.ai_tool_calls (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, conversation_id uuid NOT NULL, message_id uuid NOT NULL, tool_name text NOT NULL, input jsonb, output_summary text, is_error boolean DEFAULT false NOT NULL, duration_ms integer, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.asset_audit_log (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, asset_id uuid, asset_name text NOT NULL, asset_symbol text NOT NULL, action text NOT NULL, changes jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.asset_valuations (id uuid DEFAULT gen_random_uuid() NOT NULL, asset_id uuid NOT NULL, price_per_unit numeric(18,4) NOT NULL, total_value numeric(18,4) NOT NULL, source text DEFAULT 'cron'::text NOT NULL, valuation_date date NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.assets (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, type text NOT NULL, symbol text, quantity numeric(18,8), avg_buy_price numeric(18,4), currency character varying(3) NOT NULL, account_id uuid, exchange text, portfolio_name text, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, source text DEFAULT 'manual'::text NOT NULL);
CREATE TABLE public.audit_log (id bigint DEFAULT nextval('audit_log_id_seq'::regclass) NOT NULL, user_id uuid NOT NULL, table_name text NOT NULL, record_id uuid, action text NOT NULL, old_values jsonb, new_values jsonb, ip_address inet, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;
CREATE TABLE public.bank_balance (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, account_iban text NOT NULL, account_bic text, account_name text, booked_balance numeric DEFAULT 0 NOT NULL, available_balance numeric DEFAULT 0 NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, fetched_at timestamp with time zone DEFAULT now() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, bank_label text);
CREATE TABLE public.bank_transactions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, account_iban text NOT NULL, account_bic text, amount numeric NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, value_date date NOT NULL, entry_date date, description text, counterpart_name text, counterpart_iban text, counterpart_bic text, category text, raw_description text, external_id text, created_at timestamp with time zone DEFAULT now() NOT NULL, bank_label text, bank_reference text, category_id uuid, category_source text, ai_category_id uuid, ai_checked_at timestamp with time zone);
CREATE TABLE public.belege (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, transaction_id uuid, pfad text NOT NULL, dateiname text NOT NULL, mime text, groesse_bytes bigint, sha256 text, beleg_datum date, betrag numeric(12,2), aussteller text, notiz text, ersetzt_durch uuid, hochgeladen_am timestamp with time zone DEFAULT now() NOT NULL);

-- ===== 01b_tables.sql =====
-- Baseline 2026-10-26, Teil 01b: Tabellen (budget_categories .. exchange_connections). UNGETESTET.

CREATE TABLE public.budget_categories (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, icon text, monthly_budget numeric(10,2), sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, user_id uuid NOT NULL);
CREATE TABLE public.budget_items (id uuid DEFAULT gen_random_uuid() NOT NULL, category_id uuid NOT NULL, name text NOT NULL, unit_price numeric(10,2) NOT NULL, quantity numeric(10,3) DEFAULT 1 NOT NULL, interval_days integer NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, user_id uuid NOT NULL);
CREATE TABLE public.categories (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, parent_id uuid, type text NOT NULL, icon text, color character varying(7), budget_monthly numeric(12,2), sort_order integer DEFAULT 0 NOT NULL, tax_role text, euer_zeile integer, business_share numeric(5,2));
CREATE TABLE public.combo_indicators (id uuid DEFAULT gen_random_uuid() NOT NULL, combo_id uuid NOT NULL, indicator_id uuid NOT NULL, role text NOT NULL, settings_override text, sort_order integer DEFAULT 0 NOT NULL);
CREATE TABLE public.combos (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, asset text NOT NULL, asset_class text NOT NULL, long_condition text, short_condition text, indicator_count integer, passes_guard boolean, guard_failures text[], status text DEFAULT 'draft'::text NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.contract_executions (id uuid DEFAULT gen_random_uuid() NOT NULL, contract_id uuid NOT NULL, execution_date date NOT NULL, transaction_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.contracts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, type text NOT NULL, provider text, amount numeric(12,2) NOT NULL, currency character varying(3) NOT NULL, frequency text NOT NULL, billing_day integer, start_date date NOT NULL, end_date date, auto_renews boolean DEFAULT true NOT NULL, notice_days integer DEFAULT 30 NOT NULL, account_id uuid, category_id uuid, document_url text, is_active boolean DEFAULT true NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, to_account_id uuid);
CREATE TABLE public.crypto_price_cache (symbol text NOT NULL, price_eur numeric DEFAULT 0 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.debt_payments (id uuid DEFAULT gen_random_uuid() NOT NULL, debt_id uuid NOT NULL, amount numeric(12,2) NOT NULL, principal numeric(12,2), interest numeric(12,2), payment_date date NOT NULL, transaction_id uuid, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, bank_transaction_id uuid);
CREATE TABLE public.debts (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, type text NOT NULL, creditor text, original_amount numeric(18,2) NOT NULL, outstanding numeric(18,2) NOT NULL, currency character varying(3) NOT NULL, interest_rate numeric(6,4), monthly_payment numeric(12,2), due_date date, is_active boolean DEFAULT true NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.depot_holdings (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, account_label text, account_number text, isin text NOT NULL, name text, pieces numeric, market_value numeric, currency text DEFAULT 'EUR'::text NOT NULL, valuation_date date, total_value numeric, acquisition_price numeric, external_id text NOT NULL, fetched_at timestamp with time zone DEFAULT now() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, bank_label text);
CREATE TABLE public.depot_transactions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, isin text NOT NULL, fund_name text NOT NULL, transaction_date date NOT NULL, amount_eur numeric(12,2) NOT NULL, price_per_share numeric(12,4) NOT NULL, shares numeric(16,6) GENERATED ALWAYS AS ((amount_eur / price_per_share)) STORED, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, transaction_type text DEFAULT 'buy'::text NOT NULL);
CREATE TABLE public.depots (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, isin text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.euer_zeilen (jahr integer NOT NULL, zeile integer NOT NULL, bezeichnung text NOT NULL, art text NOT NULL, sammelzeile boolean DEFAULT false NOT NULL, quelle text NOT NULL, geprueft_am date NOT NULL);
CREATE TABLE public.exchange_connections (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, exchange text NOT NULL, label text NOT NULL, api_key text, api_secret text, is_testnet boolean DEFAULT false NOT NULL, permissions text[], last_sync_at timestamp with time zone, is_active boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

-- ===== 01c_tables.sql =====
-- Baseline 2026-10-26, Teil 01c: Tabellen (exchange_keys .. roc_positions). UNGETESTET.
-- Hinweis: Tabellen *_backup_* / _rls_policy_backup_* sind Einmal-Sicherungen, nicht zwingend noetig.

CREATE TABLE public.exchange_keys (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, exchange text NOT NULL, api_key text NOT NULL, api_secret text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fints_client_state (user_id uuid NOT NULL, bank_key text NOT NULL, bank_label text, state_blob text NOT NULL, last_sca_at timestamp with time zone, sca_required_since timestamp with time zone, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fund_price_cache (isin text NOT NULL, fund_name text NOT NULL, price numeric(12,4) NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, fetched_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fund_price_history (isin text NOT NULL, price_date date NOT NULL, price numeric NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fund_prices (id uuid DEFAULT gen_random_uuid() NOT NULL, isin text NOT NULL, fund_name text NOT NULL, price numeric(12,4) NOT NULL, price_date date NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fund_sources (isin text NOT NULL, name text NOT NULL, url text NOT NULL, xpath text NOT NULL, currency text DEFAULT 'EUR'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, ticker text);
CREATE TABLE public.income_targets (id uuid DEFAULT gen_random_uuid() NOT NULL, label text DEFAULT 'Standard'::text NOT NULL, buffer_pct numeric(5,2) DEFAULT 15 NOT NULL, tax_pct numeric(5,2) DEFAULT 30 NOT NULL, savings_pct numeric(5,2) DEFAULT 10 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, user_id uuid NOT NULL);
CREATE TABLE public.indicator_performance (id uuid DEFAULT gen_random_uuid() NOT NULL, indicator_id uuid NOT NULL, asset text NOT NULL, asset_class text NOT NULL, timeframe text NOT NULL, settings text, equity_max_dd numeric(8,4), intra_trade_dd numeric(8,4), sortino numeric(8,4), sharpe numeric(8,4), profit_factor numeric(8,4), win_rate numeric(6,4), trades integer, omega_ratio numeric(8,4), net_profit_pct numeric(10,4), cobra_green integer, cobra_red integer, test_start date, test_end date, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.indicators (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, author text NOT NULL, tv_url text, type text NOT NULL, subtype text, repaints boolean DEFAULT false NOT NULL, is_forbidden boolean DEFAULT false NOT NULL, forbidden_reason text, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, code text);
CREATE TABLE public.insights (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, type text NOT NULL, severity text DEFAULT 'info'::text NOT NULL, title text NOT NULL, body text, payload jsonb, dismissed_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.kraken_ledger (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, ledger_id text NOT NULL, refid text, type text NOT NULL, subtype text, asset text NOT NULL, amount numeric NOT NULL, fee numeric DEFAULT 0 NOT NULL, occurred_at timestamp with time zone NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.kraken_order_log (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, pending_action_id uuid, leg_group uuid NOT NULL, kraken_pair text NOT NULL, side text NOT NULL, order_type text DEFAULT 'market'::text NOT NULL, requested_volume numeric NOT NULL, filled_volume numeric, price_eur numeric, cost_eur numeric, fee_eur numeric, kraken_order_id text, status text NOT NULL, error text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.kraken_trades (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, txid text NOT NULL, pair text NOT NULL, base text NOT NULL, quote text NOT NULL, side text NOT NULL, traded_at timestamp with time zone NOT NULL, price numeric NOT NULL, vol numeric NOT NULL, cost numeric NOT NULL, fee numeric DEFAULT 0 NOT NULL, eur_kurs numeric, eur_kurs_geschaetzt boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.monthly_finance_summary (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, month date NOT NULL, total_income numeric(18,2) DEFAULT 0 NOT NULL, total_expenses numeric(18,2) DEFAULT 0 NOT NULL, net_balance numeric(18,2) GENERATED ALWAYS AS ((total_income - total_expenses)) STORED NOT NULL, salary numeric(18,2) DEFAULT 0 NOT NULL, pocket_money numeric(18,2) DEFAULT 0 NOT NULL, food numeric(18,2) DEFAULT 0 NOT NULL, leisure numeric(18,2) DEFAULT 0 NOT NULL, subscriptions numeric(18,2) DEFAULT 0 NOT NULL, savings_transfer numeric(18,2) DEFAULT 0 NOT NULL, other_income numeric(18,2) DEFAULT 0 NOT NULL, other_expenses numeric(18,2) DEFAULT 0 NOT NULL, source text DEFAULT 'cron'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.net_worth_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, snapshot_date date NOT NULL, total_checking numeric(18,2) DEFAULT 0 NOT NULL, total_savings numeric(18,2) DEFAULT 0 NOT NULL, total_depot numeric(18,2) DEFAULT 0 NOT NULL, total_bausparer numeric(18,2) DEFAULT 0 NOT NULL, total_crypto numeric(18,2) DEFAULT 0 NOT NULL, total_business numeric(18,2) DEFAULT 0 NOT NULL, total_cash numeric(18,2) DEFAULT 0 NOT NULL, total_debts numeric(18,2) DEFAULT 0 NOT NULL, source text DEFAULT 'cron'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, total_investment numeric DEFAULT 0 NOT NULL, total_assets numeric GENERATED ALWAYS AS ((((((((total_checking + total_investment) + total_savings) + total_depot) + total_bausparer) + total_crypto) + total_business) + total_cash)) STORED, net_worth numeric GENERATED ALWAYS AS (((((((((total_checking + total_investment) + total_savings) + total_depot) + total_bausparer) + total_crypto) + total_business) + total_cash) - total_debts)) STORED);
CREATE TABLE public.net_worth_snapshots_backup_20260830 (id uuid, user_id uuid, snapshot_date date, total_checking numeric(18,2), total_savings numeric(18,2), total_depot numeric(18,2), total_bausparer numeric(18,2), total_crypto numeric(18,2), total_business numeric(18,2), total_cash numeric(18,2), total_assets numeric(18,2), total_debts numeric(18,2), net_worth numeric(18,2), source text, created_at timestamp with time zone);
CREATE TABLE public.portfolio_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, asset_id uuid NOT NULL, snapshot_date date NOT NULL, quantity numeric(18,8) NOT NULL, price_eur numeric(18,4) NOT NULL, value_eur numeric(18,4) GENERATED ALWAYS AS ((quantity * price_eur)) STORED NOT NULL, portfolio_name text, source text DEFAULT 'cron'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.positions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, strategy_id uuid, exchange_id uuid NOT NULL, pair_id uuid NOT NULL, direction text NOT NULL, status text NOT NULL, entry_price numeric(18,8) NOT NULL, exit_price numeric(18,8), quantity numeric(18,8) NOT NULL, leverage numeric(6,2) DEFAULT 1.0 NOT NULL, realized_pnl numeric(18,4), fees_paid numeric(18,4) DEFAULT 0 NOT NULL, opened_at timestamp with time zone NOT NULL, closed_at timestamp with time zone, source text DEFAULT 'manual'::text NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.reports (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, type text NOT NULL, period_start date NOT NULL, period_end date NOT NULL, title text NOT NULL, html text NOT NULL, data jsonb NOT NULL, pdf_path text, generated_at timestamp with time zone DEFAULT now() NOT NULL, sent_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.robustness_tests (id uuid DEFAULT gen_random_uuid() NOT NULL, strategy_id uuid NOT NULL, test_type text NOT NULL, status text DEFAULT 'pending'::text NOT NULL, pass_count integer, fail_count integer, total_count integer, sheet_url text, notes text, tested_at date, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.roc_positions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, approach text NOT NULL, asset text NOT NULL, return_pct numeric(8,4), position_date date NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

-- ===== 01d_tables.sql =====
-- Baseline 2026-10-26, Teil 01d: Tabellen (savings_goals .. webhook_events). UNGETESTET.

CREATE TABLE public.savings_goals (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, description text NOT NULL, target_amount numeric(12,2) NOT NULL, target_date date, priority text, status text DEFAULT 'offen'::text NOT NULL, monthly_savings_rate numeric(12,2), notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, current_amount numeric DEFAULT 0 NOT NULL, savings_rate_start_date date);
CREATE TABLE public.savings_plans (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, isin text NOT NULL, fund_name text NOT NULL, monthly_amount numeric(10,2) NOT NULL, execution_day integer NOT NULL, start_date date NOT NULL, is_active boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.strategies (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, combo_id uuid, name text NOT NULL, version integer DEFAULT 1 NOT NULL, asset text NOT NULL, asset_class text NOT NULL, timeframe text NOT NULL, tv_script_url text, pine_version integer DEFAULT 6 NOT NULL, initial_capital numeric(14,2) DEFAULT 1000000 NOT NULL, process_on_close boolean DEFAULT true NOT NULL, status text DEFAULT 'development'::text NOT NULL, submission_date date, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.strategy_equity_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, strategy_id uuid NOT NULL, snapshot_date date NOT NULL, equity_value numeric(18,4) NOT NULL, net_profit_pct numeric(10,4), max_dd_at_date numeric(8,4), cobra_green integer, exchange text, notes text, source text DEFAULT 'manual'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.strategy_performance (id uuid DEFAULT gen_random_uuid() NOT NULL, strategy_id uuid NOT NULL, exchange text, test_start date DEFAULT '2018-01-01'::date NOT NULL, test_end date, equity_max_dd numeric(8,4), intra_trade_dd numeric(8,4), sortino numeric(8,4), sharpe numeric(8,4), profit_factor numeric(8,4), win_rate numeric(6,4), trades integer, omega_ratio numeric(8,4), net_profit_pct numeric(10,4), cobra_green integer, cobra_red integer, cobra_pass boolean GENERATED ALWAYS AS (((cobra_green >= 5) AND (cobra_red = 0))) STORED, screenshot_url text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.submission_checklist (id uuid DEFAULT gen_random_uuid() NOT NULL, strategy_id uuid NOT NULL, tv_script_url boolean DEFAULT false NOT NULL, indicator_desc boolean DEFAULT false NOT NULL, stats_screenshot boolean DEFAULT false NOT NULL, equity_screenshot boolean DEFAULT false NOT NULL, inputs_screenshot boolean DEFAULT false NOT NULL, robustness_sheet boolean DEFAULT false NOT NULL, repaint_tested boolean DEFAULT false NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.tax_tariffs (jahr integer NOT NULL, grundfreibetrag numeric(12,2) NOT NULL, zone2_bis numeric(12,2) NOT NULL, zone2_faktor numeric(12,2) NOT NULL, zone2_konstante numeric(12,2) NOT NULL, zone3_bis numeric(12,2) NOT NULL, zone3_faktor numeric(12,2) NOT NULL, zone3_konstante numeric(12,2) NOT NULL, zone3_sockel numeric(12,2) NOT NULL, zone4_bis numeric(12,2) NOT NULL, zone4_satz numeric(6,4) NOT NULL, zone4_abzug numeric(12,2) NOT NULL, zone5_satz numeric(6,4) NOT NULL, zone5_abzug numeric(12,2) NOT NULL, werbungskostenpauschale numeric(12,2) NOT NULL, sonderausgabenpauschale numeric(12,2) NOT NULL, soli_freigrenze numeric(12,2), kleinunternehmer_vorjahr numeric(12,2) NOT NULL, kleinunternehmer_laufend numeric(12,2) NOT NULL, quelle text NOT NULL, geprueft_am date NOT NULL);
CREATE TABLE public.tpi_daily_scores (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, tpi_type text NOT NULL, snapshot_date date NOT NULL, avg_score numeric(6,4) NOT NULL, signal text GENERATED ALWAYS AS (CASE WHEN (avg_score > 0.5) THEN 'Bullish'::text WHEN (avg_score < '-0.5'::numeric) THEN 'Bearish'::text ELSE 'Neutral'::text END) STORED NOT NULL, indicator_count integer NOT NULL, source text DEFAULT 'manual'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.tpi_entries (id uuid DEFAULT gen_random_uuid() NOT NULL, indicator_id uuid NOT NULL, signal text NOT NULL, score numeric(4,2) NOT NULL, entry_date date NOT NULL, notes text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.tpi_indicators (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, tpi_type text NOT NULL, category text NOT NULL, name text NOT NULL, source_url text, settings text, sort_order integer DEFAULT 0 NOT NULL, is_active boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.trade_fills (id uuid DEFAULT gen_random_uuid() NOT NULL, position_id uuid NOT NULL, exchange_order_id text, side text NOT NULL, price numeric(18,8) NOT NULL, quantity numeric(18,8) NOT NULL, fee numeric(18,8) DEFAULT 0 NOT NULL, fee_currency character varying(10) NOT NULL, filled_at timestamp with time zone NOT NULL, source text NOT NULL);
CREATE TABLE public.trading_pairs (id uuid DEFAULT gen_random_uuid() NOT NULL, symbol text NOT NULL, base_asset text NOT NULL, quote_asset text NOT NULL, asset_class text, exchange text, tick_size numeric, lot_size numeric);
CREATE TABLE public.transactions (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, account_id uuid NOT NULL, type text NOT NULL, category_id uuid, amount numeric(18,4) NOT NULL, currency character varying(3) NOT NULL, fx_rate numeric(18,6) DEFAULT 1.0 NOT NULL, amount_base numeric(18,4), description text, merchant text, tags text[] DEFAULT '{}'::text[] NOT NULL, transfer_to uuid, is_recurring boolean DEFAULT false NOT NULL, contract_id uuid, receipt_url text, date date NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.user_profiles (id uuid NOT NULL, display_name text, avatar_url text, timezone text DEFAULT 'Europe/Berlin'::text NOT NULL, currency character varying(3) DEFAULT 'EUR'::character varying NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.user_settings (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, key text NOT NULL, value jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.valuable_documents (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, valuable_id uuid NOT NULL, pfad text NOT NULL, name text NOT NULL, art text DEFAULT 'sonstiges'::text NOT NULL, groesse bigint, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.valuable_images (id uuid DEFAULT gen_random_uuid() NOT NULL, valuable_id uuid NOT NULL, user_id uuid NOT NULL, pfad text NOT NULL, art text DEFAULT 'foto'::text NOT NULL, ist_hauptbild boolean DEFAULT false NOT NULL, sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, prompt text, basis_bild_id uuid, hinweis text);
CREATE TABLE public.valuable_valuations (id uuid DEFAULT gen_random_uuid() NOT NULL, valuable_id uuid NOT NULL, user_id uuid NOT NULL, bewertet_am date DEFAULT CURRENT_DATE NOT NULL, wert numeric NOT NULL, quelle text DEFAULT 'manuell'::text NOT NULL, notiz text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.valuables (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, name text NOT NULL, kategorie text DEFAULT 'sonstiges'::text NOT NULL, marke text, modell text, referenz text, seriennummer text, gekauft_am date, kaufpreis numeric, kaufquelle text, waehrung character varying(3) DEFAULT 'EUR'::character varying NOT NULL, zustand text, box_vorhanden boolean DEFAULT false NOT NULL, papiere_vorhanden boolean DEFAULT false NOT NULL, lagerort text, versichert boolean DEFAULT false NOT NULL, versicherungsnummer text, notizen text, im_vermoegen boolean DEFAULT true NOT NULL, verkauft_am date, verkaufspreis numeric, is_active boolean DEFAULT true NOT NULL, sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, nutzung text DEFAULT 'regelmaessig'::text NOT NULL, wertmodus text DEFAULT 'nutzung'::text NOT NULL);
CREATE TABLE public.waitlist_signups (id uuid DEFAULT gen_random_uuid() NOT NULL, email text NOT NULL, consent boolean NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.webhook_events (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, strategy_id uuid, raw_payload jsonb NOT NULL, action text, symbol text, price numeric(18,8), processed boolean DEFAULT false NOT NULL, position_id uuid, error text, received_at timestamp with time zone DEFAULT now() NOT NULL);

-- ===== 02a_constraints.sql =====
-- Baseline 2026-10-26, Teil 02a: PRIMARY KEY / UNIQUE / CHECK. UNGETESTET.
ALTER TABLE ONLY public._rls_policy_backup_20261023 ADD CONSTRAINT _rls_policy_backup_20261023_pkey PRIMARY KEY (schemaname, tablename, policyname);
ALTER TABLE ONLY public.account_balances ADD CONSTRAINT account_balances_account_id_snapshot_date_key UNIQUE (account_id, snapshot_date);
ALTER TABLE ONLY public.account_balances ADD CONSTRAINT account_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.account_balances ADD CONSTRAINT account_balances_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'manual'::text, 'backfill'::text])));
ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_type_check CHECK ((type = ANY (ARRAY['checking'::text, 'savings'::text, 'building_savings'::text, 'investment'::text, 'crypto'::text, 'cash'::text, 'credit'::text, 'other'::text])));
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_files ADD CONSTRAINT ai_files_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_files ADD CONSTRAINT ai_files_ziel_check CHECK (((conversation_id IS NOT NULL) OR (project_id IS NOT NULL)));
ALTER TABLE ONLY public.ai_knowledge ADD CONSTRAINT ai_knowledge_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_knowledge ADD CONSTRAINT ai_knowledge_source_check CHECK ((source = ANY (ARRAY['user'::text, 'agent'::text, 'import'::text])));
ALTER TABLE ONLY public.ai_logs ADD CONSTRAINT ai_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_logs ADD CONSTRAINT ai_logs_level_check CHECK ((level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])));
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_user_id_key_key UNIQUE (user_id, key);
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_category_check CHECK ((category = ANY (ARRAY['general'::text, 'preference'::text, 'goal'::text, 'fact'::text, 'constraint'::text])));
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)));
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_source_check CHECK ((source = ANY (ARRAY['agent'::text, 'user'::text])));
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text])));
ALTER TABLE ONLY public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'executed'::text, 'rejected'::text, 'failed'::text, 'expired'::text])));
ALTER TABLE ONLY public.ai_projects ADD CONSTRAINT ai_projects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_projects ADD CONSTRAINT ai_projects_instructions_check CHECK ((char_length(instructions) <= 6000));
ALTER TABLE ONLY public.ai_projects ADD CONSTRAINT ai_projects_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_custom_instructions_len CHECK (((custom_instructions IS NULL) OR (char_length(custom_instructions) <= 6000)));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_daily_message_cap_check CHECK ((daily_message_cap > 0));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_effort_check CHECK ((effort = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'xhigh'::text, 'max'::text])));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_max_steps_check CHECK (((max_steps >= 1) AND (max_steps <= 60)));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_persona_check CHECK ((persona = ANY (ARRAY['offensiv'::text, 'schonungslos'::text, 'brutal'::text, 'sachlich'::text])));
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_persona_text_len CHECK (((persona_text IS NULL) OR (char_length(persona_text) <= 6000)));
ALTER TABLE ONLY public.ai_tool_calls ADD CONSTRAINT ai_tool_calls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.asset_audit_log ADD CONSTRAINT asset_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.asset_audit_log ADD CONSTRAINT asset_audit_log_action_check CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text])));
ALTER TABLE ONLY public.asset_valuations ADD CONSTRAINT asset_valuations_asset_id_valuation_date_key UNIQUE (asset_id, valuation_date);
ALTER TABLE ONLY public.asset_valuations ADD CONSTRAINT asset_valuations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.asset_valuations ADD CONSTRAINT asset_valuations_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'coingecko'::text, 'manual'::text, 'backfill'::text, 'kraken'::text])));
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_user_exchange_symbol_key UNIQUE (user_id, exchange, symbol);
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'kraken'::text])));
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_type_check CHECK ((type = ANY (ARRAY['crypto'::text, 'stable'::text, 'fiat'::text, 'stock'::text, 'real_estate'::text, 'cash'::text, 'other'::text])));
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE ONLY public.bank_balance ADD CONSTRAINT bank_balance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_transactions ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bank_transactions ADD CONSTRAINT bank_transactions_category_source_check CHECK (((category_source IS NULL) OR (category_source = ANY (ARRAY['auto'::text, 'manual'::text, 'ai'::text]))));
ALTER TABLE ONLY public.belege ADD CONSTRAINT belege_pfad_key UNIQUE (pfad);
ALTER TABLE ONLY public.belege ADD CONSTRAINT belege_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_categories ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.budget_items ADD CONSTRAINT budget_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_business_share_range CHECK (((business_share IS NULL) OR ((business_share >= (0)::numeric) AND (business_share <= (100)::numeric))));
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_euer_zeile_check CHECK (((euer_zeile IS NULL) OR ((euer_zeile > 0) AND (euer_zeile < 200))));
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_tax_role_check CHECK (((tax_role IS NULL) OR (tax_role = ANY (ARRAY['betriebseinnahme'::text, 'betriebsausgabe'::text, 'lohn'::text, 'privat'::text]))));
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text, 'neutral'::text])));
ALTER TABLE ONLY public.combo_indicators ADD CONSTRAINT combo_indicators_combo_id_indicator_id_key UNIQUE (combo_id, indicator_id);
ALTER TABLE ONLY public.combo_indicators ADD CONSTRAINT combo_indicators_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.combo_indicators ADD CONSTRAINT combo_indicators_role_check CHECK ((role = ANY (ARRAY['primary'::text, 'filter'::text, 'confirmation'::text])));
ALTER TABLE ONLY public.combos ADD CONSTRAINT combos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.combos ADD CONSTRAINT combos_asset_class_check CHECK ((asset_class = ANY (ARRAY['major'::text, 'alt'::text])));
ALTER TABLE ONLY public.combos ADD CONSTRAINT combos_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'testing'::text, 'passed'::text, 'failed'::text, 'archived'::text])));
ALTER TABLE ONLY public.contract_executions ADD CONSTRAINT contract_executions_contract_id_execution_date_key UNIQUE (contract_id, execution_date);
ALTER TABLE ONLY public.contract_executions ADD CONSTRAINT contract_executions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_billing_day_check CHECK (((billing_day >= 1) AND (billing_day <= 31)));
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text, 'quarterly'::text, 'biannual'::text, 'yearly'::text, 'annually'::text])));
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_type_check CHECK ((type = ANY (ARRAY['subscription'::text, 'insurance'::text, 'utility'::text, 'loan'::text, 'rental'::text, 'transfer'::text, 'savings_plan'::text, 'building_savings'::text, 'service'::text, 'other'::text])));
ALTER TABLE ONLY public.crypto_price_cache ADD CONSTRAINT crypto_price_cache_pkey PRIMARY KEY (symbol);
ALTER TABLE ONLY public.debt_payments ADD CONSTRAINT debt_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.debts ADD CONSTRAINT debts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.debts ADD CONSTRAINT debts_type_check CHECK ((type = ANY (ARRAY['borrowed'::text, 'lent'::text, 'loan'::text, 'credit_card'::text])));
ALTER TABLE ONLY public.depot_holdings ADD CONSTRAINT depot_holdings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.depot_transactions ADD CONSTRAINT depot_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.depot_transactions ADD CONSTRAINT depot_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['initial'::text, 'buy'::text, 'savings_plan'::text])));
ALTER TABLE ONLY public.depots ADD CONSTRAINT depots_user_id_isin_key UNIQUE (user_id, isin);
ALTER TABLE ONLY public.depots ADD CONSTRAINT depots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.euer_zeilen ADD CONSTRAINT euer_zeilen_pkey PRIMARY KEY (jahr, zeile);
ALTER TABLE ONLY public.euer_zeilen ADD CONSTRAINT euer_zeilen_art_check CHECK ((art = ANY (ARRAY['einnahme'::text, 'ausgabe'::text, 'summe'::text, 'ergebnis'::text])));
ALTER TABLE ONLY public.exchange_connections ADD CONSTRAINT exchange_connections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.exchange_connections ADD CONSTRAINT exchange_connections_exchange_check CHECK ((exchange = ANY (ARRAY['bybit'::text, 'binance'::text, 'kraken'::text, 'okx'::text, 'other'::text])));
ALTER TABLE ONLY public.exchange_keys ADD CONSTRAINT exchange_keys_user_id_exchange_key UNIQUE (user_id, exchange);
ALTER TABLE ONLY public.exchange_keys ADD CONSTRAINT exchange_keys_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fints_client_state ADD CONSTRAINT fints_client_state_pkey PRIMARY KEY (user_id, bank_key);
ALTER TABLE ONLY public.fund_price_cache ADD CONSTRAINT fund_price_cache_pkey PRIMARY KEY (isin);
ALTER TABLE ONLY public.fund_price_history ADD CONSTRAINT fund_price_history_pkey PRIMARY KEY (isin, price_date);
ALTER TABLE ONLY public.fund_price_history ADD CONSTRAINT fund_price_history_price_check CHECK ((price > (0)::numeric));
ALTER TABLE ONLY public.fund_prices ADD CONSTRAINT fund_prices_isin_price_date_key UNIQUE (isin, price_date);
ALTER TABLE ONLY public.fund_prices ADD CONSTRAINT fund_prices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fund_sources ADD CONSTRAINT fund_sources_pkey PRIMARY KEY (isin);
ALTER TABLE ONLY public.income_targets ADD CONSTRAINT income_targets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_indicator_id_asset_timeframe_settings_key UNIQUE (indicator_id, asset, timeframe, settings);
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_asset_class_check CHECK ((asset_class = ANY (ARRAY['major'::text, 'alt'::text])));
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_cobra_green_check CHECK (((cobra_green >= 0) AND (cobra_green <= 7)));
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_cobra_red_check CHECK (((cobra_red >= 0) AND (cobra_red <= 7)));
ALTER TABLE ONLY public.indicators ADD CONSTRAINT indicators_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indicators ADD CONSTRAINT forbidden_needs_reason CHECK (((is_forbidden = false) OR ((is_forbidden = true) AND (forbidden_reason IS NOT NULL))));
ALTER TABLE ONLY public.insights ADD CONSTRAINT insights_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.insights ADD CONSTRAINT insights_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));
ALTER TABLE ONLY public.kraken_ledger ADD CONSTRAINT kraken_ledger_user_id_ledger_id_key UNIQUE (user_id, ledger_id);
ALTER TABLE ONLY public.kraken_ledger ADD CONSTRAINT kraken_ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kraken_order_log ADD CONSTRAINT kraken_order_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kraken_order_log ADD CONSTRAINT kraken_order_log_side_check CHECK ((side = ANY (ARRAY['buy'::text, 'sell'::text])));
ALTER TABLE ONLY public.kraken_order_log ADD CONSTRAINT kraken_order_log_status_check CHECK ((status = ANY (ARRAY['filled'::text, 'partial'::text, 'failed'::text])));
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_user_id_txid_key UNIQUE (user_id, txid);
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_cost_check CHECK ((cost >= (0)::numeric));
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_fee_check CHECK ((fee >= (0)::numeric));
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_side_check CHECK ((side = ANY (ARRAY['buy'::text, 'sell'::text])));
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_vol_check CHECK ((vol > (0)::numeric));
ALTER TABLE ONLY public.monthly_finance_summary ADD CONSTRAINT monthly_finance_summary_user_id_month_key UNIQUE (user_id, month);
ALTER TABLE ONLY public.monthly_finance_summary ADD CONSTRAINT monthly_finance_summary_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.monthly_finance_summary ADD CONSTRAINT monthly_finance_summary_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'manual'::text, 'backfill'::text])));
ALTER TABLE ONLY public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);
ALTER TABLE ONLY public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'manual'::text, 'backfill'::text, 'repair'::text])));
ALTER TABLE ONLY public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_user_id_asset_id_snapshot_date_key UNIQUE (user_id, asset_id, snapshot_date);
ALTER TABLE ONLY public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_source_check CHECK ((source = ANY (ARRAY['cron'::text, 'manual'::text, 'backfill'::text])));
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_direction_check CHECK ((direction = ANY (ARRAY['long'::text, 'short'::text])));
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'webhook'::text, 'api_sync'::text])));
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'liquidated'::text])));
ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_user_id_type_period_start_key UNIQUE (user_id, type, period_start);
ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_type_check CHECK ((type = ANY (ARRAY['monthly'::text, 'annual'::text])));
ALTER TABLE ONLY public.robustness_tests ADD CONSTRAINT robustness_tests_strategy_id_test_type_key UNIQUE (strategy_id, test_type);
ALTER TABLE ONLY public.robustness_tests ADD CONSTRAINT robustness_tests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.robustness_tests ADD CONSTRAINT robustness_tests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'pass'::text, 'fail'::text, 'partial'::text])));
ALTER TABLE ONLY public.robustness_tests ADD CONSTRAINT robustness_tests_test_type_check CHECK ((test_type = ANY (ARRAY['parameter'::text, 'exchange'::text, 'timeframe'::text])));
ALTER TABLE ONLY public.roc_positions ADD CONSTRAINT roc_positions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.roc_positions ADD CONSTRAINT roc_positions_approach_check CHECK ((approach = ANY (ARRAY['Reines ETH/BTC'::text, 'Mit BTC Strat'::text, 'Mit RSI Rücksicht'::text])));
ALTER TABLE ONLY public.roc_positions ADD CONSTRAINT roc_positions_asset_check CHECK ((asset = ANY (ARRAY['BTC'::text, 'ETH'::text, 'CASH'::text])));
ALTER TABLE ONLY public.savings_goals ADD CONSTRAINT savings_goals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.savings_goals ADD CONSTRAINT savings_goals_priority_check CHECK ((priority = ANY (ARRAY['hoch'::text, 'mittel'::text, 'niedrig'::text])));
ALTER TABLE ONLY public.savings_goals ADD CONSTRAINT savings_goals_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'geschlossen'::text])));
ALTER TABLE ONLY public.savings_plans ADD CONSTRAINT savings_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.savings_plans ADD CONSTRAINT savings_plans_execution_day_check CHECK (((execution_day >= 1) AND (execution_day <= 28)));
ALTER TABLE ONLY public.strategies ADD CONSTRAINT strategies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.strategies ADD CONSTRAINT strategies_asset_class_check CHECK ((asset_class = ANY (ARRAY['major'::text, 'alt'::text])));
ALTER TABLE ONLY public.strategies ADD CONSTRAINT strategies_status_check CHECK ((status = ANY (ARRAY['development'::text, 'robustness_testing'::text, 'submitted'::text, 'slapper'::text, 'archived'::text])));
ALTER TABLE ONLY public.strategy_equity_snapshots ADD CONSTRAINT strategy_equity_snapshots_strategy_id_snapshot_date_exchang_key UNIQUE (strategy_id, snapshot_date, exchange);
ALTER TABLE ONLY public.strategy_equity_snapshots ADD CONSTRAINT strategy_equity_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.strategy_equity_snapshots ADD CONSTRAINT strategy_equity_snapshots_cobra_green_check CHECK (((cobra_green >= 0) AND (cobra_green <= 7)));
ALTER TABLE ONLY public.strategy_equity_snapshots ADD CONSTRAINT strategy_equity_snapshots_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'backfill'::text])));
ALTER TABLE ONLY public.strategy_performance ADD CONSTRAINT strategy_performance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.strategy_performance ADD CONSTRAINT strategy_performance_cobra_green_check CHECK (((cobra_green >= 0) AND (cobra_green <= 7)));
ALTER TABLE ONLY public.strategy_performance ADD CONSTRAINT strategy_performance_cobra_red_check CHECK (((cobra_red >= 0) AND (cobra_red <= 7)));
ALTER TABLE ONLY public.submission_checklist ADD CONSTRAINT submission_checklist_strategy_id_key UNIQUE (strategy_id);
ALTER TABLE ONLY public.submission_checklist ADD CONSTRAINT submission_checklist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tax_tariffs ADD CONSTRAINT tax_tariffs_pkey PRIMARY KEY (jahr);
ALTER TABLE ONLY public.tpi_daily_scores ADD CONSTRAINT tpi_daily_scores_user_id_tpi_type_snapshot_date_key UNIQUE (user_id, tpi_type, snapshot_date);
ALTER TABLE ONLY public.tpi_daily_scores ADD CONSTRAINT tpi_daily_scores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tpi_daily_scores ADD CONSTRAINT tpi_daily_scores_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'backfill'::text])));
ALTER TABLE ONLY public.tpi_daily_scores ADD CONSTRAINT tpi_daily_scores_tpi_type_check CHECK ((tpi_type = ANY (ARRAY['M-TPI'::text, 'L-TPI'::text, 'ETHBTC-TPI'::text, 'SUIETH-TPI'::text])));
ALTER TABLE ONLY public.tpi_entries ADD CONSTRAINT tpi_entries_indicator_id_entry_date_key UNIQUE (indicator_id, entry_date);
ALTER TABLE ONLY public.tpi_entries ADD CONSTRAINT tpi_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tpi_entries ADD CONSTRAINT tpi_entries_signal_check CHECK ((signal = ANY (ARRAY['Bullish'::text, 'Bearish'::text, 'Neutral'::text])));
ALTER TABLE ONLY public.tpi_indicators ADD CONSTRAINT tpi_indicators_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tpi_indicators ADD CONSTRAINT tpi_indicators_category_check CHECK ((category = ANY (ARRAY['Oscillator'::text, 'Perpetual'::text, 'Makro'::text, 'On-Chain'::text, 'Sentimental'::text, 'Fundamental'::text])));
ALTER TABLE ONLY public.tpi_indicators ADD CONSTRAINT tpi_indicators_tpi_type_check CHECK ((tpi_type = ANY (ARRAY['M-TPI'::text, 'L-TPI'::text, 'ETHBTC-TPI'::text, 'SUIETH-TPI'::text])));
ALTER TABLE ONLY public.trade_fills ADD CONSTRAINT trade_fills_exchange_order_id_position_id_key UNIQUE (exchange_order_id, position_id);
ALTER TABLE ONLY public.trade_fills ADD CONSTRAINT trade_fills_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trade_fills ADD CONSTRAINT trade_fills_side_check CHECK ((side = ANY (ARRAY['buy'::text, 'sell'::text])));
ALTER TABLE ONLY public.trade_fills ADD CONSTRAINT trade_fills_source_check CHECK ((source = ANY (ARRAY['webhook'::text, 'api_sync'::text, 'manual'::text])));
ALTER TABLE ONLY public.trading_pairs ADD CONSTRAINT trading_pairs_symbol_exchange_key UNIQUE (symbol, exchange);
ALTER TABLE ONLY public.trading_pairs ADD CONSTRAINT trading_pairs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trading_pairs ADD CONSTRAINT trading_pairs_asset_class_check CHECK ((asset_class = ANY (ARRAY['major'::text, 'alt'::text, 'stable'::text])));
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_amount_check CHECK ((amount >= (0)::numeric));
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text, 'adjustment'::text])));
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_settings ADD CONSTRAINT user_settings_user_id_key_key UNIQUE (user_id, key);
ALTER TABLE ONLY public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuable_documents ADD CONSTRAINT valuable_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuable_documents ADD CONSTRAINT valuable_documents_art_check CHECK ((art = ANY (ARRAY['beleg'::text, 'zertifikat'::text, 'rechnung'::text, 'police'::text, 'sonstiges'::text])));
ALTER TABLE ONLY public.valuable_images ADD CONSTRAINT valuable_images_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuable_images ADD CONSTRAINT valuable_images_art_check CHECK ((art = ANY (ARRAY['foto'::text, 'artwork'::text])));
ALTER TABLE ONLY public.valuable_valuations ADD CONSTRAINT valuable_valuations_valuable_id_bewertet_am_key UNIQUE (valuable_id, bewertet_am);
ALTER TABLE ONLY public.valuable_valuations ADD CONSTRAINT valuable_valuations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuables ADD CONSTRAINT valuables_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.valuables ADD CONSTRAINT valuables_nutzung_check CHECK ((nutzung = ANY (ARRAY['nie'::text, 'selten'::text, 'regelmaessig'::text, 'taeglich'::text])));
ALTER TABLE ONLY public.valuables ADD CONSTRAINT valuables_wertmodus_check CHECK ((wertmodus = ANY (ARRAY['nutzung'::text, 'stabil'::text])));
ALTER TABLE ONLY public.waitlist_signups ADD CONSTRAINT waitlist_signups_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_action_check CHECK ((action = ANY (ARRAY['buy'::text, 'sell'::text, 'close_long'::text, 'close_short'::text])));

-- ===== 03_indexes.sql =====
-- Baseline 2026-10-26, Teil 03: Indizes (ohne die, die PK/UNIQUE-Constraints aus 02a erzeugen). UNGETESTET.
CREATE INDEX idx_account_balances_date ON public.account_balances USING btree (account_id, snapshot_date DESC);
CREATE UNIQUE INDEX accounts_user_bank_iban_idx ON public.accounts USING btree (user_id, bank_iban) WHERE (bank_iban IS NOT NULL);
CREATE INDEX ai_conversations_project_idx ON public.ai_conversations USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX ai_conversations_user_created_idx ON public.ai_conversations USING btree (user_id, created_at DESC);
CREATE INDEX ai_conversations_user_updated_idx ON public.ai_conversations USING btree (user_id, updated_at DESC) WHERE (archived_at IS NULL);
CREATE INDEX ai_files_conversation_idx ON public.ai_files USING btree (conversation_id) WHERE (conversation_id IS NOT NULL);
CREATE INDEX ai_files_project_idx ON public.ai_files USING btree (project_id, created_at) WHERE (project_id IS NOT NULL);
CREATE INDEX ai_files_user_idx ON public.ai_files USING btree (user_id);
CREATE UNIQUE INDEX ai_files_user_pfad_uq ON public.ai_files USING btree (user_id, pfad);
CREATE INDEX ai_knowledge_tags_idx ON public.ai_knowledge USING gin (tags);
CREATE INDEX ai_knowledge_tsv_idx ON public.ai_knowledge USING gin (content_tsv);
CREATE INDEX ai_knowledge_user_idx ON public.ai_knowledge USING btree (user_id, updated_at DESC);
CREATE INDEX ai_logs_conversation_idx ON public.ai_logs USING btree (conversation_id, created_at);
CREATE INDEX ai_logs_level_idx ON public.ai_logs USING btree (user_id, level, created_at DESC);
CREATE INDEX ai_logs_user_created_idx ON public.ai_logs USING btree (user_id, created_at DESC);
CREATE INDEX ai_memories_tsv_idx ON public.ai_memories USING gin (content_tsv);
CREATE INDEX ai_memories_user_idx ON public.ai_memories USING btree (user_id, updated_at DESC);
CREATE INDEX ai_messages_content_tsv_idx ON public.ai_messages USING gin (content_tsv);
CREATE INDEX ai_messages_conversation_created_idx ON public.ai_messages USING btree (conversation_id, created_at);
CREATE INDEX ai_pending_actions_conversation_idx ON public.ai_pending_actions USING btree (conversation_id, created_at);
CREATE INDEX ai_pending_actions_user_status_idx ON public.ai_pending_actions USING btree (user_id, status, created_at DESC);
CREATE INDEX ai_projects_user_idx ON public.ai_projects USING btree (user_id, pinned DESC, updated_at DESC);
CREATE INDEX ai_tool_calls_conversation_idx ON public.ai_tool_calls USING btree (conversation_id, created_at);
CREATE INDEX ai_tool_calls_message_idx ON public.ai_tool_calls USING btree (message_id);
CREATE INDEX idx_asset_valuations_date ON public.asset_valuations USING btree (asset_id, valuation_date DESC);
CREATE INDEX assets_account_id_idx ON public.assets USING btree (account_id) WHERE (account_id IS NOT NULL);
CREATE INDEX idx_assets_user_source ON public.assets USING btree (user_id, source);
CREATE UNIQUE INDEX bank_balance_user_iban_idx ON public.bank_balance USING btree (user_id, account_iban);
CREATE INDEX bank_transactions_ai_category_id_idx ON public.bank_transactions USING btree (ai_category_id) WHERE (ai_category_id IS NOT NULL);
CREATE INDEX bank_transactions_ai_category_idx ON public.bank_transactions USING btree (user_id) WHERE (ai_category_id IS NOT NULL);
CREATE INDEX bank_transactions_category_id_idx ON public.bank_transactions USING btree (category_id);
CREATE UNIQUE INDEX bank_transactions_external_id_idx ON public.bank_transactions USING btree (user_id, external_id);
CREATE INDEX bank_transactions_user_date_idx ON public.bank_transactions USING btree (user_id, value_date DESC);
CREATE INDEX bank_transactions_user_iban_idx ON public.bank_transactions USING btree (user_id, account_iban);
CREATE INDEX belege_user_datum_idx ON public.belege USING btree (user_id, beleg_datum DESC);
CREATE INDEX belege_user_transaction_idx ON public.belege USING btree (user_id, transaction_id);
CREATE INDEX budget_categories_user_idx ON public.budget_categories USING btree (user_id);
CREATE INDEX budget_items_category_idx ON public.budget_items USING btree (category_id);
CREATE INDEX budget_items_user_idx ON public.budget_items USING btree (user_id);
CREATE INDEX categories_parent_id_idx ON public.categories USING btree (parent_id);
CREATE INDEX categories_user_idx ON public.categories USING btree (user_id);
CREATE INDEX contracts_account_id_idx ON public.contracts USING btree (account_id) WHERE (account_id IS NOT NULL);
CREATE INDEX contracts_category_id_idx ON public.contracts USING btree (category_id) WHERE (category_id IS NOT NULL);
CREATE INDEX contracts_to_account_id_idx ON public.contracts USING btree (to_account_id) WHERE (to_account_id IS NOT NULL);
CREATE UNIQUE INDEX debt_payments_bank_transaction_id_unique ON public.debt_payments USING btree (bank_transaction_id) WHERE (bank_transaction_id IS NOT NULL);
CREATE INDEX debt_payments_debt_id_idx ON public.debt_payments USING btree (debt_id, payment_date DESC);
CREATE UNIQUE INDEX debt_payments_transaction_id_unique ON public.debt_payments USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
CREATE UNIQUE INDEX depot_holdings_external_id_idx ON public.depot_holdings USING btree (user_id, external_id);
CREATE INDEX depot_holdings_user_idx ON public.depot_holdings USING btree (user_id);
CREATE INDEX idx_depot_transactions_isin ON public.depot_transactions USING btree (isin);
CREATE INDEX idx_depot_transactions_user_date ON public.depot_transactions USING btree (user_id, transaction_date DESC);
CREATE INDEX idx_depots_user ON public.depots USING btree (user_id);
CREATE UNIQUE INDEX euer_zeilen_eine_sammelzeile_je_art ON public.euer_zeilen USING btree (jahr, art) WHERE sammelzeile;
CREATE INDEX idx_fund_prices_isin_date ON public.fund_prices USING btree (isin, price_date);
CREATE INDEX income_targets_user_idx ON public.income_targets USING btree (user_id);
CREATE INDEX idx_indicator_perf_asset ON public.indicator_performance USING btree (indicator_id, asset);
CREATE INDEX insights_user_active_idx ON public.insights USING btree (user_id, created_at DESC) WHERE (dismissed_at IS NULL);
CREATE INDEX kraken_ledger_user_time_idx ON public.kraken_ledger USING btree (user_id, occurred_at);
CREATE INDEX kraken_order_log_leg_group_idx ON public.kraken_order_log USING btree (leg_group);
CREATE INDEX kraken_order_log_user_idx ON public.kraken_order_log USING btree (user_id, created_at DESC);
CREATE INDEX kraken_trades_user_time_idx ON public.kraken_trades USING btree (user_id, traded_at);
CREATE INDEX idx_monthly_summary_date ON public.monthly_finance_summary USING btree (user_id, month DESC);
CREATE INDEX idx_net_worth_date ON public.net_worth_snapshots USING btree (user_id, snapshot_date DESC);
CREATE INDEX idx_portfolio_snap_date ON public.portfolio_snapshots USING btree (user_id, asset_id, snapshot_date DESC);
CREATE INDEX idx_portfolio_snap_name ON public.portfolio_snapshots USING btree (user_id, portfolio_name, snapshot_date DESC);
CREATE INDEX portfolio_snapshots_asset_id_idx ON public.portfolio_snapshots USING btree (asset_id);
CREATE INDEX idx_positions_strategy ON public.positions USING btree (strategy_id);
CREATE INDEX idx_positions_user_status ON public.positions USING btree (user_id, status);
CREATE INDEX idx_roc_positions_approach ON public.roc_positions USING btree (user_id, approach, position_date DESC);
CREATE INDEX idx_savings_plans_user ON public.savings_plans USING btree (user_id);
CREATE INDEX idx_strategy_status ON public.strategies USING btree (user_id, status);
CREATE INDEX idx_equity_snap_date ON public.strategy_equity_snapshots USING btree (strategy_id, snapshot_date DESC);
CREATE INDEX idx_tpi_scores_date ON public.tpi_daily_scores USING btree (user_id, tpi_type, snapshot_date DESC);
CREATE INDEX idx_tpi_entries_date ON public.tpi_entries USING btree (indicator_id, entry_date DESC);
CREATE INDEX idx_transactions_account ON public.transactions USING btree (account_id);
CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, date DESC);
CREATE INDEX transactions_contract_id_idx ON public.transactions USING btree (contract_id) WHERE (contract_id IS NOT NULL);
CREATE INDEX transactions_transfer_to_idx ON public.transactions USING btree (transfer_to) WHERE (transfer_to IS NOT NULL);
CREATE INDEX valuable_documents_lookup_idx ON public.valuable_documents USING btree (valuable_id, created_at DESC);
CREATE INDEX valuable_images_basis_idx ON public.valuable_images USING btree (basis_bild_id) WHERE (basis_bild_id IS NOT NULL);
CREATE UNIQUE INDEX valuable_images_ein_hauptbild_idx ON public.valuable_images USING btree (valuable_id) WHERE ist_hauptbild;
CREATE INDEX valuable_images_lookup_idx ON public.valuable_images USING btree (valuable_id, sort_order, created_at);
CREATE INDEX valuable_valuations_lookup_idx ON public.valuable_valuations USING btree (valuable_id, bewertet_am DESC);
CREATE INDEX valuables_user_idx ON public.valuables USING btree (user_id, is_active);
CREATE UNIQUE INDEX waitlist_signups_email_key ON public.waitlist_signups USING btree (lower(email));
CREATE INDEX idx_webhook_processed ON public.webhook_events USING btree (user_id, processed);

-- ===== 02b_foreign_keys.sql =====
-- Baseline 2026-10-26, Teil 02b: FOREIGN KEYs (nach allen Tabellen + PK/UNIQUE). UNGETESTET.
-- Benoetigt auth.users (Supabase). Referenzen ohne Schema-Prefix loesen ueber search_path=public auf.
SET search_path = public;
ALTER TABLE ONLY public.account_balances ADD CONSTRAINT account_balances_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_project_id_fkey FOREIGN KEY (project_id) REFERENCES ai_projects(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_files ADD CONSTRAINT ai_files_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_files ADD CONSTRAINT ai_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES ai_projects(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_files ADD CONSTRAINT ai_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_knowledge ADD CONSTRAINT ai_knowledge_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_logs ADD CONSTRAINT ai_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_logs ADD CONSTRAINT ai_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_memories ADD CONSTRAINT ai_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_message_id_fkey FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_pending_actions ADD CONSTRAINT ai_pending_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_projects ADD CONSTRAINT ai_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_settings ADD CONSTRAINT ai_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_tool_calls ADD CONSTRAINT ai_tool_calls_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_tool_calls ADD CONSTRAINT ai_tool_calls_message_id_fkey FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_tool_calls ADD CONSTRAINT ai_tool_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.asset_audit_log ADD CONSTRAINT asset_audit_log_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.asset_audit_log ADD CONSTRAINT asset_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.asset_valuations ADD CONSTRAINT asset_valuations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.assets ADD CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.bank_balance ADD CONSTRAINT bank_balance_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bank_transactions ADD CONSTRAINT bank_transactions_ai_category_id_fkey FOREIGN KEY (ai_category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bank_transactions ADD CONSTRAINT bank_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bank_transactions ADD CONSTRAINT bank_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.belege ADD CONSTRAINT belege_ersetzt_durch_fkey FOREIGN KEY (ersetzt_durch) REFERENCES belege(id);
ALTER TABLE ONLY public.belege ADD CONSTRAINT belege_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.budget_categories ADD CONSTRAINT budget_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.budget_items ADD CONSTRAINT budget_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES budget_categories(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.budget_items ADD CONSTRAINT budget_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.combo_indicators ADD CONSTRAINT combo_indicators_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.combo_indicators ADD CONSTRAINT combo_indicators_indicator_id_fkey FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.combos ADD CONSTRAINT combos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contract_executions ADD CONSTRAINT contract_executions_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.debt_payments ADD CONSTRAINT debt_payments_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id);
ALTER TABLE ONLY public.debt_payments ADD CONSTRAINT debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.debt_payments ADD CONSTRAINT debt_payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.debts ADD CONSTRAINT debts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.depot_holdings ADD CONSTRAINT depot_holdings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.depot_transactions ADD CONSTRAINT depot_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.depots ADD CONSTRAINT depots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.exchange_connections ADD CONSTRAINT exchange_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.exchange_keys ADD CONSTRAINT exchange_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fints_client_state ADD CONSTRAINT fints_client_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.income_targets ADD CONSTRAINT income_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.indicator_performance ADD CONSTRAINT indicator_performance_indicator_id_fkey FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.indicators ADD CONSTRAINT indicators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.insights ADD CONSTRAINT insights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kraken_ledger ADD CONSTRAINT kraken_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kraken_order_log ADD CONSTRAINT kraken_order_log_pending_action_id_fkey FOREIGN KEY (pending_action_id) REFERENCES ai_pending_actions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.kraken_order_log ADD CONSTRAINT kraken_order_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.kraken_trades ADD CONSTRAINT kraken_trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.monthly_finance_summary ADD CONSTRAINT monthly_finance_summary_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.net_worth_snapshots ADD CONSTRAINT net_worth_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.portfolio_snapshots ADD CONSTRAINT portfolio_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_exchange_id_fkey FOREIGN KEY (exchange_id) REFERENCES exchange_connections(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_pair_id_fkey FOREIGN KEY (pair_id) REFERENCES trading_pairs(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.robustness_tests ADD CONSTRAINT robustness_tests_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.roc_positions ADD CONSTRAINT roc_positions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.savings_goals ADD CONSTRAINT savings_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.savings_plans ADD CONSTRAINT savings_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.strategies ADD CONSTRAINT fk_strategies_combo FOREIGN KEY (combo_id) REFERENCES combos(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.strategies ADD CONSTRAINT strategies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.strategy_equity_snapshots ADD CONSTRAINT strategy_equity_snapshots_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.strategy_performance ADD CONSTRAINT strategy_performance_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.submission_checklist ADD CONSTRAINT submission_checklist_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tpi_daily_scores ADD CONSTRAINT tpi_daily_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tpi_entries ADD CONSTRAINT tpi_entries_indicator_id_fkey FOREIGN KEY (indicator_id) REFERENCES tpi_indicators(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tpi_indicators ADD CONSTRAINT tpi_indicators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trade_fills ADD CONSTRAINT trade_fills_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_transfer_to_fkey FOREIGN KEY (transfer_to) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_documents ADD CONSTRAINT valuable_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_documents ADD CONSTRAINT valuable_documents_valuable_id_fkey FOREIGN KEY (valuable_id) REFERENCES valuables(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_images ADD CONSTRAINT valuable_images_basis_bild_id_fkey FOREIGN KEY (basis_bild_id) REFERENCES valuable_images(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.valuable_images ADD CONSTRAINT valuable_images_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_images ADD CONSTRAINT valuable_images_valuable_id_fkey FOREIGN KEY (valuable_id) REFERENCES valuables(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_valuations ADD CONSTRAINT valuable_valuations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuable_valuations ADD CONSTRAINT valuable_valuations_valuable_id_fkey FOREIGN KEY (valuable_id) REFERENCES valuables(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valuables ADD CONSTRAINT valuables_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_strategy_id_fkey FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.webhook_events ADD CONSTRAINT webhook_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===== 04a_functions.sql =====
-- Baseline 2026-10-26, Teil 04a: Funktionen (19 von 20; fn_take_snapshot in 04b). UNGETESTET.
-- Zeilenenden (CRLF in einigen Live-Quelltexten) auf LF normalisiert; inhaltlich unveraendert.
-- fn_recompute_account_balances referenziert View public.unified_transactions (plpgsql, Late Binding): View in 05 anlegen.

CREATE OR REPLACE FUNCTION public.balance_series(p_account_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date)
 RETURNS TABLE(account_id uuid, von date, bis date, balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with s as (
    select b.account_id, b.snapshot_date as d, b.balance,
           lag(b.snapshot_date) over w as vor_d,
           lag(b.balance) over w as vor_b
    from public.account_balances b
    where (p_account_id is null or b.account_id = p_account_id)
      and (p_from is null or b.snapshot_date >= p_from)
    window w as (partition by b.account_id order by b.snapshot_date)
  ),
  marked as (
    select s.account_id, s.d, s.balance,
           sum(case when s.vor_d is null or s.d - s.vor_d <> 1 or s.balance is distinct from s.vor_b then 1 else 0 end)
             over (partition by s.account_id order by s.d) as lauf
    from s
  )
  select m.account_id, min(m.d) as von, max(m.d) as bis, m.balance
  from marked m
  group by m.account_id, m.lauf, m.balance
  order by m.account_id, min(m.d)
$function$;

CREATE OR REPLACE FUNCTION public.check_combo_guard(p_combo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_failures  text[] := '{}';
  v_authors   text[];
  v_types     text[];
  v_count     integer;
  v_forbidden boolean;
  v_repaints  boolean;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM combo_indicators WHERE combo_id = p_combo_id;

  SELECT array_agg(author) INTO v_authors
  FROM (
    SELECT i.author, COUNT(*) as cnt
    FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id
    GROUP BY i.author
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_authors IS NOT NULL THEN
    v_failures := v_failures || ('Doppelter Author: ' || array_to_string(v_authors, ', '))::text;
  END IF;

  SELECT array_agg(type) INTO v_types
  FROM (
    SELECT i.type, COUNT(*) as cnt
    FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id
    GROUP BY i.type
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_types IS NOT NULL THEN
    v_failures := v_failures || ('Doppelter Typ: ' || array_to_string(v_types, ', '))::text;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id AND i.is_forbidden = true
  ) INTO v_forbidden;

  IF v_forbidden THEN
    v_failures := array_append(v_failures, 'Verbotener Indikator enthalten');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id AND i.repaints = true
  ) INTO v_repaints;

  IF v_repaints THEN
    v_failures := array_append(v_failures, 'Repainting-Indikator enthalten');
  END IF;

  UPDATE combos SET
    indicator_count = v_count,
    passes_guard    = (array_length(v_failures, 1) IS NULL),
    guard_failures  = CASE WHEN array_length(v_failures, 1) IS NULL THEN NULL ELSE v_failures END,
    updated_at      = now()
  WHERE id = p_combo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_asset_price_eur(p_asset_id uuid, p_symbol text, p_type text, p_avg numeric, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_type = 'fiat' then
      case when upper(coalesce(p_symbol, '')) in ('EUR', 'ZEUR') then 1 else
        coalesce(
          (select av.price_per_unit
             from asset_valuations av
            where av.asset_id = p_asset_id
              and av.valuation_date <= p_date
              and av.price_per_unit > 0
            order by av.valuation_date desc, av.created_at desc
            limit 1),
          0)
      end

    when p_type in ('crypto', 'stable') then
      coalesce(
        -- 1. Was heute schon jemand geschrieben hat (Kraken-Sync alle 6 h).
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date = p_date
            and av.price_per_unit > 0
          order by av.created_at desc
          limit 1),
        -- 2. Frischer CoinGecko-Cache (max. 2 Tage alt).
        (select cpc.price_eur
           from crypto_price_cache cpc
          where cpc.symbol = upper(p_symbol)
            and cpc.price_eur > 0
            and cpc.updated_at > (p_date::timestamptz - interval '2 days')
          limit 1),
        -- 3. Letzter bekannter echter Kurs vor dem Stichtag.
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date < p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        nullif(p_avg, 0),
        0)

    else
      coalesce(
        nullif(p_avg, 0),
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date <= p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        0)
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_id   uuid;
begin
  if TG_OP = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  v_user := coalesce(
    auth.uid(),
    case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'user_id')::uuid
         else (to_jsonb(new) ->> 'user_id')::uuid end
  );
  if v_user is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
               else (to_jsonb(new) ->> 'id')::uuid end;

  insert into public.audit_log (user_id, table_name, record_id, action, old_values, new_values)
  values (
    v_user, TG_TABLE_NAME, v_id, TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_clean_bank_description(p_text text, p_fallback text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    nullif(btrim(regexp_replace(coalesce(p_text, ''),
      '\s*(SecureGo [Pp]lus|EREF:|MREF:|CRED:|SVWZ:|ABWA:|ABWE:|IBAN:|BIC:).*$', '')), ''),
    nullif(btrim(coalesce(p_fallback, '')), ''),
    nullif(btrim(coalesce(p_text, '')), '')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_ensure_linked_account(p_user_id uuid, p_iban text, p_account_name text, p_booked_balance numeric, p_currency text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_account_id uuid;
  v_norm_iban  text := upper(replace(p_iban, ' ', ''));
begin
  select id into v_account_id from accounts
    where user_id = p_user_id and bank_iban = p_iban;

  if v_account_id is null then
    -- Match an existing manual account whose free-text iban (Girokonto's full IBAN, or
    -- Geschäftsanteile's bare Genossenschaftsanteil-Nummer) is a substring of the synced IBAN.
    select id into v_account_id from accounts
      where user_id = p_user_id
        and bank_iban is null
        and iban is not null
        and length(regexp_replace(iban, '\s', '', 'g')) > 0
        and v_norm_iban ilike '%' || upper(regexp_replace(iban, '\s', '', 'g')) || '%'
      order by created_at
      limit 1;

    if v_account_id is not null then
      update accounts set bank_iban = p_iban, updated_at = now() where id = v_account_id;
    else
      insert into accounts (user_id, name, type, iban, bank_iban, institution, currency, is_active)
      values (
        p_user_id,
        coalesce(p_account_name, 'Konto …' || right(p_iban, 4)),
        'checking',
        p_iban,
        p_iban,
        'Raiffeisenbank',
        coalesce(p_currency, 'EUR'),
        true
      )
      returning id into v_account_id;
    end if;
  end if;

  -- Keep account_balances current so fn_take_snapshot's net-worth totals pick up synced
  -- accounts automatically, without any change to that function.
  -- account_balances.source is constrained to ('cron','manual','backfill') — this counts as
  -- an automated/cron-style write, not a hand-entered one.
  insert into account_balances (account_id, snapshot_date, balance, currency, source)
  values (v_account_id, current_date, p_booked_balance, coalesce(p_currency, 'EUR'), 'cron')
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance, source = excluded.source;

  return v_account_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fund_price_eur(p_isin text, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select fph.price
       from fund_price_history fph
      where fph.isin = p_isin
        and fph.price_date <= p_date
      order by fph.price_date desc
      limit 1),
    (select round(sum(dt.amount_eur) / nullif(sum(dt.shares), 0), 4)
       from depot_transactions dt
      where dt.isin = p_isin
        and dt.shares > 0),
    0);
$function$;

CREATE OR REPLACE FUNCTION public.fn_link_bank_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform fn_ensure_linked_account(
    new.user_id, new.account_iban, new.account_name, new.booked_balance, new.currency
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_account_balances(p_uid uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer;
begin
  with mov as (
    -- Wirkung jeder Zeile auf ihr EIGENES Konto.
    select
      ut.account_id                     as acc,
      coalesce(ut.booked_date, ut.date) as d,
      ut.signed_amount                  as delta
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.account_id is not null

    union all

    -- Gegenbuchung einer MANUELLEN Umbuchung. Nur dort noetig: `transactions` speichert eine
    -- Umbuchung als eine Zeile (Abgang hier, Zugang auf transfer_to), FinTS dagegen liefert
    -- beide Seiten als eigene Buchung -- die haengen oben schon je an ihrem Konto.
    select
      ut.transfer_to,
      coalesce(ut.booked_date, ut.date),
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1))
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.source = 'manual'
      and ut.type = 'transfer'
      and ut.transfer_to is not null
  )
  insert into account_balances (account_id, balance, currency, snapshot_date, source)
  select
    a.id,
    round(case
      when bb.booked_balance is not null then bb.booked_balance - coalesce(seither.s, 0)
      else                                    coalesce(bisher.s, 0)
    end, 2),
    a.currency,
    p_date,
    'cron'
  from accounts a
  left join bank_balance bb
    on  bb.user_id       = a.user_id
    and a.bank_iban     is not null
    and bb.account_iban  = a.bank_iban
  left join lateral (
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d <= p_date
  ) bisher on true
  left join lateral (
    -- Nach dem Stichtag, aber bis heute: der Betrag, um den der Anker zu weit vorn liegt.
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d > p_date and m.d <= current_date
  ) seither on true
  where a.user_id = p_uid
    and a.is_active = true
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance,
        source  = 'cron';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_monthly_summary(p_uid uuid, p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Absichtlich leer: monthly_finance_summary ist Archiv, Summen kommen aus monthly_flows.
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_snapshot_after_bank_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform fn_take_snapshot(current_date);
  exception when others then
    raise warning 'fn_snapshot_after_bank_sync: Snapshot nicht aktualisiert (%)', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_valuables_total(p_uid uuid, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(coalesce(sum(lv.wert), 0), 2)
  from valuables v
  join lateral (
    select wert from valuable_valuations vv
    where vv.valuable_id = v.id and vv.bewertet_am <= p_date
    order by vv.bewertet_am desc limit 1
  ) lv on true
  where v.user_id = p_uid
    and v.is_active = true
    and v.im_vermoegen = true
    and (v.gekauft_am  is null or v.gekauft_am  <= p_date)
    and (v.verkauft_am is null or v.verkauft_am  > p_date);
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_strategy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO submission_checklist (strategy_id) VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_ai_knowledge(q text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, tags text[], source_url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select k.id, k.title, k.content, k.tags, k.source_url,
         ts_rank(k.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_knowledge k
   where k.user_id = auth.uid()
     and (k.content_tsv @@ websearch_to_tsquery('german', q)
          or k.title ilike '%' || q || '%')
   order by k.pinned desc, rank desc, k.updated_at desc
   limit least(max_results, 20);
$function$;

CREATE OR REPLACE FUNCTION public.search_ai_memories(q text, max_results integer DEFAULT 10)
 RETURNS TABLE(id uuid, key text, content text, category text, source text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select m.id, m.key, m.content, m.category, m.source,
         ts_rank(m.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_memories m
   where m.user_id = auth.uid()
     and (m.content_tsv @@ websearch_to_tsquery('german', q)
          or m.key ilike '%' || q || '%'
          or m.content ilike '%' || q || '%')
   order by rank desc, m.updated_at desc
   limit least(max_results, 30);
$function$;

CREATE OR REPLACE FUNCTION public.touch_ai_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update ai_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_combo_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM check_combo_guard(OLD.combo_id);
  ELSE
    PERFORM check_combo_guard(NEW.combo_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ===== 04b_fn_take_snapshot.sql =====
-- Baseline 2026-10-26, Teil 04b: fn_take_snapshot (Funktion 20 von 20). UNGETESTET.
CREATE OR REPLACE FUNCTION public.fn_take_snapshot(target_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid              uuid;
  v_hist             boolean;
  v_depot_alt        numeric;
  v_total_checking   numeric;
  v_total_investment numeric;
  v_total_savings    numeric;
  v_total_cash       numeric;
  v_total_bausparer  numeric;
  v_total_business   numeric;
  v_total_debts      numeric;
  v_total_depot      numeric;
  v_depot_fonds      numeric;
  v_total_crypto     numeric;
  v_total_assets     numeric;
  v_net_worth        numeric;
  v_bal_rows         integer;
  v_stale            integer;
  v_unbekannt        integer;
  v_log              text[] := array[]::text[];
begin
  if target_date >= current_date then
    insert into fund_price_history (isin, price_date, price, currency)
    select fpc.isin, target_date, fpc.price, coalesce(fpc.currency, 'EUR')
    from fund_price_cache fpc
    where fpc.price > 0
    on conflict (isin, price_date) do update set price = excluded.price;
  end if;

  for v_uid in select id from auth.users loop
    v_log := v_log || format('-- %s --', v_uid);

    v_bal_rows := fn_recompute_account_balances(v_uid, target_date);
    v_log := v_log || format('  account_balances: %s Zeilen', v_bal_rows);

    select target_date < current_date
       and exists (select 1 from portfolio_snapshots ps
                    where ps.user_id = v_uid and ps.snapshot_date = target_date)
      into v_hist;

    if v_hist then
      v_log := v_log || 'Positionen: Historie vorhanden, wird nicht ueberschrieben'::text;
    else
      delete from portfolio_snapshots
      where user_id = v_uid and snapshot_date = target_date;

      insert into portfolio_snapshots
        (asset_id, user_id, quantity, price_eur, snapshot_date, portfolio_name, source)
      select
        a.id, v_uid, a.quantity,
        round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        target_date, a.portfolio_name, 'cron'
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0;

      insert into asset_valuations
        (asset_id, price_per_unit, total_value, valuation_date, source)
      select
        a.id,
        round(fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        round(a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date), 2),
        target_date,
        case when a.type in ('crypto', 'stable') then 'coingecko' else 'manual' end
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0
      on conflict (asset_id, valuation_date) do update
        set price_per_unit = case when excluded.price_per_unit > 0
                                  then excluded.price_per_unit
                                  else asset_valuations.price_per_unit end,
            total_value    = case when excluded.price_per_unit > 0
                                  then excluded.total_value
                                  else asset_valuations.total_value end,
            source         = case when excluded.price_per_unit > 0
                                   and excluded.price_per_unit is distinct from asset_valuations.price_per_unit
                                  then excluded.source
                                  else asset_valuations.source end;
    end if;

    if v_hist then
      select
        round(coalesce(sum(case when a.type = 'stock' then ps.quantity * ps.price_eur end), 0), 2),
        round(coalesce(sum(case when a.type in ('crypto','stable','fiat') then ps.quantity * ps.price_eur end), 0), 2)
      into v_total_depot, v_total_crypto
      from portfolio_snapshots ps
      join assets a on a.id = ps.asset_id
      where ps.user_id = v_uid and ps.snapshot_date = target_date;
    else
      select
        round(coalesce(sum(case when a.type = 'stock'
                                then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2),
        round(coalesce(sum(case when a.type in ('crypto','stable','fiat')
                                then a.quantity * fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) end), 0), 2)
      into v_total_depot, v_total_crypto
      from assets a
      where a.user_id = v_uid and a.quantity is not null and a.quantity > 0;
    end if;

    select count(*) into v_stale
    from assets a
    where a.user_id = v_uid and a.type in ('crypto','stable') and a.quantity > 0
      and fn_asset_price_eur(a.id, a.symbol, a.type, a.avg_buy_price, target_date) = 0;
    if v_stale > 0 then
      v_log := v_log || format('  WARN: %s Krypto-Position(en) ohne Preis', v_stale);
    end if;

    select count(*) into v_unbekannt
    from assets a
    where a.user_id = v_uid and a.quantity > 0
      and a.type not in ('crypto','stable','fiat','stock');
    if v_unbekannt > 0 then
      v_log := v_log || format('  WARN: %s Position(en) ohne Vermoegens-Bucket', v_unbekannt);
    end if;

    select round(coalesce(sum(dt.shares * fn_fund_price_eur(dt.isin, target_date)), 0), 2)
    into   v_depot_fonds
    from   depot_transactions dt
    where  dt.user_id = v_uid
      and  dt.transaction_date <= target_date;

    v_total_depot := coalesce(v_total_depot, 0) + coalesce(v_depot_fonds, 0);

    -- Vergangener Tag ohne echte Kursquelle: gespeicherten Wert behalten.
    if target_date < current_date then
      select nws.total_depot into v_depot_alt
      from net_worth_snapshots nws
      where nws.user_id = v_uid and nws.snapshot_date = target_date;

      if v_depot_alt is not null and exists (
           select 1
           from depot_transactions dt
           where dt.user_id = v_uid
             and dt.transaction_date <= target_date
             and not exists (select 1 from fund_price_history fph
                              where fph.isin = dt.isin and fph.price_date <= target_date))
      then
        v_total_depot := v_depot_alt;
        v_log := v_log || 'Depot: keine Kurshistorie zum Stichtag, Altwert bleibt'::text;
      end if;
    end if;

    select
      round(coalesce(sum(case when a.type = 'checking'         then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'investment'       then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'savings'          then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type in ('cash','other')  then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'building_savings' then coalesce(ab.balance, 0) end), 0), 2),
      round(coalesce(sum(case when a.type = 'credit'           then abs(coalesce(ab.balance, 0)) end), 0), 2)
    into
      v_total_checking, v_total_investment, v_total_savings,
      v_total_cash, v_total_bausparer, v_total_debts
    from accounts a
    left join account_balances ab on ab.account_id = a.id and ab.snapshot_date = target_date
    where a.user_id = v_uid and a.is_active = true;

    select v_total_crypto + round(coalesce(sum(coalesce(ab.balance, 0)), 0), 2)
    into   v_total_crypto
    from accounts a
    left join account_balances ab on ab.account_id = a.id and ab.snapshot_date = target_date
    where a.user_id = v_uid and a.is_active = true and a.type = 'crypto';

    v_total_business := 0;

    v_total_assets := round(
      coalesce(v_total_checking,0) + coalesce(v_total_investment,0) + coalesce(v_total_savings,0) +
      coalesce(v_total_cash,0) + coalesce(v_total_bausparer,0) + coalesce(v_total_business,0) +
      coalesce(v_total_depot,0) + coalesce(v_total_crypto,0), 2);
    v_net_worth := round(v_total_assets - coalesce(v_total_debts, 0), 2);

    insert into net_worth_snapshots (
      user_id, snapshot_date, source,
      total_checking, total_investment, total_savings, total_cash, total_bausparer,
      total_business, total_debts, total_depot, total_crypto
    ) values (
      v_uid, target_date, 'cron',
      coalesce(v_total_checking,0), coalesce(v_total_investment,0), coalesce(v_total_savings,0),
      coalesce(v_total_cash,0), coalesce(v_total_bausparer,0), coalesce(v_total_business,0),
      coalesce(v_total_debts,0), coalesce(v_total_depot,0), coalesce(v_total_crypto,0)
    )
    on conflict (user_id, snapshot_date) do update set
      total_checking   = excluded.total_checking,
      total_investment = excluded.total_investment,
      total_savings    = excluded.total_savings,
      total_cash       = excluded.total_cash,
      total_bausparer  = excluded.total_bausparer,
      total_business   = excluded.total_business,
      total_debts      = excluded.total_debts,
      total_depot      = excluded.total_depot,
      total_crypto     = excluded.total_crypto,
      source           = 'cron'
    where net_worth_snapshots.source <> 'repair';

    v_log := v_log || format('  net_worth: EUR %s  (assets %s, debts %s, depot %s, crypto %s, investment %s)',
      v_net_worth, v_total_assets, v_total_debts, v_total_depot, v_total_crypto, v_total_investment);

    perform fn_recompute_monthly_summary(v_uid, target_date);
    v_log := v_log || format('  monthly_summary [%s]: ok', to_char(target_date, 'YYYY-MM'));
  end loop;

  return jsonb_build_object('ok', true, 'date', target_date, 'log', to_jsonb(v_log));
end;
$function$;

-- ===== 05_views.sql =====
-- Baseline 2026-10-26, Teil 05: Views (12), Abhaengigkeitsreihenfolge, security_invoker wie live. UNGETESTET.
-- Abhaengigkeiten: category_tree -> unified_transactions -> monthly_flows -> monthly_flow_totals;
--                  unified_transactions -> account_balance_sums_unified.
-- Grants/RLS: Views erben bei security_invoker die RLS der Basistabellen.

CREATE VIEW public.category_tree WITH (security_invoker = on) AS
 WITH RECURSIVE tree AS (
         SELECT c.id,
            c.user_id,
            c.name,
            c.parent_id,
            c.type,
            c.id AS root_id,
            c.name AS root_name,
            0 AS depth,
            c.name AS path,
            c.tax_role AS tax_role_effective,
            c.euer_zeile AS euer_zeile_effective,
            ARRAY[c.id] AS seen
           FROM categories c
          WHERE c.parent_id IS NULL OR NOT (EXISTS ( SELECT 1
                   FROM categories p
                  WHERE p.id = c.parent_id))
        UNION ALL
         SELECT c.id,
            c.user_id,
            c.name,
            c.parent_id,
            c.type,
            t.root_id,
            t.root_name,
            t.depth + 1,
            (t.path || ' > '::text) || c.name,
            COALESCE(c.tax_role, t.tax_role_effective) AS "coalesce",
            COALESCE(c.euer_zeile, t.euer_zeile_effective) AS "coalesce",
            t.seen || c.id
           FROM categories c
             JOIN tree t ON c.parent_id = t.id
          WHERE NOT (c.id = ANY (t.seen))
        )
 SELECT tree.id,
    tree.user_id,
    tree.name,
    tree.parent_id,
    tree.type,
    tree.root_id,
    tree.root_name,
    tree.depth,
    tree.path,
    tree.tax_role_effective,
    tree.euer_zeile_effective
   FROM tree
UNION ALL
 SELECT c.id,
    c.user_id,
    c.name,
    c.parent_id,
    c.type,
    c.id AS root_id,
    c.name AS root_name,
    0 AS depth,
    c.name AS path,
    c.tax_role AS tax_role_effective,
    c.euer_zeile AS euer_zeile_effective
   FROM categories c
  WHERE NOT (EXISTS ( SELECT 1
           FROM tree t
          WHERE t.id = c.id));

CREATE VIEW public.unified_transactions WITH (security_invoker = on) AS
 WITH ct AS MATERIALIZED (
         SELECT category_tree.id,
            category_tree.root_id,
            category_tree.root_name,
            category_tree.path,
            category_tree.tax_role_effective,
            category_tree.euer_zeile_effective
           FROM category_tree
        )
 SELECT id,
    user_id,
    account_id,
    account_name,
    account_color,
    category_id,
    category_name,
    category_color,
    date,
    type,
    amount,
    amount_base,
    fx_rate,
    currency,
    description,
    merchant,
    transfer_to,
    contract_id,
    tags,
    source,
    category_type,
    signed_amount,
    booked_date,
    description_raw,
    flow_kind,
    amount_eur,
    root_category_id,
    root_category_name,
    category_path,
    tax_role_effective,
    euer_zeile_effective,
    flow_kind = ANY (ARRAY['echt'::text, 'anlage'::text, 'forderung'::text]) AS counts_in_flow,
    category_source,
    ai_category_id
   FROM ( SELECT t.id,
            t.user_id,
            t.account_id,
            a.name AS account_name,
            a.color AS account_color,
            t.category_id,
            c.name AS category_name,
            c.color AS category_color,
            t.date,
            t.type,
            t.amount,
            t.amount_base,
            t.fx_rate,
            t.currency,
            t.description,
            t.merchant,
            t.transfer_to,
            t.contract_id,
            t.tags,
            'manual'::text AS source,
            c.type AS category_type,
                CASE
                    WHEN t.type = 'income'::text THEN COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    WHEN t.type = 'expense'::text THEN - COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    WHEN t.type = 'transfer'::text THEN - COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    ELSE 0::numeric
                END AS signed_amount,
            t.date AS booked_date,
            t.description AS description_raw,
                CASE
                    WHEN t.type = 'transfer'::text THEN 'umbuchung'::text
                    WHEN t.description ~~* 'alter kontostand%'::text THEN 'anfangsbestand'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) = 'Schulden'::text THEN 'forderung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) <> 'Transfers'::text THEN 'anlage'::text
                    ELSE 'echt'::text
                END AS flow_kind,
            abs(COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))) AS amount_eur,
            ct.root_id AS root_category_id,
            ct.root_name AS root_category_name,
            ct.path AS category_path,
            ct.tax_role_effective,
            ct.euer_zeile_effective,
            NULL::text AS category_source,
            NULL::uuid AS ai_category_id
           FROM transactions t
             LEFT JOIN accounts a ON a.id = t.account_id
             LEFT JOIN categories c ON c.id = t.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             LEFT JOIN ct ON ct.id = t.category_id
        UNION ALL
         SELECT bt.id,
            bt.user_id,
            a.id AS account_id,
            a.name AS account_name,
            a.color AS account_color,
            bt.category_id,
            c.name AS category_name,
            c.color AS category_color,
            bt.value_date AS date,
                CASE
                    WHEN own.id IS NOT NULL AND COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN 'transfer'::text
                    WHEN bt.amount >= 0::numeric THEN 'income'::text
                    ELSE 'expense'::text
                END AS type,
            abs(bt.amount) AS amount,
            abs(bt.amount) AS amount_base,
            1::numeric AS fx_rate,
            bt.currency,
            fn_clean_bank_description(COALESCE(bt.description, bt.raw_description), bt.counterpart_name) AS description,
            bt.counterpart_name AS merchant,
                CASE
                    WHEN COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN own.id
                    ELSE NULL::uuid
                END AS transfer_to,
            NULL::uuid AS contract_id,
            '{}'::text[] AS tags,
            'bank_sync'::text AS source,
            c.type AS category_type,
            bt.amount AS signed_amount,
            COALESCE(bt.entry_date, bt.value_date) AS booked_date,
            COALESCE(bt.description, bt.raw_description) AS description_raw,
                CASE
                    WHEN own.id IS NOT NULL AND COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN 'umbuchung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) = 'Schulden'::text THEN 'forderung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) <> 'Transfers'::text THEN 'anlage'::text
                    ELSE 'echt'::text
                END AS flow_kind,
            abs(bt.amount) AS amount_eur,
            ct.root_id AS root_category_id,
            ct.root_name AS root_category_name,
            ct.path AS category_path,
            ct.tax_role_effective,
            ct.euer_zeile_effective,
            bt.category_source,
            bt.ai_category_id
           FROM bank_transactions bt
             JOIN accounts a ON a.user_id = bt.user_id AND a.bank_iban = bt.account_iban
             LEFT JOIN categories c ON c.id = bt.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             LEFT JOIN accounts own ON own.user_id = bt.user_id AND own.bank_iban = bt.counterpart_iban
             LEFT JOIN ct ON ct.id = bt.category_id) u;

CREATE VIEW public.monthly_flows WITH (security_invoker = on) AS
 SELECT user_id,
    date_trunc('month'::text, date::timestamp with time zone)::date AS month,
    account_id,
    source,
    flow_kind,
    category_id,
    category_name,
    root_category_id,
    root_category_name,
    tax_role_effective,
    COALESCE(sum(amount_eur) FILTER (WHERE type = 'income'::text), 0::numeric) AS income,
    COALESCE(sum(amount_eur) FILTER (WHERE type = 'expense'::text), 0::numeric) AS expense,
    count(*)::integer AS tx_count
   FROM unified_transactions
  WHERE counts_in_flow
  GROUP BY user_id, (date_trunc('month'::text, date::timestamp with time zone)::date), account_id, source, flow_kind, category_id, category_name, root_category_id, root_category_name, tax_role_effective;

CREATE VIEW public.monthly_flow_totals WITH (security_invoker = on) AS
 SELECT user_id,
    month,
    sum(income) AS income,
    sum(expense) AS expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'echt'::text), 0::numeric) AS echt_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'echt'::text), 0::numeric) AS echt_expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'anlage'::text), 0::numeric) AS anlage_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'anlage'::text), 0::numeric) AS anlage_expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'forderung'::text), 0::numeric) AS forderung_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'forderung'::text), 0::numeric) AS forderung_expense,
    sum(tx_count)::integer AS tx_count
   FROM monthly_flows
  GROUP BY user_id, month;

CREATE VIEW public.account_balance_sums_unified WITH (security_invoker = on) AS
 SELECT user_id,
    account_id,
    sum(delta) AS balance,
    count(*) FILTER (WHERE eigen)::integer AS tx_count
   FROM ( SELECT u.user_id,
            u.account_id,
            true AS eigen,
                CASE u.type
                    WHEN 'income'::text THEN u.amount
                    WHEN 'expense'::text THEN - u.amount
                    WHEN 'transfer'::text THEN u.signed_amount
                    ELSE 0::numeric
                END AS delta
           FROM unified_transactions u
          WHERE u.account_id IS NOT NULL
        UNION ALL
         SELECT u.user_id,
            u.transfer_to,
            false,
            u.amount
           FROM unified_transactions u
          WHERE u.source = 'manual'::text AND u.type = 'transfer'::text AND u.transfer_to IS NOT NULL) m
  GROUP BY user_id, account_id;

CREATE VIEW public.account_balance_sums_manual WITH (security_invoker = on) AS
 SELECT user_id,
    account_id,
    sum(delta) AS balance,
    count(*) FILTER (WHERE eigen)::integer AS tx_count
   FROM ( SELECT t.user_id,
            t.account_id,
            true AS eigen,
                CASE t.type
                    WHEN 'income'::text THEN t.amount
                    WHEN 'expense'::text THEN - t.amount
                    WHEN 'transfer'::text THEN - t.amount
                    ELSE 0::numeric
                END AS delta
           FROM transactions t
          WHERE t.account_id IS NOT NULL
        UNION ALL
         SELECT t.user_id,
            t.transfer_to,
            false,
            t.amount
           FROM transactions t
          WHERE t.type = 'transfer'::text AND t.transfer_to IS NOT NULL) m
  GROUP BY user_id, account_id;

CREATE VIEW public.asset_valuations_latest WITH (security_invoker = on) AS
 SELECT DISTINCT ON (asset_id) asset_id,
    price_per_unit,
    total_value,
    valuation_date
   FROM asset_valuations
  ORDER BY asset_id, valuation_date DESC, created_at DESC;

CREATE VIEW public.current_net_worth WITH (security_invoker = on) AS
 SELECT DISTINCT ON (user_id) user_id,
    snapshot_date,
    net_worth,
    total_assets,
    total_debts,
    total_crypto,
    total_depot
   FROM net_worth_snapshots
  ORDER BY user_id, snapshot_date DESC;

CREATE VIEW public.open_positions WITH (security_invoker = true) AS
 SELECT p.id,
    p.user_id,
    p.strategy_id,
    p.exchange_id,
    p.pair_id,
    p.direction,
    p.status,
    p.entry_price,
    p.exit_price,
    p.quantity,
    p.leverage,
    p.realized_pnl,
    p.fees_paid,
    p.opened_at,
    p.closed_at,
    p.source,
    p.notes,
    p.created_at,
    p.updated_at,
    tp.symbol,
    tp.base_asset,
    s.name AS strategy_name
   FROM positions p
     JOIN trading_pairs tp ON tp.id = p.pair_id
     LEFT JOIN strategies s ON s.id = p.strategy_id
  WHERE p.status = 'open'::text;

CREATE VIEW public.robustness_status WITH (security_invoker = true) AS
 SELECT s.id AS strategy_id,
    s.name,
    max(
        CASE
            WHEN rt.test_type = 'parameter'::text THEN rt.status
            ELSE NULL::text
        END) AS parameter_test,
    max(
        CASE
            WHEN rt.test_type = 'exchange'::text THEN rt.status
            ELSE NULL::text
        END) AS exchange_test,
    max(
        CASE
            WHEN rt.test_type = 'timeframe'::text THEN rt.status
            ELSE NULL::text
        END) AS timeframe_test,
        CASE
            WHEN max(
            CASE
                WHEN rt.test_type = 'parameter'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text AND max(
            CASE
                WHEN rt.test_type = 'exchange'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text AND max(
            CASE
                WHEN rt.test_type = 'timeframe'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text THEN true
            ELSE false
        END AS all_tests_pass
   FROM strategies s
     LEFT JOIN robustness_tests rt ON rt.strategy_id = s.id
  GROUP BY s.id, s.name;

CREATE VIEW public.submission_ready WITH (security_invoker = true) AS
 SELECT s.id,
    s.name,
    s.asset,
    s.timeframe,
    s.status
   FROM strategies s
     JOIN submission_checklist sc ON sc.strategy_id = s.id
  WHERE sc.tv_script_url = true AND sc.indicator_desc = true AND sc.stats_screenshot = true AND sc.equity_screenshot = true AND sc.inputs_screenshot = true AND sc.robustness_sheet = true AND sc.repaint_tested = true;

CREATE VIEW public.valuables_current WITH (security_invoker = on) AS
 SELECT v.id,
    v.user_id,
    v.name,
    v.kategorie,
    v.marke,
    v.modell,
    v.referenz,
    v.seriennummer,
    v.gekauft_am,
    v.kaufpreis,
    v.kaufquelle,
    v.waehrung,
    v.zustand,
    v.box_vorhanden,
    v.papiere_vorhanden,
    v.lagerort,
    v.versichert,
    v.versicherungsnummer,
    v.notizen,
    v.im_vermoegen,
    v.verkauft_am,
    v.verkaufspreis,
    v.is_active,
    v.sort_order,
    v.created_at,
    v.updated_at,
    v.nutzung,
    v.wertmodus,
    lv.wert AS aktueller_wert,
    lv.bewertet_am AS wert_stand,
    lv.quelle AS wert_quelle,
        CASE
            WHEN v.kaufpreis IS NOT NULL AND v.kaufpreis > 0::numeric AND lv.wert IS NOT NULL THEN round((lv.wert - v.kaufpreis) / v.kaufpreis * 100::numeric, 1)
            ELSE NULL::numeric
        END AS rendite_prozent,
    hb.pfad AS hauptbild_pfad,
    COALESCE(anz.gesamt, 0::bigint)::integer AS bild_anzahl,
    COALESCE(anz.fotos, 0::bigint)::integer AS foto_anzahl
   FROM valuables v
     LEFT JOIN LATERAL ( SELECT vv.wert,
            vv.bewertet_am,
            vv.quelle
           FROM valuable_valuations vv
          WHERE vv.valuable_id = v.id
          ORDER BY (vv.bewertet_am <= CURRENT_DATE) DESC, (
                CASE
                    WHEN vv.bewertet_am <= CURRENT_DATE THEN vv.bewertet_am
                    ELSE NULL::date
                END) DESC NULLS LAST, vv.bewertet_am
         LIMIT 1) lv ON true
     LEFT JOIN LATERAL ( SELECT vi.pfad
           FROM valuable_images vi
          WHERE vi.valuable_id = v.id
          ORDER BY vi.ist_hauptbild DESC, (vi.art = 'artwork'::text) DESC, vi.created_at DESC
         LIMIT 1) hb ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS gesamt,
            count(*) FILTER (WHERE vi.art = 'foto'::text) AS fotos
           FROM valuable_images vi
          WHERE vi.valuable_id = v.id) anz ON true;

-- ===== 06_triggers.sql =====
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

-- ===== 07_rls_policies.sql =====
-- Baseline 2026-10-26, Teil 07: RLS + 148 Policies (schema public). UNGETESTET.
-- Live: ALLE 77 Tabellen haben RLS enabled, KEINE hat FORCE ROW LEVEL SECURITY.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

CREATE POLICY backup_kein_zugriff ON public._rls_policy_backup_20261023 AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY own_account_balances ON public.account_balances AS PERMISSIVE FOR ALL TO public USING ((account_id IN ( SELECT accounts.id FROM accounts WHERE (accounts.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY own_data ON public.accounts AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own conversations" ON public.ai_conversations AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own conversations" ON public.ai_conversations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own conversations" ON public.ai_conversations AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own conversations" ON public.ai_conversations AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own ai files" ON public.ai_files AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own ai files" ON public.ai_files AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own ai files" ON public.ai_files AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own ai files" ON public.ai_files AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own knowledge" ON public.ai_knowledge AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own knowledge" ON public.ai_knowledge AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own knowledge" ON public.ai_knowledge AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own knowledge" ON public.ai_knowledge AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own logs" ON public.ai_logs AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own logs" ON public.ai_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own logs" ON public.ai_logs AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own memories" ON public.ai_memories AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own memories" ON public.ai_memories AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own memories" ON public.ai_memories AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own memories" ON public.ai_memories AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own messages" ON public.ai_messages AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own messages" ON public.ai_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own messages" ON public.ai_messages AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own messages" ON public.ai_messages AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own pending actions" ON public.ai_pending_actions AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own pending actions" ON public.ai_pending_actions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own pending actions" ON public.ai_pending_actions AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own pending actions" ON public.ai_pending_actions AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own ai projects" ON public.ai_projects AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own ai projects" ON public.ai_projects AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own ai projects" ON public.ai_projects AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own ai projects" ON public.ai_projects AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own ai settings" ON public.ai_settings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own ai settings" ON public.ai_settings AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own ai settings" ON public.ai_settings AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own tool calls" ON public.ai_tool_calls AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own tool calls" ON public.ai_tool_calls AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own tool calls" ON public.ai_tool_calls AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own tool calls" ON public.ai_tool_calls AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users insert own audit log" ON public.asset_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users see own audit log" ON public.asset_audit_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own ON public.asset_audit_log AS PERMISSIVE FOR ALL TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_asset_valuations ON public.asset_valuations AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM assets WHERE ((assets.id = asset_valuations.asset_id) AND (assets.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.assets AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY audit_log_select_own ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can delete own balances" ON public.bank_balance AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own balances" ON public.bank_balance AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own balances" ON public.bank_balance AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own balances" ON public.bank_balance AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own transactions" ON public.bank_transactions AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own transactions" ON public.bank_transactions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own transactions" ON public.bank_transactions AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own transactions" ON public.bank_transactions AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY belege_insert_own ON public.belege AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY belege_select_own ON public.belege AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY belege_update_own ON public.belege AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can delete own categories" ON public.budget_categories AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own categories" ON public.budget_categories AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own categories" ON public.budget_categories AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own categories" ON public.budget_categories AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own items" ON public.budget_items AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own items" ON public.budget_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own items" ON public.budget_items AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own items" ON public.budget_items AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.categories AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_combo_indicators ON public.combo_indicators AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM combos WHERE ((combos.id = combo_indicators.combo_id) AND (combos.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.combos AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY contract_executions_own ON public.contract_executions AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1 FROM contracts c WHERE ((c.id = contract_executions.contract_id) AND (c.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1 FROM contracts c WHERE ((c.id = contract_executions.contract_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.contracts AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "authenticated can read crypto_price_cache" ON public.crypto_price_cache AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY own_debt_payments ON public.debt_payments AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM debts WHERE ((debts.id = debt_payments.debt_id) AND (debts.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.debts AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own depot holdings" ON public.depot_holdings AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own depot holdings" ON public.depot_holdings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own depot holdings" ON public.depot_holdings AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own depot holdings" ON public.depot_holdings AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY depot_transactions_own ON public.depot_transactions AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY depots_own ON public.depots AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY euer_zeilen_read ON public.euer_zeilen AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY own_data ON public.exchange_connections AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can manage their own exchange keys" ON public.exchange_keys AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY fints_client_state_own ON public.fints_client_state AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY fund_price_cache_read ON public.fund_price_cache AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY fund_price_cache_write_auth ON public.fund_price_cache AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fund_price_history_read ON public.fund_price_history AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY fund_price_history_write_auth ON public.fund_price_history AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fund_prices_delete_auth ON public.fund_prices AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fund_prices_insert_auth ON public.fund_prices AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fund_prices_select_all ON public.fund_prices AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY fund_prices_update_auth ON public.fund_prices AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY fund_sources_read ON public.fund_sources AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can delete own income targets" ON public.income_targets AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own income targets" ON public.income_targets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own income targets" ON public.income_targets AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own income targets" ON public.income_targets AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_indicator_performance ON public.indicator_performance AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM indicators WHERE ((indicators.id = indicator_performance.indicator_id) AND (indicators.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.indicators AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own insights" ON public.insights AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own insights" ON public.insights AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own insights" ON public.insights AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own insights" ON public.insights AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can manage their own kraken ledger" ON public.kraken_ledger AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own kraken order log" ON public.kraken_order_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own kraken order log" ON public.kraken_order_log AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can manage their own kraken trades" ON public.kraken_trades AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.monthly_finance_summary AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.net_worth_snapshots AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY backup_20260830_own ON public.net_worth_snapshots_backup_20260830 AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_data ON public.portfolio_snapshots AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.positions AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY reports_own ON public.reports AS PERMISSIVE FOR ALL TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY own_robustness_tests ON public.robustness_tests AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM strategies WHERE ((strategies.id = robustness_tests.strategy_id) AND (strategies.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.roc_positions AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.savings_goals AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY savings_plans_own ON public.savings_plans AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_data ON public.strategies AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_equity_snapshots ON public.strategy_equity_snapshots AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM strategies WHERE ((strategies.id = strategy_equity_snapshots.strategy_id) AND (strategies.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_strategy_performance ON public.strategy_performance AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM strategies WHERE ((strategies.id = strategy_performance.strategy_id) AND (strategies.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_submission_checklist ON public.submission_checklist AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM strategies WHERE ((strategies.id = submission_checklist.strategy_id) AND (strategies.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY tax_tariffs_read ON public.tax_tariffs AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY own_data ON public.tpi_daily_scores AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_tpi_entries ON public.tpi_entries AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM tpi_indicators WHERE ((tpi_indicators.id = tpi_entries.indicator_id) AND (tpi_indicators.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY own_data ON public.tpi_indicators AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_trade_fills ON public.trade_fills AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM positions WHERE ((positions.id = trade_fills.position_id) AND (positions.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY read_trading_pairs ON public.trading_pairs AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY own_data ON public.transactions AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY own_profile ON public.user_profiles AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY own_data ON public.user_settings AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own documents" ON public.valuable_documents AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own documents" ON public.valuable_documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can read own documents" ON public.valuable_documents AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own documents" ON public.valuable_documents AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete own images" ON public.valuable_images AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own images" ON public.valuable_images AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own images" ON public.valuable_images AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own images" ON public.valuable_images AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own valuations" ON public.valuable_valuations AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own valuations" ON public.valuable_valuations AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own valuations" ON public.valuable_valuations AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own valuations" ON public.valuable_valuations AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own valuables" ON public.valuables AS PERMISSIVE FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own valuables" ON public.valuables AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own valuables" ON public.valuables AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own valuables" ON public.valuables AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY waitlist_signups_insert_public ON public.waitlist_signups AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY own_data ON public.webhook_events AS PERMISSIVE FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));

-- ===== 08_grants.sql =====
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

-- ===== 09_storage.sql =====
-- Baseline 2026-10-26, Teil 09: Storage-Buckets + storage.objects-Policies (21). UNGETESTET.
-- Setzt das Supabase-Storage-Schema voraus (storage.buckets, storage.objects, storage.foldername()).
-- Hinweis: Bucket "avatars" (public) existiert live zusaetzlich zu den genannten 5 App-Buckets.
-- Hinweis: Fuer bucket "belege" gibt es live nur INSERT + SELECT Policies (kein UPDATE/DELETE) -- absichtlich unveraendert uebernommen.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('athena-uploads', 'athena-uploads', false, 52428800, ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','text/plain','text/csv','text/markdown','application/json']),
  ('avatars', 'avatars', true, NULL, NULL),
  ('belege', 'belege', false, NULL, NULL),
  ('reports', 'reports', false, NULL, NULL),
  ('valuable-documents', 'valuable-documents', false, 15728640, ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('valuables', 'valuables', false, 10485760, ARRAY['image/webp','image/png','image/jpeg','image/avif','image/gif','image/heic','image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read avatars" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "athena uploads delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "belege insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'belege'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "belege read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'belege'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuables delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ===== 10_cron_jobs_DOKUMENTATION.sql =====
-- Baseline 2026-10-26, Teil 10: pg_cron-Jobs -- NUR DOKUMENTATION, alles auskommentiert, NICHT ausfuehren.
-- Live existieren 3 Jobs (cron.job). Alle rufen per net.http_post (pg_net) eine Edge Function im Projekt
-- jefmszovqziiqxotncjm auf. Der Authorization-Header enthaelt live einen fest eingetragenen Bearer-Token;
-- der Wert ist hier bewusst NICHT uebernommen (<SECRET>). Vor Re-Erstellung in anderer Umgebung eigenen
-- Schluessel verwenden (idealerweise aus supabase_vault statt Klartext im Job-Command).
--
-- jobid 24    | fetch-fund-price      | */15 8-20 * * 1-5 | aktiv
--   select net.http_post(
--     url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/fetch-fund-price',
--     headers := '{"Authorization": "Bearer <SECRET>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb) as request_id;
--
-- jobid 26    | execute-savings-plans | 0 9 * * *         | aktiv
--   select net.http_post(
--     url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/execute-savings-plans',
--     headers := '{"Authorization": "Bearer <SECRET>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb) as request_id;
--
-- jobid 1287  | Daily-Snapshot        | 59 23 * * *       | aktiv
--   select net.http_post(
--     url := 'https://jefmszovqziiqxotncjm.supabase.co/functions/v1/daily-snapshot',
--     headers := '{"Authorization": "Bearer <SECRET>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000) as request_id;
--
-- Beispiel zum Anlegen (auskommentiert):
-- select cron.schedule('Daily-Snapshot', '59 23 * * *', $$ select net.http_post(...) $$);
