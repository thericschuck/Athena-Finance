-- HAUSHALT PHASE 2a: RLS der haushalt-geteilten Tabellen auf Haushalts-Peers umstellen (+ fund_price_history absichern).
-- Plan: docs/haushalt-multiuser.md (Abschnitte 2, 4, 8.1, 8.2). Voraussetzung: 20261027100000 (household_peer_ids()).
-- NICHT in dieser Migration: categories (eigene Migration), audit_log SELECT (anderer Agent), Storage-Policies.
--
-- Warum: Entscheidung von Eric: volle Transparenz + volle Schreibrechte im Haushalt. Jedes Haushaltsmitglied liest UND schreibt
-- alle Zeilen der Tabellen unten, sobald der Besitzer (user_id) im selben Haushalt ist. `shared` bedeutet NUR "zaehlt in den
-- Scopes beider Personen", nicht Sichtbarkeit; deshalb prueft keine Policy die shared-Spalte.
--
-- Wie:
--   - Je Tabelle genau EINE Policy household_<tabelle>_all (FOR ALL, TO authenticated) statt der bisherigen Einzel-/own-Policies.
--     USING und WITH CHECK sind identisch: user_id in (select public.household_peer_ids()). Das Peer-Set enthaelt immer die
--     eigene auth.uid(), umfasst also die bisherige Owner-Semantik. Die Funktion steht in ( select ... ) -> einmal je Statement
--     (Initplan, Schreibweise wie 20261023110000_rls_initplan.sql).
--   - WITH CHECK-Entscheidung: INSERT/UPDATE duerfen user_id nur auf einen Peer setzen (Eigenes oder Haushaltsmitglied), nie auf
--     einen Fremden. Bewusst zugelassen: ein Mitglied kann eine Zeile einem Peer zuordnen bzw. in dessen Namen anlegen (das ist
--     "volle Schreibrechte"); das Eigentum bleibt innerhalb des Haushalts. Ein striktes user_id = auth.uid() bei INSERT wuerde
--     Fremdanlage fuer Malik verhindern, bringt aber keinen Schutz nach aussen und wurde nicht gewaehlt.
--   - Kind-Tabellen ohne user_id (account_balances, contract_executions, debt_payments, asset_valuations) pruefen den Besitz des
--     Elternobjekts per IN-Semi-Join auf die Eltern-Tabelle, jeweils in USING und WITH CHECK (auch beim Schreiben, damit man kein
--     Kind an ein fremdes Elternobjekt haengt). valuable_valuations/_images/_documents haben user_id UND valuable_id; frueher
--     wurde nur user_id geprueft (Luecke: Kind konnte an fremdes valuable gehaengt werden). Jetzt gelten beide Bedingungen.
--   - Bestehende Policies werden per DROP POLICY IF EXISTS mit exakten Live-Namen (Stand 2026-10-26, pg_policies) ersetzt.
--     Alle alten waren Rolle public (greift effektiv nur fuer eingeloggte, aber anon-Rolle war formal erfasst); neue Policies
--     gelten nur fuer authenticated. service_role umgeht RLS und ist unberuehrt.
--   - Views sind security_invoker und erben die Basis-RLS automatisch. Security-definer-Funktionen (z. B. fn_take_snapshot,
--     Owner postgres) umgehen RLS weiter; Funktionen, die mit den Rechten des Aufrufers laufen, sehen jetzt auch Peer-Zeilen.
--   - user_profiles: zusaetzliche SELECT-Policy fuer Peers (Name/Avatar fuer Urheber-Anzeige). own_profile (ALL, id = auth.uid())
--     bleibt, Schreiben also weiter nur der Besitzer. (Policies sind permissive/OR-verknuepft.)
--
-- Bewusst owner-only (NICHT angefasst): exchange_keys, exchange_connections, fints_client_state, kraken_*, belege, reports, ai_*,
-- user_settings, income_targets, insights, Algo-Trading-Tabellen, net_worth_snapshots, portfolio_snapshots, tax_*.
--
-- fund_price_history / fund_prices (Abschnitt 8.2, Sicherheitsrisiko: jeder eingeloggte User darf schreiben/loeschen):
--   Pruefung live + Code (grep src/ und supabase/functions/):
--   - fund_price_history: Einziger Schreibzugriff ist fn_take_snapshot (SECURITY DEFINER, Owner postgres = Tabellenowner, umgeht
--     RLS). Der Code (src/lib/data/depot.ts) liest nur. Kein User-Client-Schreibzugriff -> Policy fund_price_history_write_auth
--     (ALL fuer jeden eingeloggten User) wird ENTFERNT. Es bleibt fund_price_history_read (SELECT). Schreiben dann nur noch ueber
--     service_role/Definer (beide umgehen RLS), eine Ersatz-Policy ist nicht noetig.
--   - fund_prices: NICHT geaendert. src/app/actions/depot.ts (upsertFundPrice, addInitialHolding u. a.) schreibt mit dem
--     User-Client per upsert (insert + update). Eine Sperre wuerde das Anlegen von Depotpositionen brechen. Offener Punkt: Schreibpfad
--     auf service_role/definer-RPC umstellen, danach Policies fund_prices_insert_auth/_update_auth/_delete_auth entfernen.
--
-- OFFENE PUNKTE fuer Phase 3:
--   - Storage-Policies (valuable-documents u. a.) unveraendert. Objektpfade beginnen mit der User-ID, die Policies pruefen das
--     Pfadpraefix = auth.uid(); Malik kann Dateien eines geteilten Inventars daher (noch) nicht lesen/schreiben und Pfade
--     kollidieren. Muss vor der Freigabe des Inventars in der App geloest werden (Pfad nach valuable_id oder Peer-Pruefung).
--   - asset_audit_log ist wie bisher ALL (inkl. UPDATE/DELETE) fuer Besitzer bzw. jetzt Peers. Falls ein manipulationssicheres
--     Protokoll gewollt ist: nur SELECT/INSERT zulassen (Entscheidung Eric).
--   - Nicht automatisch getestet (siehe supabase/tests/household_phase1.sql fuer Muster; Phase-2-Test fehlt noch).
-- Rueckgaengig: supabase/rollbacks/20261028100000_household_rls.down.sql (stellt die alten Policies exakt wieder her).
-- Idempotent: DROP POLICY IF EXISTS vor jedem CREATE POLICY.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Tabellen mit eigener user_id-Spalte
-- ---------------------------------------------------------------------------------------------------------------

-- accounts (alt: own_data)
drop policy if exists own_data on public.accounts;
drop policy if exists household_accounts_all on public.accounts;
create policy household_accounts_all on public.accounts
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- transactions (alt: own_data)
drop policy if exists own_data on public.transactions;
drop policy if exists household_transactions_all on public.transactions;
create policy household_transactions_all on public.transactions
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- bank_transactions (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own transactions" on public.bank_transactions;
drop policy if exists "Users can insert own transactions" on public.bank_transactions;
drop policy if exists "Users can read own transactions" on public.bank_transactions;
drop policy if exists "Users can update own transactions" on public.bank_transactions;
drop policy if exists household_bank_transactions_all on public.bank_transactions;
create policy household_bank_transactions_all on public.bank_transactions
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- bank_balance (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own balances" on public.bank_balance;
drop policy if exists "Users can insert own balances" on public.bank_balance;
drop policy if exists "Users can read own balances" on public.bank_balance;
drop policy if exists "Users can update own balances" on public.bank_balance;
drop policy if exists household_bank_balance_all on public.bank_balance;
create policy household_bank_balance_all on public.bank_balance
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- valuables (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own valuables" on public.valuables;
drop policy if exists "Users can insert own valuables" on public.valuables;
drop policy if exists "Users can read own valuables" on public.valuables;
drop policy if exists "Users can update own valuables" on public.valuables;
drop policy if exists household_valuables_all on public.valuables;
create policy household_valuables_all on public.valuables
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- depots (alt: depots_own)
drop policy if exists depots_own on public.depots;
drop policy if exists household_depots_all on public.depots;
create policy household_depots_all on public.depots
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- depot_transactions (alt: depot_transactions_own)
drop policy if exists depot_transactions_own on public.depot_transactions;
drop policy if exists household_depot_transactions_all on public.depot_transactions;
create policy household_depot_transactions_all on public.depot_transactions
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- savings_plans (alt: savings_plans_own)
drop policy if exists savings_plans_own on public.savings_plans;
drop policy if exists household_savings_plans_all on public.savings_plans;
create policy household_savings_plans_all on public.savings_plans
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- depot_holdings (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own depot holdings" on public.depot_holdings;
drop policy if exists "Users can insert own depot holdings" on public.depot_holdings;
drop policy if exists "Users can read own depot holdings" on public.depot_holdings;
drop policy if exists "Users can update own depot holdings" on public.depot_holdings;
drop policy if exists household_depot_holdings_all on public.depot_holdings;
create policy household_depot_holdings_all on public.depot_holdings
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- asset_audit_log (alt: "Users insert own audit log", "Users see own audit log", own)
drop policy if exists "Users insert own audit log" on public.asset_audit_log;
drop policy if exists "Users see own audit log" on public.asset_audit_log;
drop policy if exists own on public.asset_audit_log;
drop policy if exists household_asset_audit_log_all on public.asset_audit_log;
drop policy if exists household_asset_audit_log_select on public.asset_audit_log;
drop policy if exists household_asset_audit_log_insert on public.asset_audit_log;
-- Review-Fix: Protokoll nur lesen und anhaengen, nicht aendern/loeschen (Aenderungslog ist Pflicht, Entscheidung 2).
create policy household_asset_audit_log_select on public.asset_audit_log
  for select to authenticated
  using (user_id in (select public.household_peer_ids()));
create policy household_asset_audit_log_insert on public.asset_audit_log
  for insert to authenticated
  with check (user_id in (select public.household_peer_ids()));

-- contracts (alt: own_data)
drop policy if exists own_data on public.contracts;
drop policy if exists household_contracts_all on public.contracts;
create policy household_contracts_all on public.contracts
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- debts (alt: own_data)
drop policy if exists own_data on public.debts;
drop policy if exists household_debts_all on public.debts;
create policy household_debts_all on public.debts
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- savings_goals (alt: own_data)
drop policy if exists own_data on public.savings_goals;
drop policy if exists household_savings_goals_all on public.savings_goals;
create policy household_savings_goals_all on public.savings_goals
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- budget_categories (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own categories" on public.budget_categories;
drop policy if exists "Users can insert own categories" on public.budget_categories;
drop policy if exists "Users can read own categories" on public.budget_categories;
drop policy if exists "Users can update own categories" on public.budget_categories;
drop policy if exists household_budget_categories_all on public.budget_categories;
create policy household_budget_categories_all on public.budget_categories
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- budget_items (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own items" on public.budget_items;
drop policy if exists "Users can insert own items" on public.budget_items;
drop policy if exists "Users can read own items" on public.budget_items;
drop policy if exists "Users can update own items" on public.budget_items;
drop policy if exists household_budget_items_all on public.budget_items;
create policy household_budget_items_all on public.budget_items
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- assets (alt: own_data). portfolio_snapshots bleibt owner-only.
drop policy if exists own_data on public.assets;
drop policy if exists household_assets_all on public.assets;
create policy household_assets_all on public.assets
  for all to authenticated
  using (user_id in (select public.household_peer_ids()))
  with check (user_id in (select public.household_peer_ids()));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Inventar-Kinder: user_id UND Eltern-Besitz (schliesst die Luecke: Eltern wurde nicht geprueft)
-- ---------------------------------------------------------------------------------------------------------------

-- valuable_valuations (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own valuations" on public.valuable_valuations;
drop policy if exists "Users can insert own valuations" on public.valuable_valuations;
drop policy if exists "Users can read own valuations" on public.valuable_valuations;
drop policy if exists "Users can update own valuations" on public.valuable_valuations;
drop policy if exists household_valuable_valuations_all on public.valuable_valuations;
create policy household_valuable_valuations_all on public.valuable_valuations
  for all to authenticated
  using (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  )
  with check (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  );

-- valuable_images (alt: 4 Einzel-Policies)
drop policy if exists "Users can delete own images" on public.valuable_images;
drop policy if exists "Users can insert own images" on public.valuable_images;
drop policy if exists "Users can read own images" on public.valuable_images;
drop policy if exists "Users can update own images" on public.valuable_images;
drop policy if exists household_valuable_images_all on public.valuable_images;
create policy household_valuable_images_all on public.valuable_images
  for all to authenticated
  using (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  )
  with check (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  );

-- valuable_documents (alt: 4 Einzel-Policies, noch mit blankem auth.uid())
drop policy if exists "Users can delete own documents" on public.valuable_documents;
drop policy if exists "Users can insert own documents" on public.valuable_documents;
drop policy if exists "Users can read own documents" on public.valuable_documents;
drop policy if exists "Users can update own documents" on public.valuable_documents;
drop policy if exists household_valuable_documents_all on public.valuable_documents;
create policy household_valuable_documents_all on public.valuable_documents
  for all to authenticated
  using (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  )
  with check (
    user_id in (select public.household_peer_ids())
    and valuable_id in (select v.id from public.valuables v where v.user_id in (select public.household_peer_ids()))
  );

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Kind-Tabellen ohne user_id: Besitz des Elternobjekts
-- ---------------------------------------------------------------------------------------------------------------

-- account_balances (alt: own_account_balances, nur USING)
drop policy if exists own_account_balances on public.account_balances;
drop policy if exists household_account_balances_all on public.account_balances;
create policy household_account_balances_all on public.account_balances
  for all to authenticated
  using (account_id in (select a.id from public.accounts a where a.user_id in (select public.household_peer_ids())))
  with check (account_id in (select a.id from public.accounts a where a.user_id in (select public.household_peer_ids())));

-- contract_executions (alt: contract_executions_own, Rolle authenticated)
drop policy if exists contract_executions_own on public.contract_executions;
drop policy if exists household_contract_executions_all on public.contract_executions;
create policy household_contract_executions_all on public.contract_executions
  for all to authenticated
  using (contract_id in (select c.id from public.contracts c where c.user_id in (select public.household_peer_ids())))
  with check (contract_id in (select c.id from public.contracts c where c.user_id in (select public.household_peer_ids())));

-- debt_payments (alt: own_debt_payments, nur USING)
drop policy if exists own_debt_payments on public.debt_payments;
drop policy if exists household_debt_payments_all on public.debt_payments;
create policy household_debt_payments_all on public.debt_payments
  for all to authenticated
  using (debt_id in (select d.id from public.debts d where d.user_id in (select public.household_peer_ids())))
  with check (debt_id in (select d.id from public.debts d where d.user_id in (select public.household_peer_ids())));

-- asset_valuations (alt: own_asset_valuations, nur USING)
drop policy if exists own_asset_valuations on public.asset_valuations;
drop policy if exists household_asset_valuations_all on public.asset_valuations;
create policy household_asset_valuations_all on public.asset_valuations
  for all to authenticated
  using (asset_id in (select a.id from public.assets a where a.user_id in (select public.household_peer_ids())))
  with check (asset_id in (select a.id from public.assets a where a.user_id in (select public.household_peer_ids())));

-- ---------------------------------------------------------------------------------------------------------------
-- 4. user_profiles: Name/Avatar der Haushaltsmitglieder lesbar (nur SELECT; own_profile bleibt fuer Schreiben)
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists household_user_profiles_select on public.user_profiles;
create policy household_user_profiles_select on public.user_profiles
  for select to authenticated
  using (id in (select public.household_peer_ids()));

-- ---------------------------------------------------------------------------------------------------------------
-- 5. fund_price_history: Schreib-Policy fuer jeden eingeloggten User entfernen (SELECT-Policy bleibt)
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists fund_price_history_write_auth on public.fund_price_history;
