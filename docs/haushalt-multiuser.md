# Haushalt / Multi-User (Eric + Malik)

> Übergabe-Dokument: Mit diesem Dokument kann jede Session die Umsetzung aufnehmen, ohne die Konzeptdiskussion zu kennen.
> Stand: 2026-10-26 · Status: **Konzept entschieden, Umsetzung NICHT gestartet. Start nur nach explizitem „Go“ von Eric.**
> Vor dem Start: `.ua/ARCHITECTURE_REPORT.md` lesen (Projektregel) und `AGENTS.md`/`CLAUDE.md` beachten (Next.js 16: Docs in `node_modules/next/dist/docs/`).

## 1. Ziel

Athena Finance ist heute ein Single-User-Tool (Eric). Malik bekommt einen eigenen Login, verknüpft sein Privatkonto, das bestehende **geteilte Konto** bleibt geteilt. Ergebnis:

- Drei Ansichten (Scope): **Ich** (eigene Konten + geteiltes Konto, so wie heute), **Malik/Partner** (seine + geteilt), **Gemeinsam** (alle Konten, geteiltes Konto nur einmal gezählt; mehr Konten, größeres Inventar, mehr Buchungen).
- Datenmodell für N Mitglieder, UI vorerst für 2.

## 2. Entscheidungen (von Eric bestätigt)

1. **Volle Transparenz:** Jedes Mitglied sieht alle Details aller Konten im Haushalt. (Spätere Option: „nur Saldo“ pro Konto – nicht jetzt.)
2. **Schreibrechte:** Jedes Mitglied darf alles im Haushalt bearbeiten. **Pflicht:** Urheber-Anzeige und Änderungslog (wer hat was geändert).
3. **Ein gemeinsamer Kategorienbaum pro Haushalt.** Persönliche Steuerattribute (Steuerrolle, `business_share`) wandern in eine Override-Tabelle pro Person.
4. N Mitglieder im Modell, 2 im UI.

## 3. Ausgangslage (Stand Graph 2026-10-20)

- Schema durchgehend owner-scoped: `user_id = auth.uid()`, ca. 73 Tabellen, ca. 119 RLS-Policies. Aktuelle Schreibweise `(select auth.uid())` (Migration `20261023110000_rls_initplan.sql`) – **beibehalten**.
- Datenschicht `src/lib/data/*`: Funktionen bekommen `client` + `userId`.
- **Service-Role-Pfade umgehen RLS** und filtern von Hand: Cron (`src/app/api/cron/*`), Edge Functions (`supabase/functions/*`), FinTS (`src/lib/fints/*`, `fints_client_state`), Kraken, Athena-Tools (`src/lib/assistant/tools/shared.ts`).
- Vorhandene Bausteine: `audit_log` (Migration `20260906200000_belege_und_audit.sql`), Eigen-IBAN-Logik (`20261022120000_own_iban_category_override.sql`), `balance_series` (`20261023100000`), Invariantentest `supabase/tests/flows_invariants.sql`, Rollback-Konvention `supabase/rollbacks/<migration>.down.sql`.
- Alle Migrationen enthalten Kopf-Kommentar (Warum/Wie) und ein `.down.sql` – diese Konvention fortführen.

## 4. Zielarchitektur

- **Besitz:** `owner_id` (heute `user_id`) bleibt. Neu: `households`, `household_members (household_id, user_id, role)`, Funktion `is_household_member(...)` (stable, security definer, search_path gepinnt, in Policies als `(select ...)` einwickeln). `shared`-Flag auf Konten, Inventar, Depot (Details Phase 0).
- **RLS:** Haushaltsdaten: Lesen **und** Schreiben für Haushaltsmitglieder. **Owner-only** bleiben: Steuer/EÜR/Steuerprofil, Krypto-Steuer (FIFO pro Person), Exchange-Keys, FinTS-Zugangsdaten/State, Athena-Chats/Settings, Reports.
- **Scope = Filter, keine Sicherheitsgrenze:** zentrale `resolveScope(user, scope)` → Konto-IDs/Owner-IDs. Alle Seiten/Datenfunktionen nutzen nur sie (ersetzt verstreute `.eq('user_id', …)`). Scope-Switcher in der App-Shell, Persistenz per Cookie/URL-Param.
- **Audit:** `audit_log` um handelnden Nutzer erweitern, per Trigger auf Kerntabellen (Buchungen, Konten, Inventar, Kategorien, Verträge). Automatik (Regeln, KI, Sync) als „System“ ausweisen.
- **Kategorien:** Baum pro Haushalt; Regeln und gelernte Zuordnungen haushaltsweit; Steuerattribute pro Person in Override-Tabelle.

## 5. Bekannte Fallstricke (müssen explizit gelöst und getestet werden)

- **Doppelzählung:** geteiltes Konto steckt in „Ich“ und „Malik“; in „Gemeinsam“ nur einmal.
- **Umbuchungen sind scope-abhängig:** privat → geteilt ist in „Ich“ Ausgabe/Einlage, in „Gemeinsam“ neutral. Eigen-IBAN-Logik muss den Scope kennen.
- **Snapshots/Vermögensverlauf:** User-Snapshot enthält das geteilte Konto, Summe zweier Snapshots ist falsch → Snapshots auf Konto-/Asset-Ebene, Aggregation beim Lesen (prüfen, wie `take_snapshot` / `balance_series` heute aufgebaut sind).
- **FinTS-Doppelsync:** Dasselbe Konto von zwei Nutzern verknüpft → doppelte Buchungen. IBAN-Dedupe im Haushalt („existiert → verknüpfen“), nur einer synchronisiert.
- **Service-Role-Pfade** dürfen nichts über Haushaltsgrenzen leaken und müssen scope-bewusst werden.
- **Kategorien-Migration** ist der riskanteste Teil (`business_share`/Steuerrollen hängen heute an Kategorien) → Rollback + Invariantentest zwingend.
- **Signup** nur per Einladung (es existiert ein offener `signUp`-Server-Action in `src/app/login/actions.ts` und `waitlist_signups`).

## 6. Fahrplan (Todo-Liste – Häkchen hier pflegen)

Arbeitsmodus: pro Phase Todo-Liste führen, Subagents für parallelisierbare Teile, **jedes Ergebnis unabhängig prüfen lassen** (Review-Agent liest Diffs, nicht die Zusammenfassung) und funktional verifizieren. Migrationen zuerst auf einem Supabase-**Branch**, Live nur mit Erics Bestätigung.

### Phase 0 – Inventur (Subagents: Schema / App-Code / Service-Role+Cron)
- [x] Jede Tabelle klassifizieren: haushalt-geteilt · owner-only · global; Ergebnis als Tabelle in diesem Dokument ergänzen (siehe Abschnitt 8; offene Klärungen dort)
- [x] Alle `user_id`-Zugriffe in Datenschicht, Server Actions, API-Routen, Cron, Edge Functions, Assistant-Tools listen (Abschnitt 8.3/8.4)
- [x] Prüfen: Aufbau Snapshots (`take_snapshot`, `balance_series`), `unified_transactions`, Views (security_invoker), `monthly_flows` (Abschnitt 8.2)
- [ ] Welche Tabellen bekommen `shared` (Konten, Inventar, Depot, Verträge/Schulden/Ziele?) – mit Eric klären, falls unklar
- Prüfung: Jede Tabelle hat genau eine Klasse; die drei Agent-Ergebnisse widersprechen sich nicht.

### Phase 1 – Fundament (Migrationen je Domäne parallel)
- [ ] `households`, `household_members`, `is_household_member`, Eric-Haushalt + Backfill
- [ ] `shared`-Flag + Backfill (bestehendes geteiltes Konto markieren – mit Eric klären, welches)
- [ ] Rollback-Skripte je Migration
- Prüfung: Migration + Rollback real auf Branch; `flows_invariants.sql` grün; Supabase-Advisors ohne neue Warnungen; Typen neu generieren (`src/types/database.ts`).

### Phase 2 – RLS, Audit, Kategorien
- [ ] Haushalts-Policies (Initplan-Schreibweise), owner-only-Tabellen unverändert streng
- [ ] Urheber-Trigger/`audit_log`-Erweiterung
- [ ] Kategorienbaum auf Haushalt umstellen + Steuer-Override-Tabelle
- [ ] Isolationstest in `supabase/tests`: Eric, Malik, Außenstehender (Außenstehender sieht nichts; owner-only bleibt privat)
- Prüfung: Test grün; Review-Agent prüft jede Policy gegen Tabelle Phase 0. **STOPP – Bericht an Eric vor Phase 3.**

### Phase 3 – Scope in der App
- [ ] `resolveScope` + Datenschicht umstellen (Subagents je Bereich: Finance, Analyse, Depot/Krypto, Assistant)
- [ ] Scope-Switcher, Doppelzähl- und Umbuchungslogik, Snapshots auf Konto-Ebene
- [ ] Service-Role-Pfade scope-bewusst
- Prüfung: Typecheck, Lint, Tests; **Regressionsvergleich:** Zahlen in „Ich“ = heutige Werte exakt; „Gemeinsam“ ist aus Einzelwerten abgleichbar; App starten und Seiten real prüfen. **STOPP – Bericht an Eric.**

### Phase 4 – Onboarding Malik
- [ ] Einladung, Signup nur per Einladung, Haushalts-Beitritt
- [ ] Kontoverknüpfung mit IBAN-Dedupe, geteiltes Konto zuordnen
- Prüfung: kompletter Ablauf mit Testnutzer im Browser.

### Phase 5 – Feinschliff
- [ ] „Zuletzt geändert von …“ + Verlaufsliste im UI
- [ ] Optional: Zuordnung pro Buchung (wer hat bezahlt), Fairness-Saldo

## 7. Rahmenbedingungen

- Eine andere Session überarbeitet derzeit die Seiten (u. a. `analyse/banking`, `src/components/bank/*`, `src/lib/bank/`). **Phase 1+2 erst nach deren Merge**, um Konflikte zu vermeiden. Vorher ist nur Phase 0 (reine Lese-Inventur) unkritisch.
- `vercel.json` nicht ohne Rückfrage ändern. `athena-finance(old)` nicht anfassen. TypeScript strict, kein `any` ohne Begründung. shadcn/ui bevorzugen.
- Nach größeren Codeänderungen Graph aktualisieren (`/understand --update`, danach `node scripts/ua-report.mjs`) – laut Memory erst ganz am Ende.
- Neuer Code ab jetzt scope-fähig denken: kein hartes `.eq('user_id', …)` ohne Grund.

## 8. Ergebnis Phase 0 (Inventur, Stand 2026-10-26, nur gelesen)

Quellen: drei Lese-Agents (Schema, App-Code, Service-Role). Zählungen stammen aus Grep (Graph-MCP war nicht verbunden), sind Obergrenzen. Der Schema-Agent hat zusätzlich die Live-DB mit reinen SELECTs auf Systemkataloge abgefragt.

### 8.1 Tabellenklassen (Live: 76 Tabellen, überall RLS an)

| Klasse | Tabellen |
|---|---|
| HAUSHALT-GETEILT | accounts, account_balances, transactions, bank_transactions, bank_balance, categories (Baum; Steuerattribute je Person in Override-Tabelle), valuables + valuable_valuations/_images/_documents, depots, depot_transactions, savings_plans, depot_holdings, audit_log (Lesen), asset_audit_log |
| ABGELEITET | net_worth_snapshots, portfolio_snapshots, asset_valuations (Snapshots: siehe 8.2) |
| OWNER-ONLY | exchange_keys, exchange_connections, fints_client_state, kraken_trades, kraken_ledger, kraken_order_log, reports, ai_* (10 Tabellen), user_settings, insights, income_targets (Vorschlag), Algo-Trading-Altlast (combos, indicators, strategies, positions, tpi_*, roc_* usw.), Archiv: net_worth_snapshots_backup_20260830, monthly_finance_summary |
| GLOBAL | tax_tariffs, euer_zeilen, fund_prices, fund_price_cache, fund_price_history, fund_sources, crypto_price_cache, waitlist_signups, trading_pairs |
| KLÄRUNG MIT ERIC | contracts (+contract_executions), debts (+debt_payments), savings_goals, budget_categories/budget_items, assets (+asset_valuations; Kraken-Spiegel), belege, user_profiles (Name/Avatar für Urheber-Anzeige), income_targets |

### 8.2 Schema-Befunde
- **Migrationen unvollständig:** Es fehlen die CREATE-Statements der Basistabellen (accounts, categories, transactions, contracts, debts, assets, audit_log, user_settings u. a.). Ein Supabase-Branch aus den Migrationen allein lässt sich nicht aufbauen; Phase 1 braucht einen Schema-Dump der Live-DB als Basis.
- **`unified_transactions`** joint auf `a.user_id = bt.user_id` und `own.user_id = bt.user_id`. Sobald Konto und Buchung verschiedenen Usern gehören, fallen Buchungen aus der View, und Eigen-IBAN-Umbuchungen werden nicht erkannt. Join muss konto-/haushaltsbasiert werden. Die Eigen-IBAN-Logik ist nicht scope-bewusst.
- **Snapshots:** `account_balances` ist pro Konto/Tag (haushaltstauglich), `net_worth_snapshots` pro User/Tag (Doppelzählung). `fn_take_snapshot` iteriert über `auth.users`; Trigger auf `bank_balance` rechnet bei jedem Sync alle User neu. „Gemeinsam“ aggregiert beim Lesen aus Konto-/Asset-Ebene; `balance_series` ist schon invoker und kontobasiert.
- **Unique-Keys mit `user_id`:** accounts(user_id, bank_iban), bank_transactions(user_id, external_id), bank_balance(user_id, account_iban), depot_holdings, assets, depots. Gleiche IBAN bei zwei Nutzern ergibt Doppelkonten und Doppelbuchungen.
- **Kategorien:** Steuerattribute (`tax_role`, `euer_zeile`, `business_share`) hängen direkt an `categories`. `flow_kind` in der View ist namensabhängig (‚Schulden‘, ‚Transfers‘). Kein Unique auf Namen, bekannte Duplikate. Regeln und gelernte Zuordnungen liegen im Code, nicht in Tabellen („haushaltsweit“ = Code-Arbeit).
- **audit_log:** Trigger nur auf transactions, bank_transactions, categories, belege. `user_id` = Täter, wenn eingeloggt, sonst Zeilenbesitzer (kein „System“-Marker). SELECT nur eigene Zeilen.
- **Sicherheits-Auffälligkeiten (auch ohne Haushalt):** `fund_prices`/`fund_price_history` sind für jeden eingeloggten User schreib-/löschbar; Policies auf valuable_* prüfen den Eltern-Besitz nicht; Storage-Pfade beginnen mit der User-ID (geteiltes Inventar kollidiert).
- **Hartkodierte Nutzerbezüge** in Migrationen (E-Mail in 20260811130000, UUID in 20260902000003); `trg_link_bank_account` setzt `institution='Raiffeisenbank'` fest.
- **Widerspruch zwischen den Agents (Live gilt):** `fints_client_state` hat laut Live-DB eine ALL-Policy für den Owner (nicht „RLS ohne Policy“). Bleibt owner-only, ist aber vom Client les-/schreibbar.

### 8.3 Code-Befunde (Phase 3)
- Datenschicht folgt überall `fn(supabase, userId)` mit `.eq('user_id', …)` – Hebel für `resolveScope`.
- Umbuchungsregel in mindestens 4 TS-Kopien (`bank/auswertung`, `bank/buchungen`, `finance/dashboard-calc`, `vertraege/rechnen`) plus DB. Eine gemeinsame Quelle schaffen; `eigeneIbans` (`data/bank-seite.ts`) kommt scope-abhängig.
- Namenskollision: `src/lib/bank/scope.ts` meint Zeitraum/Konto, nicht Haushalt. Neues Modul anders benennen (z. B. `src/lib/haushalt/`).
- Schwere Stellen: `bank-seite.ts`, `wertverlauf.ts`, `snapshot-actions.ts`, Kategorien-Actions, FinTS/Kraken-Sync.
- Arbeitspakete Phase 3: A Finance · B Analyse/Dashboard/Verlauf · C Depot/Krypto/Inventar/Strategie · D Assistant (erst nach Commit der anderen Session) · E Owner-only/Sonstiges · F Service-Role (Cron, FinTS, Edge).
- Konfliktzone (uncommitted): `assistant/actions.ts`, `lib/assistant/actions/{contracts,format,goals}.ts`.

### 8.4 Service-Role-Befunde
- **Single-Tenant-Engpässe:** FinTS-Login global in Env + `BANK_SYNC_USER_ID`; `REPORT_USER_ID`/`REPORT_RECIPIENT_EMAIL`; Waitlist-Admin an `BANK_SYNC_USER_ID`.
- FinTS-Dedupe: `household_id` + Unique `(household_id, bank_iban)`, `sync_owner` je Konto, Keys auf `account_id` statt `user_id`.
- Assistant: Tool-Fabriken bekommen `ScopeContext` statt `userId`, Tool-Schemas ohne Scope-Feld. Mit Haushalts-RLS entfällt die doppelte Absicherung `.eq user_id`.
- `adminClient()` siebenfach dupliziert → zentrale Factory `src/lib/supabase/admin.ts`.
- `vercel.json` ruft die Python-Funktion; Node-Route `cron/bank-sync` ist verwaist. `execute-savings-plans` prüft kein Secret im Code.
- Signup: `signUp` hat keinen UI-Aufrufer, ist aber als Server Action aufrufbar; öffentliches Signup zusätzlich im Supabase-Dashboard abschalten.

### 8.5 Offene Klärungen mit Eric (blockieren Phase 1)
1. Welches Konto ist „das geteilte“ (Name/IBAN)? Steht in keiner Migration.
2. Haushalt-geteilt oder privat: Verträge, Schulden, Sparziele, Budget (budget_*), Krypto-Assets (assets), Belege, income_targets.
3. user_profiles: Name/Avatar für Haushaltsmitglieder sichtbar machen (für Urheber-Anzeige)?
4. Hat Malik schon einen Auth-User (Migrationen erwähnen 2–3 Auth-User)?
5. Schema-Basis für den Supabase-Branch: Dump der Live-DB erzeugen (Migrationen sind unvollständig).

## 9. Stand der Umsetzung (2026-10-27)

- **Phase 0:** erledigt (Abschnitt 8).
- **Phase 1:** LIVE. Migrationen `households_members`, `household_shared_flag`, `household_backfill` per apply_migration angewendet. Haushalt Schuck mit Eric (owner) und Testaccount (member). Ein geteiltes Konto markiert. Die Repo-Dateien tragen die Zeitstempel 20261027*, die Live-Historie die Anwendungszeit (bekannte Drift, siehe Baseline).
- **Phase 2:** LIVE. `household_rls`, `household_audit_actor`, `categories_household`. Vorab: unabhängiger Review (Korrekturen eingearbeitet) und rückrollender Isolationstest `supabase/tests/household_isolation.sql` (140/140). Nach dem Anwenden: Lesetest als Eric und Testaccount (Konten 6/6, Buchungen 726/726, Kategorien 48/48; owner-only-Tabellen für den Testaccount leer), keine Audit-Schein-Zeilen.
- **Baseline** des Live-Schemas: `supabase/baseline/` (ungetestet, Dokumentation/Wiederherstellung).
- **Entscheidungen seit Abschnitt 2:** belege und income_targets bleiben owner-only; categories-Änderungen sind im Änderungslog für Peers nicht sichtbar (Steuerattribute); asset_audit_log für Peers nur lesen/anhängen.
- **Offen / Warnung:** Phase 3 (Scope in der App) fehlt. Solange summieren alle Views beide Haushaltsmitglieder. Der Testaccount darf bis dahin keine Konten/Buchungen anlegen, sonst verfälscht er Erics Zahlen. Phase 4 (Malik beitreten lassen) erst nach Phase 3. Offene Altlasten: fund_prices/fund_price_cache für jeden eingeloggten User schreibbar; Storage-Pfade beginnen mit der User-ID (geteiltes Inventar); pg_cron-Token im Klartext; Steuer-Overrides driften, bis die Schreibpfade in Phase 3 umgestellt sind.

### Bekannte Effekte (Phase 3, Review-Befunde, bewusst nicht behoben)

- **W5 monthly-report:** Ohne `REPORT_USER_ID` schickt `cron/monthly-report` den Report an jeden Nutzer mit Konto (auch Testaccount/Malik; Daten bleiben owner-only). Vor Phase 4 `REPORT_USER_ID` setzen, falls unerwünscht.
- **W2 Switcher/Teilen schon jetzt sichtbar:** Eric hat mit dem Testaccount als Mitglied `available.length > 1`. Er sieht den Scope-Switcher und die Teilen-Optionen, obwohl Malik noch nicht eingeladen ist. Scope 'ich' liefert für Eric weiterhin die bisherigen Zahlen.
- **W3 Assistant-Prompt:** Der Scope-Abschnitt im Athena-Prompt erscheint wegen des Testaccounts bereits für Eric (Partner vorhanden).
- **Vermögensverlauf 'ich':** liest `net_worth_snapshots`, solange nur der Owner geteilte Konten besitzt (`ctx.sharedFremdBesitz`); sonst Funktion `net_worth_series`. Geteilte Assets/Depots von Peers sind in dieser Prüfung nicht erfasst.

### Phase 5 (Stand 2026-10-27, nur Code, nichts angewendet)

- **Änderungslog:** Route `/aenderungen` (Filter Bereich, Person, Zeitraum; cursorbasiert, 50 je Seite; Link zum Objekt). Navigationseintrag nur bei `hatPartner(ctx)`, die Seite selbst funktioniert für alle (Alleinstehende sehen nur eigene Änderungen). Daten: `src/lib/data/aenderungen.ts` (liest nur `v_audit_feed`), Formatierung rein in `src/lib/aenderungen/format.ts` (Tests dort).
- **„Zuletzt geändert von …“:** Komponente `ZuletztGeaendert`, eine gebündelte Abfrage je Seite. Eingebaut in Konto-Detail, Vertrag-Detail, Schulden- und Sparziel-Zeilen, Inventar-Detail, Depot-Kopf, Buchungs-Detail. Ohne Partner wird nichts abgefragt oder angezeigt.
- **Datenschutz im Log:** IBANs nie im Satz (als Name nur maskiert, `DE89 •••• 3000`), Notizen/Beschreibungen/Verwendungszweck/Seriennummern nur als „geändert“, Textwerte auf 30 Zeichen gekürzt. Der Name des Akteurs kommt aus `ctx.members` (die View liefert für Peers sonst „Mitglied“, bis die Peer-Sicht auf `user_profiles` existiert).
- **Optionaler Index:** `supabase/migrations/20261029120000_audit_record_idx.sql` (nicht angewendet; bei 470 Zeilen aktuell nicht nötig, sinnvoll sobald der Sync viele Zeilen schreibt).
- **Bewusst offen: Fairness-Saldo / „wer hat bezahlt“ pro Buchung.** Entscheidungsgrundlage für Eric:
  - Datenmodell: neue Spalte `paid_by uuid` (references auth.users, null = Kontoinhaber/unklar) auf `transactions` und `bank_transactions`, optional `split_ratio numeric` (Default 0.5). Bei Buchungen auf einem geteilten Konto ist „wer hat bezahlt“ aus der Bank nicht ableitbar, daher manuell oder per Regel („Konto X = Eric zahlt“).
  - Berechnung: je Monat Summe der gemeinsamen Ausgaben, die jede Person bezahlt hat, minus ihr Anteil (Gesamt x Quote). Das Ergebnis ist der Ausgleichsbetrag (Eric schuldet Malik oder umgekehrt). Umbuchungen und private Ausgaben bleiben außen vor; Erstattungen verringern den Anteil des Zahlers.
  - UI: Auswahl „Bezahlt von“ im Buchungs-Detail und als Sammelaktion; Karte „Ausgleich“ auf der Haushaltsansicht (Scope Gemeinsam) mit Monatswahl und Button „Als ausgeglichen markieren“ (Ausgleichsbuchung).
  - Aufwand: ca. 1 Migration, 2 Datenfunktionen mit Tests, 1 Karte, Regelbaustein; Risiko: Quoten und Sonderfälle (Kinder, Urlaub). Empfehlung: erst nach einigen Wochen realer Nutzung entscheiden, ob der Bedarf besteht.

### Aufraeumen nach Phase 3 (2026-10-28, nur Code)

- Uebergangsschicht `ScopeArg`/`scope-arg.ts` entfernt: Datenfunktionen nehmen nur `ScopeContext`; owner-only-Pfade (Reports, Erinnerungen) haben eigene `...FuerNutzer`-Funktionen mit explizitem `userId`. Details und Regeln fuer Service-Role-Pfade: `docs/haushalt-scope-api.md`.
- Kompatibilitaetsschalter `STEUER_OVERRIDES_LIVE` (Rueckfall/Doppelschreiben der Legacy-Spalten) und `VALUABLES_SHARED_LIVE` (ID-Umweg) entfernt; die Legacy-Spalten bleiben bis zu einer eigenen Migration in der DB.
- Eine Definition `hatPartner(ctx)` statt `istAlleinstehend`/`available.length > 1`/`mitHerabstufung`.
