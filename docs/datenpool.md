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

Darstellung: Kacheln zeigen alles, was zählt, mit „davon Anlage/Forderung". Diagramme starten in der
Konsum-Sicht (nur `echt`); der Schalter `anlage=1` (URL) rechnet Anlage und Forderung dazu
(`FlowKindToggle`, `includeFromParam`). **Die Sparquote rechnet immer nur auf `echt`.**

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

- **Cashflow** (`cashflow.ts`): Median der letzten 6 abgeschlossenen Monate als Basis (Einnahmen ohne Lohn,
  Lohn, Ausgaben), Vertragstermine auf ihrem Abbuchungstag (stecken schon in der Basis, werden nicht doppelt
  gezählt), Tagessimulation der Liquidität. Zwei Kurven: Liquidität (jeder Abfluss zählt, auch Anlagen) und
  Nettovermögen (Anlagen sind ein Tausch). Schulden sind noch nicht modelliert (`debts.monthly_payment` ist leer).
- **Steuer** (`steuer.ts`): Ist-Stand plus Laufrate bis Jahresende, durch dieselbe Engine wie die Steuerseite;
  Basis und Szenario nebeneinander, Mehrsteuer, Rücklage pro Monat.
- **Annahmen** (`annahmen.ts`, `user_settings.forecast_assumptions`): Ein Gehalt (`lohn`) ersetzt das Niveau ab
  einem Monat, alles andere kommt pro Monat obendrauf.
- Athena: Werkzeug `getForecast` (nur lesend).

Eine Fortschreibung, keine Vorhersage; die Steuerzahlen sind Schätzungen.
