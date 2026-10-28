-- Rollback zu 20261028100000_household_rls.sql: entfernt die household_*-Policies und stellt die alten Policies
-- exakt wieder her (Stand Live pg_policies, 2026-10-26: Name, Rolle, Befehl, USING, WITH CHECK).
-- Rolle "public" = ohne TO-Klausel. Bei UPDATE-Policies ohne WITH CHECK gilt USING auch als CHECK (wie zuvor).
-- Achtung: danach sehen Haushaltsmitglieder die Daten der Peers nicht mehr; vorher App-Scopes zuruecknehmen.
-- Idempotent: DROP POLICY IF EXISTS vor jedem CREATE POLICY.

-- 1. Neue Policies entfernen
drop policy if exists household_accounts_all on public.accounts;
drop policy if exists household_transactions_all on public.transactions;
drop policy if exists household_bank_transactions_all on public.bank_transactions;
drop policy if exists household_bank_balance_all on public.bank_balance;
drop policy if exists household_valuables_all on public.valuables;
drop policy if exists household_depots_all on public.depots;
drop policy if exists household_depot_transactions_all on public.depot_transactions;
drop policy if exists household_savings_plans_all on public.savings_plans;
drop policy if exists household_depot_holdings_all on public.depot_holdings;
drop policy if exists household_asset_audit_log_all on public.asset_audit_log;
drop policy if exists household_asset_audit_log_select on public.asset_audit_log;
drop policy if exists household_asset_audit_log_insert on public.asset_audit_log;
drop policy if exists household_contracts_all on public.contracts;
drop policy if exists household_debts_all on public.debts;
drop policy if exists household_savings_goals_all on public.savings_goals;
drop policy if exists household_budget_categories_all on public.budget_categories;
drop policy if exists household_budget_items_all on public.budget_items;
drop policy if exists household_assets_all on public.assets;
drop policy if exists household_valuable_valuations_all on public.valuable_valuations;
drop policy if exists household_valuable_images_all on public.valuable_images;
drop policy if exists household_valuable_documents_all on public.valuable_documents;
drop policy if exists household_account_balances_all on public.account_balances;
drop policy if exists household_contract_executions_all on public.contract_executions;
drop policy if exists household_debt_payments_all on public.debt_payments;
drop policy if exists household_asset_valuations_all on public.asset_valuations;
drop policy if exists household_user_profiles_select on public.user_profiles;

-- 2. Alte Policies wiederherstellen

-- accounts
drop policy if exists own_data on public.accounts;
create policy own_data on public.accounts for all using (((select auth.uid()) = user_id));

-- transactions
drop policy if exists own_data on public.transactions;
create policy own_data on public.transactions for all using (((select auth.uid()) = user_id));

-- bank_transactions
drop policy if exists "Users can delete own transactions" on public.bank_transactions;
create policy "Users can delete own transactions" on public.bank_transactions for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own transactions" on public.bank_transactions;
create policy "Users can insert own transactions" on public.bank_transactions for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own transactions" on public.bank_transactions;
create policy "Users can read own transactions" on public.bank_transactions for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own transactions" on public.bank_transactions;
create policy "Users can update own transactions" on public.bank_transactions for update using (((select auth.uid()) = user_id));

-- bank_balance
drop policy if exists "Users can delete own balances" on public.bank_balance;
create policy "Users can delete own balances" on public.bank_balance for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own balances" on public.bank_balance;
create policy "Users can insert own balances" on public.bank_balance for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own balances" on public.bank_balance;
create policy "Users can read own balances" on public.bank_balance for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own balances" on public.bank_balance;
create policy "Users can update own balances" on public.bank_balance for update using (((select auth.uid()) = user_id));

-- valuables
drop policy if exists "Users can delete own valuables" on public.valuables;
create policy "Users can delete own valuables" on public.valuables for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own valuables" on public.valuables;
create policy "Users can insert own valuables" on public.valuables for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own valuables" on public.valuables;
create policy "Users can read own valuables" on public.valuables for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own valuables" on public.valuables;
create policy "Users can update own valuables" on public.valuables for update using (((select auth.uid()) = user_id));

-- depots
drop policy if exists depots_own on public.depots;
create policy depots_own on public.depots for all
  using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));

-- depot_transactions
drop policy if exists depot_transactions_own on public.depot_transactions;
create policy depot_transactions_own on public.depot_transactions for all
  using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));

-- savings_plans
drop policy if exists savings_plans_own on public.savings_plans;
create policy savings_plans_own on public.savings_plans for all
  using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));

-- depot_holdings
drop policy if exists "Users can delete own depot holdings" on public.depot_holdings;
create policy "Users can delete own depot holdings" on public.depot_holdings for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own depot holdings" on public.depot_holdings;
create policy "Users can insert own depot holdings" on public.depot_holdings for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own depot holdings" on public.depot_holdings;
create policy "Users can read own depot holdings" on public.depot_holdings for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own depot holdings" on public.depot_holdings;
create policy "Users can update own depot holdings" on public.depot_holdings for update using (((select auth.uid()) = user_id));

-- asset_audit_log
drop policy if exists "Users insert own audit log" on public.asset_audit_log;
create policy "Users insert own audit log" on public.asset_audit_log for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users see own audit log" on public.asset_audit_log;
create policy "Users see own audit log" on public.asset_audit_log for select using (((select auth.uid()) = user_id));
drop policy if exists own on public.asset_audit_log;
create policy own on public.asset_audit_log for all using ((user_id = (select auth.uid())));

-- contracts
drop policy if exists own_data on public.contracts;
create policy own_data on public.contracts for all using (((select auth.uid()) = user_id));

-- debts
drop policy if exists own_data on public.debts;
create policy own_data on public.debts for all using (((select auth.uid()) = user_id));

-- savings_goals
drop policy if exists own_data on public.savings_goals;
create policy own_data on public.savings_goals for all using (((select auth.uid()) = user_id));

-- budget_categories
drop policy if exists "Users can delete own categories" on public.budget_categories;
create policy "Users can delete own categories" on public.budget_categories for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own categories" on public.budget_categories;
create policy "Users can insert own categories" on public.budget_categories for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own categories" on public.budget_categories;
create policy "Users can read own categories" on public.budget_categories for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own categories" on public.budget_categories;
create policy "Users can update own categories" on public.budget_categories for update using (((select auth.uid()) = user_id));

-- budget_items
drop policy if exists "Users can delete own items" on public.budget_items;
create policy "Users can delete own items" on public.budget_items for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own items" on public.budget_items;
create policy "Users can insert own items" on public.budget_items for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own items" on public.budget_items;
create policy "Users can read own items" on public.budget_items for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own items" on public.budget_items;
create policy "Users can update own items" on public.budget_items for update using (((select auth.uid()) = user_id));

-- assets
drop policy if exists own_data on public.assets;
create policy own_data on public.assets for all using (((select auth.uid()) = user_id));

-- valuable_valuations
drop policy if exists "Users can delete own valuations" on public.valuable_valuations;
create policy "Users can delete own valuations" on public.valuable_valuations for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own valuations" on public.valuable_valuations;
create policy "Users can insert own valuations" on public.valuable_valuations for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own valuations" on public.valuable_valuations;
create policy "Users can read own valuations" on public.valuable_valuations for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own valuations" on public.valuable_valuations;
create policy "Users can update own valuations" on public.valuable_valuations for update using (((select auth.uid()) = user_id));

-- valuable_images
drop policy if exists "Users can delete own images" on public.valuable_images;
create policy "Users can delete own images" on public.valuable_images for delete using (((select auth.uid()) = user_id));
drop policy if exists "Users can insert own images" on public.valuable_images;
create policy "Users can insert own images" on public.valuable_images for insert with check (((select auth.uid()) = user_id));
drop policy if exists "Users can read own images" on public.valuable_images;
create policy "Users can read own images" on public.valuable_images for select using (((select auth.uid()) = user_id));
drop policy if exists "Users can update own images" on public.valuable_images;
create policy "Users can update own images" on public.valuable_images for update using (((select auth.uid()) = user_id));

-- valuable_documents (Original mit blankem auth.uid(), unveraendert wiederhergestellt)
drop policy if exists "Users can delete own documents" on public.valuable_documents;
create policy "Users can delete own documents" on public.valuable_documents for delete using ((auth.uid() = user_id));
drop policy if exists "Users can insert own documents" on public.valuable_documents;
create policy "Users can insert own documents" on public.valuable_documents for insert with check ((auth.uid() = user_id));
drop policy if exists "Users can read own documents" on public.valuable_documents;
create policy "Users can read own documents" on public.valuable_documents for select using ((auth.uid() = user_id));
drop policy if exists "Users can update own documents" on public.valuable_documents;
create policy "Users can update own documents" on public.valuable_documents for update using ((auth.uid() = user_id));

-- account_balances
drop policy if exists own_account_balances on public.account_balances;
create policy own_account_balances on public.account_balances for all
  using ((account_id in (select accounts.id from public.accounts where (accounts.user_id = (select auth.uid())))));

-- contract_executions (Rolle authenticated)
drop policy if exists contract_executions_own on public.contract_executions;
create policy contract_executions_own on public.contract_executions for all to authenticated
  using (exists (select 1 from public.contracts c where ((c.id = contract_executions.contract_id) and (c.user_id = (select auth.uid())))))
  with check (exists (select 1 from public.contracts c where ((c.id = contract_executions.contract_id) and (c.user_id = (select auth.uid())))));

-- debt_payments
drop policy if exists own_debt_payments on public.debt_payments;
create policy own_debt_payments on public.debt_payments for all
  using (exists (select 1 from public.debts where ((debts.id = debt_payments.debt_id) and (debts.user_id = (select auth.uid())))));

-- asset_valuations
drop policy if exists own_asset_valuations on public.asset_valuations;
create policy own_asset_valuations on public.asset_valuations for all
  using (exists (select 1 from public.assets where ((assets.id = asset_valuations.asset_id) and (assets.user_id = (select auth.uid())))));

-- fund_price_history: Schreib-Policy wiederherstellen (ALL fuer jeden eingeloggten User, Original)
drop policy if exists fund_price_history_write_auth on public.fund_price_history;
create policy fund_price_history_write_auth on public.fund_price_history for all
  using (((select auth.uid()) is not null));
