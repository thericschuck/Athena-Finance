-- Rollback zu 20261027100000_households_members.sql.
-- ACHTUNG: loescht alle Haushalte und Mitgliedschaften. Vorher muessen spaetere Migrationen zurueckgerollt
-- sein, die auf diese Funktionen/Tabellen verweisen (Phase-2-Policies mit is_household_member).
drop policy if exists household_members_select_same_household on public.household_members;
drop policy if exists households_select_members on public.households;
drop function if exists public.household_peer_ids();
drop function if exists public.is_household_member(uuid);
drop table if exists public.household_members;
drop table if exists public.households;
