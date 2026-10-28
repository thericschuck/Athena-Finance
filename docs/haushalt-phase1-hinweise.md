# Haushalt Phase 1 – Hinweise (Entwurf, nichts angewendet)

Stand 2026-10-26. Nur Dateien, **nichts** auf die Live-DB angewendet. Plan: `docs/haushalt-multiuser.md`.

## Was die Migrationen tun (Reihenfolge einhalten)

1. `20261027100000_households_members.sql` – Tabellen `households`, `household_members` (unique `user_id`, Rolle owner/member), RLS an (nur SELECT-Policies für Mitglieder, Schreiben nur service_role), Funktionen `is_household_member(uuid)` und `household_peer_ids()` (security definer, stable, `search_path = ''`, EXECUTE nur authenticated + service_role).
2. `20261027110000_shared_flag.sql` – `shared boolean not null default false` auf 12 Tabellen (accounts, valuables, depots, depot_holdings, depot_transactions, savings_plans, contracts, debts, savings_goals, budget_categories, budget_items, assets). Annahme: belege und income_targets bleiben privat.
3. `20261027120000_household_backfill.sql` – Haushalt „Haushalt Schuck“, Konten-Besitzer als owner, Konto „Geteiltes Konto (Malik)“ auf shared. Owner optional per `set local app.household_owner = '<uuid>'`; ohne eindeutigen Owner bzw. ohne genau 1 Konto-Treffer nur WARNUNG, keine Änderung.

Bestehende Policies der Fachtabellen sind unverändert (Phase 2).

## Live-Vorprüfung (nur SELECT)

Alle 12 Tabellen existieren, `shared` fehlte überall. Alle 6 Konten gehören einem Nutzer (auth.users: 2 Einträge). Name „Geteiltes Konto (Malik)“: genau 1 Treffer.

## Rollback

Umgekehrte Reihenfolge, je Datei in `supabase/rollbacks/`: `…120000_household_backfill.down.sql`, dann `…110000_shared_flag.down.sql` (verwirft shared-Werte), dann `…100000_households_members.down.sql` (löscht Haushalte/Mitglieder). Vorher Phase-2-Objekte zurückrollen, die darauf verweisen.

## Test

`supabase/tests/household_phase1.sql` nach den Migrationen ausführen, alle `ok` = true.

## Ungetestet

- Keine der Migrationen und Rollbacks wurde ausgeführt (auch nicht auf einem Branch). Basis-Schema fehlt in den Migrationen (Abschnitt 8.2): Branch braucht Live-Dump.
- Der Invariantentest ist nicht gelaufen; Prüfungen G, H, K (Systemkatalog-Textformate von `proconfig`, ACL, Policy-`qual`) können Format-Anpassungen brauchen.
- Verhalten der RLS-Policies mit echten Nutzern (Eric/Malik/Außenstehender) ungetestet; Isolationstest ist Phase 2.
- Backfill-Zweige „Owner nicht eindeutig“ und „Parameter gesetzt“ nicht durchgespielt.
- Typen (`src/types/database.ts`) nicht neu generiert; Advisors nicht geprüft.
- Offen: Spalte `shared` wirkt erst mit Phase-2-Policies; `user_profiles`-Sichtbarkeit (8.5 Punkt 3) nicht Teil von Phase 1.
