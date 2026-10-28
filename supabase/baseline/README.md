# Baseline-Schema (Stand Live-DB 2026-10-26)

Rekonstruiert ausschliesslich lesend aus der Live-DB (Projekt jefmszovqziiqxotncjm). **UNGETESTET**: nie gegen eine leere DB ausgefuehrt.

## Dateien und Reihenfolge

`live_schema_2026-10-26.sql` ist die Gesamtdatei (Teile in dieser Reihenfolge verkettet). Alternativ einzeln:

| Nr | Datei | Inhalt |
|----|-------|--------|
| 1 | 01a-01d_tables.sql | Extensions, Sequenz, 77 Tabellen (Spalten, Defaults, generated columns, NOT NULL) |
| 2 | 02a_constraints.sql | 76 PK, 26 UNIQUE, CHECK (187 Constraints gesamt) |
| 3 | 03_indexes.sql | 87 weitere Indizes |
| 4 | 02b_foreign_keys.sql | 104 Foreign Keys (braucht `auth.users`) |
| 5 | 04a/04b functions | 20 Funktionen |
| 6 | 05_views.sql | 12 Views, security_invoker, Abhaengigkeitsreihenfolge |
| 7 | 06_triggers.sql | 22 Trigger auf public + 1 auf auth.users |
| 8 | 07_rls_policies.sql | RLS enable (alle Tabellen, kein FORCE) + 148 Policies |
| 9 | 08_grants.sql | nur Abweichungen vom Supabase-Default |
| 10 | 09_storage.sql | 6 Buckets + 21 storage.objects-Policies |
| - | 10_cron_jobs_DOKUMENTATION.sql | pg_cron-Jobs, nur Kommentar, ohne Secrets |

## Hinweise

- Zusammen mit den Repo-Migrationen: Migrationen, die dieselben Objekte per CREATE anlegen, kollidieren. Entweder die Baseline **statt** der Migrationen verwenden oder bei Migrationen `IF NOT EXISTS` ergaenzen. Mit einem `supabase db reset` nur dann kombinieren, wenn die Baseline als erste Migration (aelterer Zeitstempel) eingeordnet wird und die alten Migrationen entfallen.
- Voraussetzungen: Supabase-Stack (Schemas `auth`, `storage`, Rollen anon/authenticated/service_role, Funktionen `auth.uid()`, `auth.role()`, `storage.foldername()`). Extensions live zusaetzlich: pg_stat_statements, supabase_vault, pg_cron, pg_net (nicht in der Baseline angelegt).
- Zwei Tabellen sind Einmal-Sicherungen und fuer die App nicht noetig: `_rls_policy_backup_20261023`, `net_worth_snapshots_backup_20260830`.
- Nicht enthalten: Daten (auch Stammdaten wie `tax_tariffs`, `euer_zeilen`, `trading_pairs`, `fund_sources`), Edge Functions, Auth-Konfiguration, Vault-Secrets, Realtime-Publikationen, cron-Jobs als ausfuehrbarer Code.
- `fn_take_snapshot` und `fn_snapshot_after_bank_sync` sind SECURITY DEFINER und lesen `auth.users`.
- Der Cron-Job-Command enthaelt live einen Klartext-Bearer-Token (Sicherheitshinweis: besser in Vault auslagern und rotieren).
