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

`monthly_finance_summary` ist Archiv und wird nicht mehr geschrieben oder gelesen.

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
