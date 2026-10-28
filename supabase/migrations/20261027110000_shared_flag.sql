-- HAUSHALT PHASE 1b: Spalte shared (boolean, default false) auf den haushalt-teilbaren Tabellen.
-- Plan: docs/haushalt-multiuser.md (Abschnitte 4, 8.1, 8.5).
--
-- Warum: Pro Datensatz soll markierbar sein, ob er mit dem Haushalt geteilt wird (z. B. das geteilte Konto).
-- Default false -> bestehendes Verhalten bleibt unveraendert; die Spalte hat in Phase 1 noch keine Wirkung
-- (Policies folgen in Phase 2).
--
-- Tabellen: accounts, valuables, depots, depot_holdings, depot_transactions, savings_plans, contracts, debts,
-- savings_goals, budget_categories, budget_items, assets.
-- ANNAHME (Eric: "geteilt mit Shared Flag" fuer Vertraege/Schulden/Sparziele/Budget/Krypto-Assets): Belege
-- (belege) und Einkommensziel (income_targets) bleiben privat und bekommen KEIN shared-Flag. Owner-only-Tabellen
-- ebenfalls nicht.
--
-- Wie: add column if not exists, nur wenn die Tabelle existiert (vorab per information_schema geprueft:
-- alle 12 existieren, shared fehlte ueberall). Konstanter Default -> nur Metadaten, kein Tabellen-Rewrite.
-- Rueckgaengig: supabase/rollbacks/20261027110000_shared_flag.down.sql

do $$
declare
  t text;
begin
  foreach t in array array['accounts','valuables','depots','depot_holdings','depot_transactions','savings_plans',
                           'contracts','debts','savings_goals','budget_categories','budget_items','assets']
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise warning 'Tabelle public.% fehlt, shared-Spalte uebersprungen', t;
    else
      execute format('alter table public.%I add column if not exists shared boolean not null default false', t);
    end if;
  end loop;
end $$;
