-- contract_executions hatte RLS aktiv, aber KEINE Policy: damit konnte ausser
-- service_role niemand lesen -- auch Eric selbst nicht. Die Tabelle protokolliert,
-- welche Vertraege der Cron tatsaechlich gebucht hat; ohne Leserecht bleibt jeder
-- Verpflichtungs-Kalender in der App und fuer Athena leer.
--
-- Die Policy stand so schon in 20260309000005_contract_executions.sql, ist in der
-- Remote-Datenbank aber nicht vorhanden (deren Migrationshistorie beginnt erst im
-- Juli 2026 -- siehe Drift). Deshalb hier noch einmal, idempotent.
--
-- Gegenueber dem Original zwei Aenderungen:
--   1. `(select auth.uid())` statt `auth.uid()`. Postgres wertet die
--      Unterabfrage EINMAL aus statt pro Zeile (auth_rls_initplan aus dem
--      Supabase-Linter).
--   2. explizites `with check` statt sich darauf zu verlassen, dass Postgres bei
--      FOR ALL den USING-Ausdruck als Pruefung wiederverwendet.

drop policy if exists "contract_executions_own" on public.contract_executions;

create policy "contract_executions_own"
  on public.contract_executions
  for all
  to authenticated
  using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_executions.contract_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.contracts c
      where c.id = contract_executions.contract_id
        and c.user_id = (select auth.uid())
    )
  );

-- Tilgungen werden immer je Schuld abgefragt ("letzte Tilgung", "wie viel schon
-- getilgt"). Ohne Index ist das ein Seq Scan pro Schuld.
create index if not exists debt_payments_debt_id_idx
  on public.debt_payments (debt_id, payment_date desc);
