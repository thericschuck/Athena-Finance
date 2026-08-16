-- ─────────────────────────────────────────────────────────────────────────────
-- Ersetzt die offenen "authenticated_full_access"-Policies aus
-- 20260427000001_lebenshaltungskosten_rls.sql durch echte Besitzer-Policies,
-- jetzt wo user_id existiert (siehe 20260811130000_lebenshaltungskosten_user_id.sql).
-- Selbe Vier-Policy-Bauart (select/insert/update/delete) wie bank_transactions/
-- bank_balance in 20260411000000_bank_integration.sql.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "authenticated_full_access" on budget_categories;
drop policy if exists "authenticated_full_access" on budget_items;
drop policy if exists "authenticated_full_access" on income_targets;

-- ── budget_categories ──────────────────────────────────────────────────────────
create policy "Users can read own categories"
  on budget_categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on budget_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on budget_categories for update
  using (auth.uid() = user_id);

create policy "Users can delete own categories"
  on budget_categories for delete
  using (auth.uid() = user_id);

-- ── budget_items ───────────────────────────────────────────────────────────────
create policy "Users can read own items"
  on budget_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own items"
  on budget_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own items"
  on budget_items for update
  using (auth.uid() = user_id);

create policy "Users can delete own items"
  on budget_items for delete
  using (auth.uid() = user_id);

-- ── income_targets ─────────────────────────────────────────────────────────────
create policy "Users can read own income targets"
  on income_targets for select
  using (auth.uid() = user_id);

create policy "Users can insert own income targets"
  on income_targets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own income targets"
  on income_targets for update
  using (auth.uid() = user_id);

create policy "Users can delete own income targets"
  on income_targets for delete
  using (auth.uid() = user_id);
