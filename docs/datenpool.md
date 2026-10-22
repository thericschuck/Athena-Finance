# Datenpool: Einnahmen und Ausgaben

Stand 2026-10-21. Eine Quelle für alle Summen. Wer eine Einnahmen-/Ausgabenzahl braucht, liest sie
**hier** und rechnet die Regel nicht selbst nach.

## Fluss

```
bank_transactions (FinTS)  ─┐
transactions (manuell)     ─┴→ unified_transactions  ─→ monthly_flows ─→ monthly_flow_totals
                              (Regel steht hier)        (je Monat/Konto/Art/Kategorie)  (je Monat)
categories ─→ category_tree (Hauptkategorie, Pfad, vererbte Steuerrolle)
```

TypeScript: `src/lib/data/flows.ts` (Lesen, seitenweise) und `src/lib/finance/flow-calc.ts`
(rechnen, rein, getestet). Seiten rechnen nichts davon selbst.

## Regel

`unified_transactions.flow_kind` entscheidet. `counts_in_flow` ist `true` für:

| flow_kind | Bedeutung | zählt |
|---|---|---|
| `echt` | Konsum und normale Einnahmen (inkl. Geldautomat) | ja |
| `anlage` | Krypto, Depot, Bausparer, Sparkonto | ja |
| `forderung` | verliehenes/zurückgezahltes Geld | ja |
| `umbuchung` | zwischen eigenen Konten (Gegen-IBAN) oder manueller Transfer | **nein** |
| `anfangsbestand` | „Alter Kontostand" | **nein** |

Darstellung: Kacheln zeigen alles, was zählt, mit „davon Anlage/Forderung". Die Auswertungsseiten (Analyse, Banking) starten seit
2026-10-22 mit **allem** (Anlage und Forderung eingerechnet). Der Standard ist unter Einstellungen -> Analyse -> „Anlagen & Forderungen"
einstellbar (`user_settings.flow_default_include`: `alle` oder `konsum`) und gilt für Analyse, Banking, die Finanzanalyse im Dashboard
und die Reports (`flowDefaultFrom`, `includeFromParam`). Der Schalter in Analyse und Banking überschreibt ihn je Ansicht; nur eine
Abweichung steht in der URL (`anlage=1` alles, `anlage=0` nur `echt`). **Die Sparquote rechnet immer nur auf `echt`.**

Kontostände sind eine andere Frage: dort zählt jede Buchung, auch die Umbuchung
(`signed_amount`, `account_balance_sums_*`, `bank_balance`).

## Kategorien

Auswertungen gruppieren nach **Hauptkategorie** (`root_category_*`) mit Drilldown auf die
Unterkategorie. Gruppiert wird nach der ID, nicht nach dem Namen. Buchungen ohne Kategorie heißen
überall „Ohne Kategorie" (`UNCATEGORIZED`).

## Steuer

Die Steuer-Engine (`src/lib/tax`) hängt an `categories.tax_role` (vererbt, `category_tree`), nicht an
`flow_kind`: Es zählen nur `echt`-Buchungen mit Rolle `betriebseinnahme`/`betriebsausgabe`.
`categories.business_share` (0–100, leer = 100 %) kürzt gemischt genutzte Betriebsausgaben und wirkt
nur dort (`laden.ts`). Krypto-Veräußerungen (§ 23 EStG, FIFO, je Wallet mit Überträgen oder gesamt) rechnet
`krypto-fifo.ts`; es ist **noch nicht** an Kraken-Trades oder die Oberfläche angeschlossen, und welches
Verfahren gilt, muss der Steuerberater bestätigen.

## Ändern

1. Regel ändern: nur in der View `unified_transactions` (neue Migration, Rollback unter
   `supabase/rollbacks/`). **`with (security_invoker = on)` nicht vergessen** — `CREATE OR REPLACE VIEW`
   ohne diese Klausel setzt die Option zurück und umgeht die RLS.
2. `supabase/tests/flows_invariants.sql` ausführen; jede Zeile muss `ok = true` sein.
   **Laufzeit immer MIT RLS messen**, nicht als `postgres`: in einer Transaktion `set local role
   authenticated; select set_config('request.jwt.claims', '{"sub":"<user-id>"}', true);` und dann
   `explain (analyze)` auf die Abfrage der Seite. Ohne RLS wählt der Planer einen anderen Plan: die View
   `category_tree` wurde dadurch für jede Buchung neu berechnet (3,8 s, Statement-Timeout in der Analyse),
   ohne dass ein Test als `postgres` es zeigte. `unified_transactions` holt den Baum deshalb über eine
   `MATERIALIZED`-CTE (Migration 20261021180000).
3. `npm test` (reine Rechenfunktionen).

## Kontostand-Historie (`balance_series`)

`account_balances` hat pro Konto und Tag eine Zeile (2026-10: 18.324 Zeilen, 6 Konten x 3.054 Tage seit 2018), der Stand ändert sich aber
selten. Die App liest sie deshalb über die DB-Funktion `balance_series(p_account_id, p_from)` (Migration 20261023100000): sie liefert
**Läufe** (`von`, `bis`, `balance`) für aufeinanderfolgende Tage mit gleichem Stand, im Beispiel 386 statt 18.324 Zeilen. Der Code
rekonstruiert daraus mit `expandiereLaeufe` (`src/lib/account-history-runs.ts`) exakt die Tageszeilen von früher, denn Sparkline und Chart verteilen
ihre Punkte nach Index. Verlustfrei: ein Lauf endet bei jeder Änderung des Stands und bei jeder Lücke über einen Tag. Aufrufer:
`fetchBalanceHistory` (Konten-Seite, Konto-Detail, Athena-Werkzeug `getAccountBalanceHistory`). Eine Anfrage statt 3-5 nacheinander; die Konten-Seite
startet sie in derselben `Promise.all`-Welle wie die übrigen Abfragen. Gemessen unter RLS: 50 ms für alle Konten statt rund 300 ms für das reine
Lesen der Tageszeilen. `security invoker`, fester `search_path`, nur `authenticated` darf ausführen. Die 1.000-Zeilen-Grenze von PostgREST gilt auch
hier; `fetchBalanceHistory` blättert deshalb weiter, falls die Läufe einmal darüber wachsen.

`monthly_finance_summary` ist Archiv und wird nicht mehr geschrieben oder gelesen.

## RLS-Policies

**Regel: in jeder Policy `(select auth.uid())`, nie blankes `auth.uid()`** (ebenso `auth.jwt()`, `auth.role()`). Blank wertet Postgres den Aufruf für
jede Zeile neu aus; in Klammern mit `select` einmal je Abfrage (im Plan als InitPlan). Der Supabase-Advisor meldet Verstöße als `auth_rls_initplan`.
Migration 20261023110000 hat 119 Policies auf 73 Tabellen umgestellt (Advisor: 119 -> 0); `account_balances` fragt die eigenen Konten per
`account_id in (select id from accounts where user_id = (select auth.uid()))` ab. Neue Policies direkt so schreiben.

Gemessen (unter `authenticated`, je Abfrage): bei 720 Buchungen kein Gewinn (`account_balances` 8,2 -> 8,1 ms, `unified_transactions` 15,1 -> 16,5 ms, `bank_transactions`
0,35 -> 0,69 ms, weil der Planer bei so kleinen Tabellen den Seq Scan wählt). Der Nutzen liegt im Wachstum: der Filter ist nicht mehr pro Zeile.
Wer die Rechte prüfen will: als fremde `sub` und als `anon` liefern `bank_transactions`, `transactions`, `categories`, `account_balances`, `accounts`, `user_settings` und `insights` 0 Zeilen.

Rollback: `supabase/rollbacks/20261023110000_rls_initplan.down.sql` stellt alle Policies exakt aus `public._rls_policy_backup_20261023` wieder her und löscht die Tabelle.
Sie darf erst gelöscht werden, wenn man den Rollback nicht mehr braucht.

## Prognose

`src/lib/forecast/` (reine Funktionen, getestet) und die Seite `/finance/prognose`:

- **Cashflow** (`cashflow.ts`) mit dem **Zyklusmodell** (`zyklus.ts`): lernt aus der GANZEN Historie, wie sich
  Einnahmen und Ausgaben über den Monat (Tag im Monat) und die Woche (Wochentag) verteilen, beide Faktoren
  abwechselnd angepasst (Backfitting), damit sie sich nicht gegenseitig verfälschen. Jüngere Tage zählen mehr; die
  Halbwertszeit wählt ein Rolling-Origin-Backtest aus den Daten (das jüngste Gedächtnis, das höchstens 2 % schlechter
  ist als das beste). Das Periodogramm (Fourier) ist ein Befund, kein Modellbaustein: Die Muster sind Spitzen
  (Gehalt am 27., leere Wochenenden), keine Sinuswellen. Gehalt, Verträge und Annahmen liegen deterministisch auf
  ihren Tagen; die bisherigen Vertragsbuchungen werden vor dem Lernen aus der Historie herausgerechnet.
  Zwei Kurven: Liquidität (jeder Abfluss zählt, auch Anlagen) und Nettovermögen (Anlagen sind ein Tausch).
  **Band:** 80-%-Bereich aus den echten Abweichungen des Modells (Block-Bootstrap, deterministisch).
  Auf den echten Daten schlägt das Modell einen flachen Verlauf im Backtest kaum (Fehler etwa gleich): die
  Höhe einzelner Großposten bestimmt den Fehler, nicht ihr Tag. Schulden sind noch nicht modelliert.
- **Einmalposten** (`einmalig.ts`): Große Einzelposten dominieren die Daten (die 28 größten Ausgaben sind über die
  Hälfte aller Ausgaben). Getestet wurde, sie pauschal auszuschließen: Das verbesserte die Prognose NICHT, weil solche
  Posten (Krypto, Bargeld, Darlehen) bei dir wiederkehren. Deshalb: nur **extreme Ausreißer** (≥ max(2.000 €,
  5 × 95. Perzentil der Art)) sind standardmäßig ausgeschlossen, z. B. eine einmalige Bauspar-Auszahlung. Weitere
  große Posten stehen zur Auswahl (Seite Prognose), standardmäßig drin. Nie Kandidaten: Gehalt, Geschäftseinnahmen
  und wiederkehrende Große (≥ 3× dieselbe Gegenpartei, ähnlicher Betrag, z. B. eine Ratenzahlung). Die Entscheidungen
  stehen als Abweichungen vom Standard in `user_settings.forecast_overrides`.
- **Steuer** (`steuer.ts`): Ist-Stand plus Laufrate bis Jahresende, durch dieselbe Engine wie die Steuerseite;
  Basis und Szenario nebeneinander, Mehrsteuer, Rücklage pro Monat.
- **Annahmen** (`annahmen.ts`, `user_settings.forecast_assumptions`): Ein Gehalt (`lohn`) ersetzt das Niveau ab
  einem Monat, alles andere kommt pro Monat obendrauf.
- Athena: Werkzeug `getForecast` (nur lesend).

Eine Fortschreibung, keine Vorhersage; die Steuerzahlen sind Schätzungen.

## Vertragsvorschläge (Planung → Verträge)

Die Seite zeigt über den Verträgen "Erkannte wiederkehrende Kosten": Ausgaben, die sich in den letzten ~20 Monaten regelmäßig wiederholen und zu denen es noch keinen Vertrag gibt. Gerechnet wird über alle Konten und Zahlwege (Karte und PayPal inklusive) mit `erkenneWiederkehrend` (`src/lib/finance/wiederkehrend.ts`), unabhängig von der Kategorie "Abos". Pro Vorschlag: Betrag (bei Nutzungsabrechnung mit Spanne), Rhythmus, üblicher Tag, nächster erwarteter Termin (oder "erwartet seit", wenn überfällig) und Jahreskosten.

- "Vertrag anlegen" erzeugt per `vertragsEntwurf` (`vertragsvorschlag.ts`) einen normalen Vertrag; Name kommt aus der Abo-Unterkategorie, falls vorhanden.
- "Ausblenden" speichert den Schlüssel in `user_settings` (`vertrags_vorschlaege_ausgeblendet`); "wieder anzeigen" leert die Liste.
- Nicht vorgeschlagen: beendete Serien, Einnahmen, Überweisungen auf eigene Konten, Sparpläne und Bausparen.
- Die Berechnung ist in `try/catch` gekapselt: Fehler dort legen die Vertragsseite nicht lahm.
