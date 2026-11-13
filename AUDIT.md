# Audit Athena Finance

Stand: 12.11.2026, Commit `d4461a0` (main, sauberer Arbeitsbaum). Nur gelesen, nichts am Code geändert.

## Das Wichtigste zuerst

1. **Die Codebase ist in gutem Zustand.** 0 Typfehler, 0 `any`, 0 `@ts-ignore`, 1024 von 1024 Tests grün in 10 s, 7 Lint-Warnungen. Die Probleme sind keine Hygiene-Probleme, sondern liegen an drei Stellen: Geld-Korrektheit in den Integrationen, stille Fehler in der Datenschicht, und Seiten, die die komplette Buchungshistorie laden.
2. **Drei Befunde können heute falsche Zahlen oder echte Orders erzeugen** und sollten vor allem anderen geprüft werden: der Sparplan-Cron (möglicherweise tägliche Doppelbuchungen), die Bestätigung von Athena-Aktionen (Kraken-Orders doppelt möglich) und der Cloud-Bank-Sync nach einer App-Freigabe (importiert 0 Buchungen ohne Warnung). Details in 1.3.
3. **Heatmap, Sankey und Cashflow-Kalender sind nicht „geplant", sondern gebaut**, getestet und auf `/analyse` eingebunden. Was dort fehlt, ist Feinschliff (siehe 2.2).
4. **Die RLS ist solide, die Ränder nicht.** Alle Tabellen haben RLS, alle Views `security_invoker`, die Haushalts-Policies sind sauber. Offen sind drei Edge Functions, die mit dem öffentlichen anon-Key von außen auslösbar sind, eine Python-Funktion, die bei fehlendem Secret offen ist, und die Frage, ob die öffentliche Registrierung im Supabase-Dashboard wirklich abgeschaltet ist (1.6).

## Methode und Grenzen

- Fünf parallele Lese-Durchgänge (Datenschicht/Server, Client/State, Integrationen/Fachlogik/Tests, Produkt-Inventur, Sicherheit/Schema), dazu eigene Läufe von `tsc --noEmit`, `eslint` und Code-Metriken. `npm test` lief einmal.
- Befunde mit **✔** habe ich selbst an der genannten Stelle im Code nachgeprüft. Befunde ohne Markierung stammen aus einem Teil-Durchgang und sind mit Datei und Zeile belegt, aber nicht von mir gegengelesen.
- Nichts wurde im Browser gesehen, nichts gegen die echte Datenbank oder externe APIs geprüft, kein Build, kein Profiler. Performance-Aussagen sind aus dem Code hergeleitet.
- Der MCP-Server `code-review-graph` war nicht erreichbar; gearbeitet wurde mit `.ua/ARCHITECTURE_REPORT.md` (Stand 20.10., inzwischen veraltet: nennt 544 Dateien, es sind 951 TS/TSX-Dateien) und direktem Lesen.

### Zahlen

| Kennzahl | Wert |
|---|---|
| TS/TSX-Dateien in `src` | 951 (ca. 76.000 Zeilen, davon 4.449 generierte DB-Typen) |
| Testdateien / Tests | 124 / 1024, alle grün, 10,3 s |
| `'use client'`-Dateien | 278 (257 ohne Landing) |
| Seiten / Route Handler / Server-Action-Dateien | 45 / 35 / 36 |
| `error.tsx` | 4 (analyse, crypto, depot, Dashboard-Fallback) |
| Migrationen | 106, plus `baseline/` und `rollbacks/` |
| Scheduler | 7 Vercel-Crons + 3 pg_cron-Jobs |
| CI, Pre-Commit-Hooks, Fehlermonitoring | keines im Repo |
| Commits | 211 seit 02.03.2026 |

---

## 1. Architektur-Audit

### 1.1 Das tatsächliche Muster

Eine Seite ruft `requireAuthUser()` und parallel `resolveScope` und `getSettings` (per React `cache()` mit dem Layout geteilt). Ein Seiten-Loader `lade<Seite>(supabase, ctx, …)` aus `src/lib/data/*-seite.ts` holt alles in einem `Promise.all` und ruft reine Rechenfunktionen aus `src/lib/<bereich>`. Das Ergebnis geht an Server-Abschnitte, die teils hinter `<Suspense>` nachladen, und von dort als aufbereitete Form an Client-Charts. Mutationen sind Server Actions mit Zod, Auth und RLS. Filterzustand liegt in der URL (`providers/url-filters.tsx`), es gibt keinen globalen Client-Store und keine Client-Cache-Bibliothek.

Das Muster ist gut und wird in den neueren Bereichen (Analyse, Verlauf, Bankdaten, Dashboard) eingehalten. Durchbrochen wird es in den älteren Inseln: **Depot** (Client-Monolith, lädt über Server Actions), **Krypto-Actions** (Lese-Getter in einer `'use server'`-Datei), **Athena-Tools** (eigene Query-Schicht) und der **Hook `use-bank-data`**.

### 1.2 Was auffallend gut gelöst ist

- **`src/lib/data/flows.ts`**: ein einziger Lesepfad für Einnahmen und Ausgaben, die Regel liegt in der DB (`counts_in_flow`), paginiert mit stabiler Sortierung und wirft bei Fehlern statt still zu kürzen.
- **`src/lib/supabase/server.ts`**: `getAuthUser` per `cache()` und `getClaims()`, mit dokumentiertem Trade-off; `requireAuthUser` gegen den Null-Absturz. ✔
- **`src/components/providers/url-filters.tsx`**: `useOptimistic` plus Transition für Server-Filter, `localKeys` ohne Server-Roundtrip.
- **Recharts ist durchgehend lazy**: alle 25 importierenden Dateien hängen hinter `next/dynamic`. `gsap` und `lenis` liegen nur in der Landing, `@react-pdf/renderer` nur serverseitig.
- **Steuer und FIFO als reine, getestete Funktionen** (`src/lib/tax/`): Haltefrist nach §§ 187/188 BGB, Freigrenze statt Freibetrag, was nicht bewertet ist, steht im Ergebnis.
- **Athenas Schreibaktionen** laufen nur über `ai_pending_actions` mit erneuter Validierung bei der Ausführung; Fremdtexte werden mit `untrust()` markiert.
- **`src/lib/data/mutation.ts` (`requireRows`)**: macht 0-Zeilen-Mutationen unter Haushalts-RLS zu Fehlern.
- **Kommentare mit Vorfallbezug** (Datum, Betrag, Ursache). Sie haben dieses Audit deutlich erleichtert, weil Absicht und Versehen meist unterscheidbar sind.

### 1.3 Befunde: Geld und Daten können falsch werden

**A1. Sparplan-Cron: Doppelbuchungsprüfung per `like` auf einer DATE-Spalte** ✔ (Code), Wirkung in der DB ungeprüft
- `supabase/functions/execute-savings-plans/index.ts:40-47`: `.like('transaction_date', `${monthPrefix}-%`)` mit `.maybeSingle()`, das Ergebnis wird nur als `data` gelesen, `error` nicht.
- `transaction_date` ist `DATE` (`supabase/migrations/20260309000000_depot_module.sql:40`). Postgres kennt kein `date LIKE text`; schlägt die Abfrage fehl, ist `existing` leer und der Plan wird gebucht. Der pg_cron-Job 26 läuft laut `supabase/baseline/10_cron_jobs_DOKUMENTATION.sql` täglich um 9 Uhr. Folge wäre: ab dem Ausführungstag jeden Tag eine weitere Sparplan-Buchung.
- Ich habe das nicht gegen die Datenbank geprüft. Diese Abfrage klärt es in einer Minute:
  ```sql
  select isin, date_trunc('month', transaction_date) m, count(*)
  from depot_transactions where transaction_type = 'savings_plan'
  group by 1, 2 having count(*) > 1;
  ```
- Fix: `.gte('transaction_date', monatsErster).lt('transaction_date', naechsterMonatsErster).limit(1)`, bei `error` nicht buchen. Zusätzlich ein Unique-Index je (Nutzer, ISIN, Monat) für `savings_plan`. In derselben Datei (Z. 55-64) fehlt ein Alterscheck auf `fund_price_cache`: ein Wochen alter Kurs wird als Ausführungskurs gebucht.

**A2. Bestätigte Athena-Aktionen sind nicht gegen Doppelausführung gesichert, auch nicht Kraken-Orders** ✔
- `src/app/(dashboard)/assistant/actions.ts:137-143` begründet im Kommentar, zwei parallele Klicks seien unkritisch, weil „hier alles idempotent ist (Kategorie setzen, Vertrag deaktivieren)". Der Status wechselt erst nach `runWriteAction` (Z. 162-168).
- Die Begründung stimmt nicht mehr, seit Rebalancing eine Aktion ist: `src/lib/kraken/rebalance-execution.ts:103` platziert Market-Orders ohne Idempotenzschlüssel. Doppelklick oder zwei Tabs während der Order-Laufzeit führen Kauf-Legs doppelt aus; nur Verkäufe sind durch den Guthaben-Check gedeckelt.
- Fix: vor der Ausführung atomar beanspruchen (`update … set status = 'executing' where id = … and status = 'pending' returning id`, bei 0 Zeilen abbrechen), bei Fehler auf `failed` setzen. Zusätzlich `userref` an Kraken mitgeben. Das behebt auch den im Kommentar gefürchteten umgekehrten Fall, weil `executing` nicht wie `executed` aussieht.

**A3. Cloud-Bank-Sync verliert nach einer App-Freigabe alle Umsätze** ✔
- `api/bank-sync.py:505`: `txns = settle(client, client.get_transactions(...))`. Der lokale Sidecar hat genau diesen Fall behoben (`scripts/fints/fints_sync.py:437-482`, `settle_transactions`, mit ausführlichem Kommentar): nach einer SCA liefert python-fints das rohe Tupel `(booked_streams, pending_streams)`. Die Cloud-Funktion iteriert es, findet kein `amount` (Z. 516-529) und überspringt alles. Ergebnis: `ok, imported: 0`, keine Warnung.
- Fix: `settle_transactions` in die Cloud-Funktion übernehmen. Besser: Parsing, Serialisierung und External-ID in ein gemeinsames Python-Modul, das beide Wege importieren (siehe A4).

**A4. Zwei Bank-Sync-Implementierungen, die auseinanderlaufen**
- Produktion (`api/bank-sync.py`, Vercel-Cron) und lokaler Sidecar (`scripts/fints/` + `src/lib/fints/index.ts`) unterscheiden sich: Die Cloud holt keine Depotbestände und keine Extra-Konten, schreibt bei fehlendem Betrag den Saldo `0.0` (`api/bank-sync.py:488-498`; der Node-Pfad filtert das in `src/lib/fints/index.ts:319`), überschreibt `account_name` mit `null` ✔ (`api/bank-sync.py:495`) und kennt den Legacy-Abgleich nicht. Die Kategorieregeln existieren dreifach (`fints/categorize.ts`, `ai-categorize-regeln.ts`, `_CATEGORY_RULES` im Python).
- Die Kommentare widersprechen sich: Python nennt ein Duplikat „harmless" (`api/bank-sync.py:33-34`), der TS-Code dokumentiert, dass sechs solche Zeilen den Eröffnungssaldo um 269,66 € verschoben haben (`src/lib/fints/index.ts:389-393`).
- Fix kurzfristig: Saldo nur mit Betrag schreiben, `account_name` weglassen statt `null`. Mittelfristig: eine Implementierung (siehe Abschnitt 3).

**A5. Stablecoins und Fremdwährungen werden mit festen Kursen bewertet** ✔
- `src/lib/crypto/coin-registry.ts:67-78`: `usd: 0.92`, `'usd-coin': 0.92` usw. `src/lib/crypto/coingecko.ts:23-28` löst diese IDs **vor** jedem Netzaufruf auf. Das ist also kein Fallback, sondern der Normalweg. 0,92 entspricht EUR/USD 1,087.
- Beispiel: 10.000 USDC bei EUR/USD 1,17 sind 8.547 € wert, angezeigt werden 9.200 €. Der Nacht-Snapshot und der Kraken-Sync rechnen mit echten Kursen, Live-Anzeige und Verlauf weichen also voneinander ab.
- Fix: Stablecoins aus der Tabelle nehmen (sie laufen dann über Kraken/CoinGecko), Fiat über einen echten Kurs; die Konstante nur als gekennzeichneter Notfall (`source: 'approx'`).

**A6. Krypto-Steuer: USD-Trades mit dem Kurs vom Sync-Tag**
- `src/lib/kraken/history.ts:108`: Der USD-Kurs ist als Schätzung gekennzeichnet (`eur_kurs_geschaetzt`), das ist dokumentiert. Nicht dokumentiert sind drei Folgen: die nachgeladene Alt-Historie bekommt den heutigen Kurs; der jeweils neueste Trade wird bei jedem Sync überschrieben (Z. 172/181), die Steuerzahl ändert sich von Sync zu Sync; stille Konstanten (`1.08` in `coingecko.ts:59-73`, `usdPerEur: 1` in `sync.ts:113-115`) landen dauerhaft in `kraken_trades`.
- Fix: EZB-Tageskurs je Handelstag einmalig setzen, im Upsert nicht überschreiben, bei fehlendem Kurs `null` statt Konstante.

**A7. Yahoo-Fondskurse: erster Treffer, Währung ungeprüft**
- `supabase/functions/fetch-fund-price/index.ts:24-25, 39-40`: `quotes[0]?.symbol` als Rückfall, `currency ?? 'EUR'`. Liefert die ISIN-Suche ein Listing in GBp, steht der Kurs 100-fach im Cache; `src/lib/data/depot.ts` rechnet `shares × price` ohne Währung, und der Sparplan-Cron kauft zu diesem Kurs.
- Fix: nur EUR-Listings akzeptieren, Plausibilitätsgrenze gegen den Vortag, Kursalter im Depot anzeigen.

**A8. Dedup-Schlüssel ohne Bankreferenz**
- `src/lib/fints/index.ts:167-169` (gleich in `api/bank-sync.py:163-166`): Fallback `iban|valueDate|amount|description`. Zwei identische Kartenzahlungen am selben Tag ohne Referenz fallen zusammen, die zweite wird still verworfen. Wie oft die Bank Buchungen ohne Referenz liefert, ist unklar.
- Fix: im Fallback einen Zähler je identischem Tupel pro Abruf anhängen und die Zahl referenzloser Zeilen loggen.

**A9. FIFO sortiert am selben Tag nach Art statt nach Uhrzeit**
- `src/lib/tax/krypto-fifo.ts:179-183`. Ein Verkauf um 9 Uhr und eine Auszahlung um 18 Uhr werden als „erst Übertrag, dann Verkauf" gerechnet; der Verkauf kann dadurch das jüngere, steuerpflichtige Los treffen. Unklar ob Absicht für manuell erfasste Daten ohne Uhrzeit. Fix: nach `seq` sortieren, wenn alle Ereignisse des Tages einen Zeitstempel haben.

### 1.4 Befunde: stille Fehler in der Datenschicht

**B1. Supabase-`error` wird in weiten Teilen verworfen** ✔
- `src/lib/data/overview.ts:36` (`const { data } = await applyAccountScope(...)`, danach `data ?? []`), durchgehend auch in `finance-accounts.ts`, `finance-planning.ts`, `depot.ts`. Ein fehlgeschlagener Read wird zu „0 € Nettovermögen" oder „keine Konten". `flows.ts`, `verlauf-*.ts` und `bank-seite.ts` werfen dagegen sauber; die Schicht ist uneinheitlich.
- Am folgenreichsten in `src/lib/haushalt/resolve.ts:39-41` ✔: schlägt die `accounts`-Abfrage fehl, ist der Scope leer und **jede** Seite zeigt den Leerzustand statt eines Fehlers.
- Fix: ein Helfer `lies(query, 'name')`, der bei `error` wirft; zuerst in `resolve.ts`. Dazu `error.tsx` für finance, inventar, assistant, settings, strategy (Muster steht in `analyse/error.tsx`).

**B2. Unbegrenzte Selects laufen in die 1.000-Zeilen-Grenze** ✔
- `src/lib/data/depot.ts:173-177`: `fund_prices` aufsteigend sortiert, ohne Limit oder Paginierung; `supabase/config.toml:18` setzt `max_rows = 1000`. Nach rund 1.000 Kurstagen endet der Verlauf still **vor** dem aktuellen Ende. Gleiches Muster bei `depot_transactions` (Z. 226) und `fund_price_history` (Z. 240). Ob das gehostete Projekt denselben Wert hat, ist nicht geprüft.
- Weitere Stellen: `src/lib/data/vertraege-seite.ts:92` (`limit(2000)` wirkt nicht), `src/lib/data/finance-accounts.ts:103` (ein `limit(1000)` über mehrere Konten), `src/lib/fints/index.ts:549-556` (gelernte Kategorien aus höchstens 1.000 unsortierten Zeilen, eine frische Korrektur kann fehlen).
- Fix: View „letzter Kurs je ISIN" (`distinct on`), Bestand je ISIN als View/RPC, sonst paginieren wie in `flows.ts`.

**B3. Schleifen, die bei Fehlern still kürzen**
- `src/lib/data/finance-transactions.ts:247-255` (Konto-Detail: Fehler auf Seite n beendet die Schleife, Summen rechnen mit einer Teilmenge), `src/lib/data/kategorien-seite.ts:70-76`, `src/lib/data/bank-seite.ts:36` (stiller Deckel bei 5.000 Buchungen ohne `gekappt`-Flag).

**B4. Mehrschritt-Mutationen ohne Transaktion**
- `src/app/(dashboard)/finance/(planung)/debts/actions.ts:243, 293`: Zahlung einfügen und Restschuld setzen sind zwei Requests; die Kompensation bei Fehler wird nicht geprüft. Fix: eine RPC `record_debt_payment` in einer Transaktion.
- `src/app/(dashboard)/finance/(planung)/goals/actions.ts:112` (`setGoalStatus`) und `crypto/actions.ts:426` werten das Ergebnis gar nicht aus.

**B5. `src/app/actions/depot.ts`: kein einziges `revalidatePath`, UTC-Datum** ✔
- Zehn Mutationen, null Revalidierungen, obwohl Depotwerte im Dashboard und in der Kontenliste stehen. Z. 275: `new Date().toISOString().split('T')[0]`.

**B6. „Heute" als UTC statt Europe/Berlin (systemisch)**
- 48 Stellen in `src/lib` und `src/app`, u. a. `src/lib/data/vertragsvorschlaege.ts:32`, `finance/steuer/page.tsx:60, 106`, `crypto/actions.ts:138, 276, 344`, `src/lib/kraken/sync.ts:231`, `src/lib/assistant/prompts.ts:647`, clientseitig `DepotDashboard.tsx:93` und `portfolio-overview.tsx:164`. Zwischen 0 und 2 Uhr deutscher Zeit ist das der Vortag; eine Depotbuchung am 1. kurz nach Mitternacht landet im Vormonat.
- Es gibt bereits drei korrekte Implementierungen (`heuteBerlin` in `analyse-seite.ts`, `berlinerTag` in `assistant/kosten.ts`, inline in `transactions/page.tsx`). Fix: eine in `src/lib/datum.ts`, Default-Parameter `new Date()` entfernen.
- Gleiche Ursache beim Athena-Tageslimit ✔: `src/app/api/assistant/route.ts:109-110` (`setHours(0,0,0,0)` ist auf Vercel UTC-Mitternacht).

### 1.5 Befunde: Performance und Struktur

**C1. Seiten laden die komplette Buchungshistorie und rechnen in JS**
- Dashboard: `src/lib/forecast/laden.ts:100` lädt bewusst „die GANZE Historie" für das Zyklusmodell, dazu `src/lib/data/dashboard-zustand.ts:37` die Steuerdaten samt Kraken-Historie, bei jedem Render, seitenweise sequenziell. Request-übergreifendes Caching gibt es nicht (`docs/performance.md` nennt das bewusst).
- Analyse: `unified_transactions` wird dreimal überlappend gelesen (`AnalyseKalender.tsx:25` komplett, `analyse-seite.ts:88`, `AnalyseTempoDaten.ts:36`).
- Transaktionsliste: `src/lib/data/finance-transactions.ts:191` liest für vier Summen bis zu 20.000 Zeilen, bei jedem Seitenwechsel. Der Kommentar nennt die RPC selbst als richtige Lösung.
- Das ist die Kernfrage zur Skalierung, siehe 1.8.

**C2. Dieselben Stammdaten mehrfach pro Request**
- `getBankBalances` dreimal pro Dashboard-Render (`dashboard-seite.ts:76`, `forecast/laden.ts:93`, `dashboard-zustand.ts:65`), Konten und Saldensummen doppelt. Fix: diese Leser in React `cache()` hüllen, wie es für `getAuthUser`, `getSettings` und den Scope schon gemacht ist.

**C3. Analyse serialisiert das ganze `daten`-Objekt an Client-Komponenten** ✔
- `src/app/(dashboard)/analyse/page.tsx:69, 174, 182`: `const props = { daten }`, dann `<AnalyseVergleichWahl {...props} />` und `<AnalyseInsights {...props} />`, beide `'use client'`. `daten` enthält `scopeCtx` mit Mitglieder-IDs und IBANs (auch die des Partners), alle Buchungen und alle Monatszeilen. `src/lib/analyse/typen.ts:28` ✔ verbietet genau das: „nicht an Client-Komponenten weiterreichen".
- Fix: Hinweise auf dem Server rechnen und nur das Ergebnis übergeben; `AnalyseVergleichWahl` bekommt fünf Felder; `scopeCtx` aus `AnalyseDaten` herausnehmen.

**C4. `DepotDashboard.tsx` (856 Zeilen) ist der schwächste Baustein**
- Rund 30 `useState`, drei Formulare, Laden per Server Action im Client (`:212-230`). Laut Next-Doku laufen Server Actions vom Client nacheinander, das `Promise.all` ist also ein Wasserfall aus vier Roundtrips. Kein Abbruch-Flag beim Depot-Wechsel (Race), Aktionen ohne Fehler- und Pending-Behandlung (`:341-360`), `getDepots()` ohne `.catch` (Skeleton kann ewig stehen), `busy` wird vor einem Early-Return gesetzt und nie zurückgesetzt (`:285-286`). Das „Neues Depot"-Formular steht zweimal (`:383-411`, `:476-512`) aus rohen `<input>`. Selbstgebautes Dropdown ohne ARIA, Lösch-Knopf nur per Hover sichtbar, entgegen der Projektregel.
- Fix: Daten in `depot/page.tsx` serverseitig laden wie bei Krypto, dann zerlegen in `DepotUmschalter` (auf `ui/popover`), ein `NeuesDepotFormular`, drei Formulare mit `useActionState`, `SparplanListe`.

**C5. Fehlgeschlagene Kategorie-Übernahme wird als Erfolg angezeigt** ✔
- `src/lib/hooks/use-bank-data.ts:229-232`: `updateCategory` fängt den Fehler und resolved. `src/components/bank/category-suggestions.tsx:150-152` entfernt den Vorschlag danach aus der Liste, obwohl nichts gespeichert wurde. „Alle übernehmen" (`:168-173`) feuert zudem N Einzel-PATCHes, obwohl `/api/bank/transactions/bulk` existiert.
- Der Hook selbst ist zur Hälfte tot: `transactions`, `balances`, `loadTransactions`, `loadBalances` nutzt kein Aufrufer; `bank-transactions-view.tsx` (337 Zeilen) wird nirgends importiert; `BankSyncPanel` und `BankSyncInsel` sind fast identisch.

**C6. Athenas Tools sind eine zweite Query-Schicht**
- Nur 3 von 21 Tool-Dateien unter `src/lib/assistant/tools/` importieren `@/lib/data`; 15 enthalten zusammen 48 eigene `.from(...)`-Abfragen. Ändert sich eine Regel (Umbuchungen, Scope) nur in `src/lib/data`, nennt Athena andere Summen als das Dashboard. Ob das heute schon passiert, ist nicht geprüft.
- Dazu zwei Fälligkeitsrechner mit unterschiedlichem Ergebnis: `src/lib/assistant/recurrence.ts:52-60` gegen `src/lib/forecast/termine.ts:47-53` (z. B. `billing_day = 31` im November: bei Athena kein Termin, in der Prognose der 30.11.). `recurrence.ts` nennt sich Spiegel einer Edge Function, die seit 26.10. stillgelegt ist.

**C7. Athena hat ein Nachrichten-, aber kein Kostenlimit** ✔
- `src/lib/assistant/settings.ts:47-55`: Standard `claude-opus-5`, `effort: 'high'`, `maxSteps: 24`, `dailyMessageCap: 200`; `src/app/api/assistant/route.ts:354-355`: `maxOutputTokens: 32_000` je Schritt. Die hohen Werte sind laut Kommentar Absicht; eine Dollar-Obergrenze fehlt, obwohl die Aggregation in `assistant/kosten.ts` schon existiert.
- Zusätzlich: `AthenaChat.tsx:694-699` ruft nach jeder Antwort zweimal `router.refresh()`, auch im globalen Sheet. Auf `/analyse` rendert das die ganze Seite mit allen Abfragen zweimal neu, auch wenn Athena nichts geschrieben hat.

**C8. Doppelte Bausteine**
- Zwei fast identische Buchungslisten samt Filter und Detail: `bank/BankBuchungen.tsx` und `analyse/AnalyseBuchungenListe.tsx` (wortgleiche State-Form und Paging), mit paralleler Logik in `lib/bank/buchungen.ts` und `lib/analyse/buchungen.ts`.
- Sieben Lese-Varianten für `accounts`, zwei Funktionen namens `getActiveAccountOptions` (`overview.ts:172`, `finance-accounts.ts:56`), `ladeKategorien` wortgleich in zwei Dateien.
- Vier lebende Kategorie-Auswahlen; `BetragEingabe` existiert, wird aber nur einmal benutzt, sonst `type="number"` plus `parseFloat`.
- Transaktionsliste mountet pro Zeile eine Radix-Select und zwei Dialoge (`TransaktionenListe.tsx:159-187`), also genau das Muster, das in der Bank-Liste als Ursache für Hänger dokumentiert und behoben wurde (`BankBuchungKategorie.tsx:72-76`).

**C9. Formatierung an der Nutzereinstellung vorbei**
- 52 hartkodierte `'de-DE'` in 26 Komponenten-Dateien, 112 direkte `toLocaleString`/`toFixed`/`Intl.NumberFormat`-Aufrufe außerhalb von `lib/format.ts`. Depot, Heatmap und Kalender ignorieren die Einstellung `number_format`. `DepotDashboard.tsx:52-66` und `depot-chart.tsx:16-30` definieren dieselben fünf Formatter doppelt. `lib/format.ts` selbst (39 Importeure) hat keinen Test.

**C10. Kleinere Punkte**
- `portfolio-overview.tsx:81`: ein 1-Sekunden-Intervall im State der ganzen Krypto-Übersicht rendert Chart, Donut und Tabelle jede Sekunde neu; Polling läuft auch im Hintergrund-Tab weiter (nirgends `visibilitychange`).
- `privacy-context.tsx:29-33` ✔: Der Privatsphäre-Modus wird erst nach der Hydration gesetzt, echte Beträge sind nach jedem Laden kurz sichtbar. Für das Theme gibt es dagegen ein Inline-Script vor dem ersten Paint.
- `MonatsVerteilung.tsx:86-272`: rund 190 Zeilen Statistik (Quantile, Bins, Ticks) in der Chart-Komponente, ungetestet, während der Rest der Analyse-Rechnung getestet in `lib/analyse/` liegt.
- Toter und stillgelegter Code im Baum: vier 410-Cron-Routen, `supabase/functions/execute-contracts`, `fetchKrakenTradesHistory` (`kraken/index.ts:281-319`), verwaiste `api/cron/bank-sync/route.ts`.
- `README.md` ist die unveränderte create-next-app-Vorlage ✔; `docs/haushalt-multiuser.md:4` sagt noch „Umsetzung NICHT gestartet", ebenso die `CLAUDE.md`.

### 1.6 Sicherheit, Schema und Datenmodell

Alles hier stammt aus Repo-Dateien (Baseline vom 26.10. plus spätere Migrationen). Der Live-Zustand der Datenbank und der Dashboards wurde nicht geprüft.

**Was in Ordnung ist**

- Alle Tabellen der Baseline haben RLS. `using (true)` gibt es nur lesend für Stammdaten (Kurse, Tarife, EÜR-Zeilen) und als gewolltes INSERT auf der Warteliste. Alle 14 Views laufen mit `security_invoker`. `security definer`-Funktionen haben einen festen `search_path` und entzogenes EXECUTE.
- Haushalts-RLS: eine Policy je Tabelle über `user_id in (select household_peer_ids())`, Kind-Tabellen prüfen den Besitz des Elternobjekts. Bewusst owner-only bleiben u. a. `exchange_keys`, `bank_connections`, `belege`, `reports`, `ai_*`, `user_settings` (`supabase/baseline/07_rls_policies.sql:141`), `tax_*`.
- **Ich/Partner/Gemeinsam ist ein Filter im Code, keine Sicherheitsgrenze**: Die RLS kennt nur „Haushalt", Peers haben volle Lese- und Schreibrechte auf rund 22 Fachtabellen. Das ist laut `20261028100000_household_rls.sql:5-7` Absicht, sollte aber bewusst sein.
- Alle aktiven Route Handler haben einen Auth-Guard ✔ (ohne sind nur die 410-Stubs). Kein Service-Role-Pfad gefunden, der Nutzer vermischt. Die Node-Cron-Auth ist fail-closed, konstantzeitig und getestet (`src/lib/api/cron-auth.ts`).
- Geheimnisse: AES-256-GCM mit zufälligem IV je Wert (`src/lib/encryption.ts`); `bank_connections`-Chiffrate sind per Spaltenrecht für den Client gesperrt. Keine `.env` versioniert ✔. Einladungs-Token nur als Hash gespeichert.
- `supabase/tests/` enthält 10 SQL-Testdateien (Isolation Eric/Malik/Außenstehender, Einladungen, Fluss-Invarianten). Schwäche: sie laufen manuell gegen die Live-DB.

**Befunde**

**S1. Edge Functions sind mit dem öffentlichen anon-Key auslösbar** ✔ (Code), Live-Einstellung `verify_jwt` nicht prüfbar
- `supabase/functions/execute-savings-plans/index.ts:8` und `fetch-fund-price/index.ts:48`: `Deno.serve(async () => {` ohne jede eigene Prüfung. `daily-snapshot/index.ts:78-79`: `const isJwt = auth.startsWith('Bearer eyJ')`, jeder JWT passiert. Der Kommentar darüber (`:73`) sagt, dass pg_cron den anon-Key schickt, und der steht im Browser-Bundle.
- Folge: Wer die Seite öffnet, kann die Sparplan-Ausführung anstoßen und über `?date=` Snapshots für beliebige Tage neu rechnen lassen. Alle drei laufen mit Service-Role. Kein Datenabfluss, aber Schreibzugriff von außen; zusammen mit A1 (fehlender Doppelbuchungsschutz) unangenehm.
- Fix: in allen drei Functions ein eigenes Secret erzwingen, die `isJwt`-Ausnahme streichen, den Token im pg_cron-Job aus `supabase_vault` lesen statt als Klartext im Job-Kommando (so vermerkt in `supabase/baseline/10_cron_jobs_DOKUMENTATION.sql`).

**S2. `api/bank-sync.py` ist bei fehlendem Secret offen** ✔
- `api/bank-sync.py:657-658`: `if auth != f"Bearer {os.environ.get('CRON_SECRET', '')}"`. Ohne gesetzte Variable gilt der Header `Bearer ` als gültig. Die Funktion entschlüsselt die Bank-PINs aller Nutzer und nimmt `?user=`, `?sca=1`, `?full=1` an. Praktisch nur bei Fehlkonfiguration ausnutzbar; der Fix ist klein: bei leerem Secret 500, sonst `hmac.compare_digest`.

**S3. Geschlossene Registrierung hängt an einem Dashboard-Schalter** (unklar)
- `supabase/config.toml:169` ✔: `enable_signup = true`, Mindestpasswortlänge 6 (`:175`). Im App-Code gibt es kein `signUp`, aber mit dem anon-Key kann man sich direkt bei Supabase registrieren, falls der Schalter live an ist. `src/lib/api/auth.ts:34-35` akzeptiert jeden eingeloggten Nutzer. Ein Fremder bekäme: Athena auf Kosten des Betreibers (C7), Bildgenerierung, Schreibrecht auf `fund_prices` (S4). Fremde Finanzdaten bleiben durch RLS geschützt.
- Fix: Live-Schalter prüfen; zusätzlich in `requireUser()` und im Dashboard-Layout eine Haushaltsmitgliedschaft verlangen.

**S4. `fund_prices`: jeder eingeloggte Nutzer darf Kurse schreiben** ✔
- Policies `fund_prices_insert_auth` und `_update_auth` (`supabase/baseline/07_rls_policies.sql:101, 103`) prüfen nur `auth.uid() is not null`; `20261031090000_harden_table_grants.sql:24` entzieht nur das Löschen. Die Tabelle ist global. Zu zweit harmlos, als Zwischenstand dokumentiert; mit S3 nicht mehr harmlos. Fix: `upsertFundPrice` über den Admin-Client oder eine RPC, danach Policies entfernen.

**S5. Athena-Limit ist umgehbar und vom Nutzer änderbar**
- `src/app/api/assistant/route.ts:77`: Body ohne Zod. `:112-116` ✔ zählt nur `role = 'user'`; `regenerate: true` (`:117`) speichert keine Nutzernachricht und zählt nie. Das Limit steht in `ai_settings`, das der Nutzer per RLS selbst ändern darf (`20260830100000_athena_agent.sql:218` prüft nur `> 0`). Zusammen mit C7 gibt es keine serverseitige Obergrenze.

**S6. Lese-Getter mit frei wählbarer `userId` als Server Actions** ✔
- `src/app/(dashboard)/crypto/actions.ts:380` (auch `:411`, `:433`) in einer `'use server'`-Datei, ohne Auth-Prüfung. Die RLS auf `user_settings` ist owner-only, also heute dicht; die Funktionen gehören trotzdem nach `src/lib/data/crypto.ts`.

**S7. `bank_connections`: Tabellenrechte umgehen die URL-Prüfung** ✔ (Grant)
- `20261030100000_bank_connections.sql:91` gibt `insert, update, delete` an `authenticated`, obwohl der Code nur per Service-Role schreibt. Ein Nutzer kann `fints_url` seiner Zeile direkt ändern; die DB prüft nur `https://`, die strengere Prüfung (`connections-core.ts:129-146`) wird umgangen. Fix: die Rechte entziehen.

**S8. Kleinere Punkte**
- `/api/bank/debug` ✔ ist in Produktion für jeden eingeloggten Nutzer per GET erreichbar und startet einen echten Bank-Dialog; laut Kommentar „Dev/personal use only", aber ohne Umgebungsprüfung.
- Storage: `belege`, `reports`, `avatars` ohne Größen- und MIME-Grenze (`supabase/baseline/09_storage.sql:8-10`). Inventar-Tabellen sind haushaltsweit, die Storage-Policies prüfen weiter die eigene UID: der Partner sieht die Zeile, kann die Datei aber vermutlich nicht laden (als offen dokumentiert in `20261028100000_household_rls.sql:44-46`).
- Verschlüsselung: keine Schlüsselversion im Chiffrat (keine Rotation ohne Sonderlauf), ein Schlüssel für Bank und Kraken, `exchange_keys`-Chiffrate für den Browser-Client lesbar, `fints_client_state.state_blob` unverschlüsselt.
- Fehlertexte von Bank und Sidecar gehen roh an den Client (`api/bank-sync.py:692`, `src/app/api/bank/sync/route.ts:88`).
- `src/app/api/import/indicators/route.ts:9, 32`: beliebige Spalten ungeprüft, bis zu 2.000 parallele Inserts.
- Reale Beträge und Kategorienamen stehen in versionierten SQL-Kommentaren (`supabase/data/20261021_kategorie_triage.sql:2-6`). Bei einem privaten Repo unkritisch; die Sichtbarkeit des Remotes ist nicht geprüft.
- Partner-IBANs gehen an den Browser (C3).

**Schema und Migrationen**

**D1. Frisches Aufsetzen ist nicht reproduzierbar** ✔
- `supabase/baseline/README.md:3`: „UNGETESTET: nie gegen eine leere DB ausgefuehrt". Die Kerntabellen `accounts`, `transactions`, `categories` werden in keiner der 106 Migrationen angelegt ✔; die Kette beginnt mit dem Depot-Modul. Sechs Dateien haben keinen Zeitstempel, pg_cron-Jobs und Stammdaten existieren nur live, `config.toml` verweist auf eine fehlende `seed.sql`.
- Fix: Baseline einmal gegen eine leere lokale DB ausführen und als einzige Startmigration festschreiben, alte Migrationen archivieren, Cron-Jobs als Migration.

**D2. Typen und Datenbank driften**
- `bank_connections` fehlt in `src/types/database.ts`, obwohl FinTS pro Nutzer produktiv ist; der Code behilft sich mit `createAdminClient() as unknown as SupabaseClient` (`src/lib/fints/connections.ts:28`), genau an der Tabelle mit den Bank-PINs. `net_worth_series` fehlt ebenfalls in den Typen und ist laut `20261029110000_net_worth_series_scope.sql:45` „NUR ALS DATEI vorbereitet, nicht live angewendet", wird aber von `src/lib/data/networth-reihe.ts:96` aufgerufen. Der Anwendungsstatus von Migrationen steht nur in Kommentaren.

**D3. Zwei Buchungstabellen, per Freitext-IBAN verbunden**
- `transactions` (manuell: Fremdschlüssel aufs Konto, positiver Betrag plus `type`, `numeric(18,4)`) und `bank_transactions` (FinTS: IBAN als Text, Vorzeichenbetrag, unbegrenztes `numeric`, drei Kategoriefelder). Die View `unified_transactions` führt beide bei jeder Abfrage zusammen (rund 150 Zeilen, rekursive CTE). Flüsse werden über fest verdrahtete Kategorienamen klassifiziert (`20261101100000_perf_indexes_views.sql:93-94`: `= 'Schulden'`, `<> 'Transfers'`); ein Umbenennen der Kategorie ändert still die Auswertung.

**D4. Salden mehrfach geführt, heikles `on delete`**
- Derselbe Kontostand liegt in `bank_balance`, `account_balances` und `net_worth_snapshots`; `debts.outstanding` steht neben `debt_payments` ohne Trigger (vgl. B4). Zwei Reparatur-Migrationen zeigen, dass diese Rechnungen schon auseinandergelaufen sind.
- `transactions.account_id` ist `ON DELETE CASCADE` (`supabase/baseline/02b_foreign_keys.sql:90`): ein Konto zu löschen, löscht alle manuellen Buchungen mit, auch steuerrelevante, und seit der Haushalts-RLS darf das jedes Mitglied bei Konten des Partners. `belege.transaction_id` hat keinen Fremdschlüssel.
- Depot: `depot_transactions`, `savings_plans`, `depot_holdings` hängen nur über `(user_id, isin)` als Text zusammen.

**Scheduler im Überblick**

| Job | Wo | Zeitplan (UTC) |
|---|---|---|
| Bank-Sync (Python) | Vercel | alle 6 h |
| Kategorisierung, Kraken-Sync | Vercel | alle 6 h, versetzt |
| Monatsreport, Erinnerungen, Inventar-Wert, Athena-Review | Vercel | monatlich / täglich / täglich / wöchentlich |
| `fetch-fund-price` | pg_cron 24 → Edge Function | alle 15 min, werktags 8 bis 20 Uhr |
| `execute-savings-plans` | pg_cron 26 → Edge Function | täglich 9 Uhr |
| `daily-snapshot` | pg_cron 1287 → Edge Function | täglich 23:59 |

Die pg_cron-Jobs stehen nur in der Baseline-Doku, nicht in Migrationen. Alle Zeiten sind UTC: der Snapshot „23:59" und der Sparplan „9 Uhr" sind nicht deutsche Zeit.

### 1.7 Tests

1024 Tests, alle grün, 10 s. Der Runner (`node --experimental-strip-types --test`) ist schnell und ohne Abhängigkeiten, erfasst aber nur `.test.ts`: keine Komponenten-, Hook- oder DOM-Tests.

Gut abgedeckt sind die reinen Rechenmodule: `tax` (8 Dateien), `analyse` (12), `forecast` (9), `haushalt` (8), `finance`, `bank`, `verlauf`, `dashboard` (je 7).

Ungetestet ist genau das, wo die Befunde aus 1.3 liegen:

| Bereich | Ohne Test |
|---|---|
| Bank-Sync | `fints/index.ts` (External-ID, Upsert, Legacy-Abgleich), `sidecar.ts`, beide Python-Dateien |
| Kraken | `history.ts`, `sync.ts`, `rebalance-execution.ts`, `orders.ts` |
| Edge Functions | `execute-savings-plans`, `fetch-fund-price`, `daily-snapshot` |
| Datenschicht | 36 von 39 Dateien in `lib/data`, darunter `depot.ts` |
| Berichte | `reports/build.ts` (alle Summen) |
| Client | `url-filters.tsx` (`apply()`), `use-bank-data.ts`, `lib/format.ts` |

Der wirksamste einzelne Test wäre ein gemeinsames Fixture für die External-ID in TypeScript und Python: er würde die Divergenz aus A3/A4 dauerhaft absichern. Es gibt kein CI; die Tests laufen nur, wenn jemand sie startet.

### 1.8 Skaliert das Muster für 3 bis 5 weitere Features?

**Ja für alles auf Monatsebene, nein für alles auf Buchungsebene.**

Monats- und Saldensummen kommen aus SQL-Views (`monthly_flows`, `account_balance_sums_*`, RPC `balance_series`) und bleiben klein. Alles auf Buchungsebene (Sankey, Heatmap, Gegenparteien, Kategorien-Nutzung, Listensummen, Prognose) wird in JS aus vollständig geladenen Zeilen gerechnet, und jede Seite lädt diese Zeilen selbst neu. Dashboard und Analyse laden heute schon die ganze Historie. Mit zwei Nutzern und wachsender Historie wird jede weitere Auswertung dieser Art das linear teurer machen.

Zwei Auswege, die sich nicht ausschließen:

1. **Aggregate in SQL**: eine Tages-Tabelle oder View je (Konto, Tag, Kategorie, Gegenpartei) mit Summe und Anzahl. Heatmap, Kalender, Sankey und Kategorien-Nutzung lesen daraus statt aus Einzelbuchungen.
2. **Ein pro Request geteilter Buchungs-Loader** mit `cache()`, damit Kalender, Kern-Abfrage und Tempo auf `/analyse` dieselben Zeilen einmal holen. Das ist die kleine Lösung und in einem halben Tag machbar.

Die Client-Seite skaliert problemlos: URL-State plus Server Components braucht keinen Umbau.

---

## 2. Feature-Lücken und nächste Schritte

### 2.1 Einordnung

Die App ist funktional sehr breit: Konten, Buchungen mit CSV-Import und Sammelaktionen, Verträge mit Bankabgleich, Schulden, Sparziele, Prognose, Budget, Steuer mit EÜR und Krypto-FIFO, Reports als PDF und Mail, Depot, Krypto mit Rebalancing, Inventar, Strategie-Katalog, Athena, Haushalt mit Einladung und Änderungsprotokoll, Erstnutzer-Checkliste, Privatsphäre-Modus. Was fehlt, liegt im Drumherum: Selbsthilfe beim Zugang, Benachrichtigungen nach außen, Backup, Monitoring, und eine Landing-Page, die an vier Stellen mehr verspricht, als die App tut.

Registrierung ist im Code geschlossen (Konten entstehen nur über die Einladung). Gleichzeitig sind `/` und `/interesse` indexiert, Impressum und Datenschutz aber ausdrücklich Entwürfe.

### 2.2 Stand Heatmap, Sankey, Cashflow-Kalender

Alle drei sind gebaut und auf `/analyse` eingebunden, mit Drilldown in die Buchungsliste und Mobil-Varianten. Der Landing-Mock nutzt dieselben Komponenten mit Beispieldaten.

| | Was noch fehlt |
|---|---|
| **Heatmap** (`AusgabenHeatmap.tsx`, `lib/analyse/heatmap.ts`) | Immer die letzten 52 Wochen ab heute (`heatmap.ts:43`), ältere Jahre nicht ansehbar. Feste Euro-Schwellen 80/200/350/550 (`:70-77`) statt relativ zu den eigenen Ausgaben; im Scope „Gemeinsam" kippt die Skala. Kein Leerzustand, Legende ohne Werte, nicht per Tastatur bedienbar (bewusst, `:166-169`). |
| **Sankey** (`GeldflussChart-impl.tsx`) | Nur zwei Ebenen, keine Unterkategorien. Höhensprung nach dem Lazy-Load (Platzhalter fest 388 px, Chart 300 bis 520 px, `:303-308`). Beträge der Legende nur im `title`-Attribut, auf Touch nicht erreichbar. |
| **Kalender** (`CashflowKalender.tsx`) | Zeigt nur gebuchte Umsätze, keine erwarteten Zahlungen aus Verträgen: ein Rückblick-, kein Liquiditätskalender. Popup ist `fixed` und bleibt beim Scrollen stehen (`:242, 326-333`), kein Escape. Der Kommentar `:363-365` begründet den Zwei-Klick-Filter mit einem Server-Roundtrip, den es nicht mehr gibt (`tag` ist ein `localKey`). |

### 2.3 Priorisierung

Aufwand: S bis ein halber Tag, M ein bis drei Tage, L ab einer Woche.

| # | Feature | Aufwand | Impact | Begründung |
|---|---|---|---|---|
| 1 | Passwort vergessen | S | hoch | Fehlt ganz; die Login-Seite hat keinen Link (`login/page.tsx:150-165`). Malik hat keinen Selbsthilfe-Weg. `auth/callback`, `password-card.tsx`, `changePassword` und Resend sind vorhanden. |
| 2 | Landing-Texte an die App angleichen | S | hoch | Vier belegte Über-Versprechen: „Multi-Währung … Echtzeit-Kurse" (`InstrumentariumSection.tsx:69-70`), „Zahlungen buchen sich selbst" (`:41-42`, seit Commit `c6ff0c7` falsch), „vollautomatisierte Backtests" (`:61-62`, es gibt nur Handerfassung), „Keine Schätzung" (`PillarsReveal.tsx:31`). Reine Textänderung. |
| 3 | Impressum und Datenschutz fertigstellen | S + externe Prüfung | hoch | Beide sind Entwürfe (`impressum/page.tsx:15-19` ohne Anschrift; Datenschutz deckt nur die Warteliste ab), während die Seite indexiert ist und Bankdaten sowie KI-Anbieter verarbeitet. |
| 4 | Fehlermonitoring und CI | S bis M | hoch | Kein Sentry o. ä., kein CI. Bei 10 geplanten Jobs und zwei Nutzern erfährt man Fehler nur aus Logs; die Befunde A1 und A3 sind genau solche stillen Fehler. `global-error.tsx` und `lib/perf/perf-log.ts` sind Anknüpfungspunkte. |
| 5 | Erinnerungen per E-Mail | M | hoch | Reminder-Regeln laufen täglich (`lib/reminders/`), schreiben aber nur ins Dashboard. Wer die App nicht öffnet, verpasst die Kündigungsfrist. Resend-Client und HTML-Renderer der Reports sind da; es fehlen Vorlage und Opt-in. |
| 6 | Budget an Kategorien binden, Budget-Warnung | M | hoch | Soll gegen Ist läuft nur über Namensgleichheit (`lib/analyse/budget.ts:5-12`); ohne Treffer „nicht zugeordnet". Braucht eine Spalte `category_id` an `budget_categories` und eine Reminder-Regel. |
| 7 | Kalender mit erwarteten Zahlungen | M | mittel bis hoch | Fälligkeitslogik (`lib/forecast/termine.ts`, `lib/vertraege/`) und der Typ `CashflowEvent` sind da. Macht aus dem Rückblick ein Planungswerkzeug. |
| 8 | Kategorisierungs-Regeln sichtbar und editierbar | M bis L | hoch | Regeln sind Code (`lib/fints/categorize.ts`). Malik kann keine eigenen anlegen. Braucht Tabelle mit RLS, CRUD-Oberfläche, Umstellung der Engine. Würde nebenbei die dreifache Regelkopie (A4) auflösen. |
| 9 | Vollständiger Export / Backup | M | mittel bis hoch | Sechs Teil-Exporte existieren (`api/export/*`), kein Gesamtexport für Konten, Verträge, Inventar, Depot. Muster und `lib/csv.ts` sind wiederverwendbar. |
| 10 | Athena-Kostenlimit pro Tag | S | mittel | Siehe C7. Aggregation existiert in `assistant/kosten.ts`. |
| 11 | 2FA (TOTP) | M | mittel | Fehlt. Die App hält Bank-PINs und Börsen-Schlüssel. Supabase bringt MFA mit; es fehlen Enroll-Oberfläche und Challenge-Schritt. |
| 12 | Konto löschen, Haushalt verlassen | M | mittel | Beides fehlt; `deleteUser` kommt nur als Rollback vor. Commit `eeeb300` hat den Fremdschlüssel schon gelöst. Offen ist, was mit geteilten Konten geschieht. |
| 13 | Mehrwährung: rechnen oder Auswahl entfernen | S (entfernen) / L (rechnen) | mittel | Währungsfelder in vier Formularen, keine Umrechnung im TypeScript-Code. Ein USD-Konto ginge vermutlich 1:1 in Summen ein (DB-Views nicht geprüft). Ehrlichste Kurzlösung: nicht-EUR ausblenden. |
| 14 | Belege an beliebige Buchungen | M | mittel | `BelegUpload` gibt es nur im EÜR-Kontext; Komponente und Storage sind da. |
| 15 | Heatmap: Jahreswahl und relative Skala | S | niedrig bis mittel | Reine, getestete Funktionen; der Parameter `wochenAnzahl` existiert. |
| 16 | Globale Suche / Command-Palette | M | mittel | Gesucht wird nur in der Transaktionsliste. Athenas `atlas.ts` und die Sidebar-Einträge wären die Datenquelle; `ui/command` existiert nicht. |
| 17 | Split-Buchungen | L | mittel | Greift in `unified_transactions`, Kategorie-Rollup, EÜR und Analyse ein. Für einen Haushalt relevant, aber teuer; erst nach den Punkten oben. |
| 18 | Hilfe in der App | S bis M | niedrig bis mittel | Keine Hilfe-Seite. Der Inhalt steht schon in `docs/fints-verbindungen.md` und `docs/haushalt-*.md`. |

Bewusst nicht aufgenommen: der Fairness-Saldo im Haushalt (laut `docs/haushalt-multiuser.md:163-167` zurückgestellt), i18n (zwei deutschsprachige Nutzer), Offline-Fähigkeit (Manifest ist da, ein Service Worker lohnt erst für Push).

**Reihenfolge-Empfehlung:** zuerst die Korrektheits-Befunde aus 1.3 (A1 bis A3) und die Zugangsfragen aus 1.6 (S1 bis S3), dann die Zeilen 1 bis 4 der Tabelle, weil sie klein sind und Risiko senken, dann 5 bis 7 als erste echte Feature-Runde.

---

## 3. Was ich anders machen würde

### Wo die aktuelle Entscheidung tatsächlich Nachteile hat

1. **Eine Bank-Sync-Implementierung statt zwei.** Die Python-Funktion auf Vercel und der lokale Sidecar mit TypeScript-Mapping sind zwei Programme für dieselbe Aufgabe und laufen nachweislich auseinander (A3, A4). Ich würde das gesamte Abrufen, Parsen und die External-ID in ein Python-Modul legen, das beide Einstiege importieren, und das Schreiben in die DB an genau einer Stelle halten.
2. **Ein Scheduler statt zwei.** Sieben Vercel-Crons und drei pg_cron-Jobs mit Edge Functions, dazu vier stillgelegte Routen als Wegweiser. Der gefährlichste Befund (A1) sitzt in einer Edge Function, die außerhalb von Tests, Typprüfung und Repo-Deploy lebt. Ich würde alles auf Vercel-Crons ziehen, wo `requireCron`, die Datenschicht und die Tests greifen.
3. **Aggregate für Buchungsauswertungen in der Datenbank.** Für Monatssummen ist das schon so. Für alles auf Tages- und Buchungsebene würde ich von Anfang an eine Tages-Aggregat-Tabelle führen (per Trigger oder nach dem Sync), statt jede Seite die Historie laden zu lassen (1.8).
4. **Fehler als Standard, nicht als Ausnahme.** Ein dünner Wrapper um den Supabase-Client, der bei `error` wirft, hätte B1 bis B3 als Klasse verhindert. Die Codebase hat die richtige Lösung schon (`flows.ts`, `requireRows`), nur nicht überall.
5. **Geldbewegende Mehrschritt-Operationen als SQL-Funktion in einer Transaktion** (Schulden-Zahlung, Sparziel-Einzahlung, Bestätigung einer Athena-Aktion), statt als Folge von Requests mit Kompensation.
6. **Ein Datum-Modul von Tag eins**, das „heute in Berlin" liefert, und ein Lint-Verbot für `toISOString().slice(0, 10)`.
7. **CI vom ersten Commit an.** Typprüfung, Lint und 10 s Tests bei jedem Push kosten nichts und hätten nichts von dem verhindert, was hier steht, sichern aber den guten Zustand ab.
8. **Athenas Tools auf der Datenschicht** statt mit eigenen Abfragen (C6). Sonst gibt es zwei Wahrheiten über dieselben Zahlen.
9. **Eine Buchungstabelle statt zwei** (D3). Eine Tabelle `postings` mit `account_id` als Fremdschlüssel, Vorzeichenbetrag `numeric(18,2)`, `source`, `external_id` und genau einem Kategoriefeld plus Herkunft; Bank-Rohdaten in einer Staging-Tabelle. Die Flussart wäre eine Spalte an der Kategorie statt ein Vergleich auf den Namen. Die View `unified_transactions` leistet heute dasselbe und `flows.ts` kapselt sie sauber, aber sie ist der Grund für mehrere Performance-Umbauten und für die IBAN-Brücke. Ein nachträglicher Umbau wäre teuer; ich würde ihn nicht jetzt angehen, nur die Namensabhängigkeit auflösen.
10. **Migrationen, die eine leere Datenbank aufbauen** (D1). Heute ist die Live-Datenbank die einzige vollständige Quelle des Schemas. Geht sie verloren oder soll eine Testumgebung entstehen, fehlt der reproduzierbare Weg.
11. **Eine Wahrheit je Saldo** (D4): Bankanker plus Buchungen, alles andere als abgeleiteter Cache; Restschuld als View über die Zahlungen.

### Wo ich es anders gemacht hätte, die Entscheidung aber vertretbar ist

- **Next.js App Router plus Supabase mit RLS** ist für eine Zwei-Personen-App mit Bankdaten eine gute Wahl. Ich würde beim Stack nichts wechseln.
- **URL-State plus Server Components ohne Client-Cache-Bibliothek.** Ich hätte vermutlich früher zu TanStack Query gegriffen; das hier ist schlanker, und die Ausnahmen (Depot, `use-bank-data`) sind Altlasten, kein Argument gegen das Muster.
- **`node --test` statt Vitest.** Kein DOM, dafür 1024 Tests in 10 s ohne Abhängigkeit. Für eine Codebase, deren Logik in reinen Funktionen liegt, passt das. Komponenten-Tests fehlen dadurch; ich würde eher Logik aus Komponenten herausziehen als den Runner zu wechseln.
- **Recharts** für alles, auch den Sankey. Für Heatmap und Kalender ist eigenes Markup die richtige Wahl gewesen.
- **Deutsch-englisch gemischte Modulnamen** (`transaktionen/` neben `finance-transactions.ts`, `forecast/` neben `prognose-seite/`). Mich stört die Überlappung, aber das ist Geschmack, solange die Zuständigkeit klar bleibt. Ein Umbenennen lohnt den Aufwand nicht.
- **Sehr ausführliche Kommentare.** Mehr als ich schreiben würde, aber sie tragen: an fast jeder Stelle war erkennbar, ob etwas Absicht ist. Der Preis sind veraltete Kommentare (A2, Kalender, `recurrence.ts`), die dann aktiv in die Irre führen.
- **`getClaims()` statt `getUser()`** mit einer Stunde Restgültigkeit widerrufener Tokens. Dokumentiert und für diesen Nutzerkreis in Ordnung.
- **RLS auf Haushaltsebene, Scopes nur im Code.** Ich hätte „Ich/Partner/Gemeinsam" vermutlich in die Policies gezogen. Für zwei Menschen, die sich vertrauen, ist die einfachere Variante vertretbar und deutlich weniger fehleranfällig.
- **JS-`number` für Geld.** Die meisten Summen kommen aus `numeric` in SQL, eine konkrete Fehlrechnung habe ich nicht gefunden. Cent-Ganzzahlen wären sauberer, sind aber kein Umbau wert.
- **Öffentliche Landing-Page für ein privates Werkzeug.** Eine Produktentscheidung, keine technische. Sie erzeugt allerdings Pflichten (Zeile 2 und 3 der Tabelle), die ohne sie nicht bestünden.

---

## 4. Quick Wins (jeweils unter 2 Stunden)

1. **Sparplan-Dedup reparieren und Bestand prüfen** (A1). Die SQL-Abfrage aus A1 ausführen, dann in `supabase/functions/execute-savings-plans/index.ts:40-47` auf `.gte/.lt` umstellen und `error` auswerten. Verhindert im schlimmsten Fall täglich falsche Depotbuchungen.
2. **Athena-Aktionen atomar beanspruchen** (A2). In `confirmPendingAction` vor `runWriteAction` ein bedingtes Update auf `executing` mit `returning`; bei 0 Zeilen abbrechen. Schließt die doppelte Kraken-Order.
3. **Fehler im Scope nicht mehr schlucken** (B1). In `src/lib/haushalt/resolve.ts:28-41` bei `error` werfen und einen Helfer `lies()` anlegen, zuerst für `overview.ts`. Macht aus „alles leer" eine Fehlermeldung.
4. **Depot-Actions: `revalidatePath` und Berliner Datum** (B5). Nach jeder Mutation in `src/app/actions/depot.ts` `/depot`, `/finance/accounts`, `/dashboard` revalidieren; Z. 275 auf die vorhandene `heuteBerlin()` umstellen.
5. **Analyse: nur nötige Felder an Client-Komponenten** (C3). `AnalyseVergleichWahl` und `AnalyseInsights` bekommen gezielte Props statt `daten`. Weniger Nutzlast pro Aufruf, und die Partner-IBANs verlassen den Server nicht mehr.

Dazu zwei Dinge, die keine Code-Arbeit sind und zuerst kommen sollten: im Supabase-Dashboard prüfen, ob die öffentliche Registrierung aus ist (S3), und ob `CRON_SECRET` in Vercel gesetzt ist (S2).

Weitere kleine Schritte, falls Zeit bleibt: die drei Edge Functions auf ein eigenes Secret umstellen (S1), in `api/bank-sync.py:657` bei leerem `CRON_SECRET` ablehnen (S2), die Schreibrechte auf `bank_connections` entziehen (S7), und `getBankBalances`, `getAccounts` und `getUnifiedBalanceSums` in `cache()` hüllen (C2).

---

## 5. Offen und nicht geprüft

- **Live-Zustand**: Alle Schema-Aussagen stammen aus Repo-Dateien. Nicht geprüft sind die tatsächlich angewendeten Migrationen, `verify_jwt` der Edge Functions, der Signup-Schalter, Vercel-Umgebungsvariablen und im Vercel-Dashboard angelegte Crons.
- **Laufende Datenbank**: A1 (Doppelbuchungen), A4/A8 (Legacy-Zeilen, Buchungen ohne Referenz) und B2 (`max_rows` im gehosteten Projekt) lassen sich nur mit einer Abfrage bestätigen.
- **Versionierte Konfiguration**: `.mcp.json` und `.claude/settings*.json` wurden nicht auf Secrets geprüft (Lesezugriff nicht erteilt). Bitte selbst ansehen, insbesondere auf ein Supabase-Access-Token.
- **Nicht im Detail gelesen**: große SQL-Funktionskörper (`fn_take_snapshot`, `fn_accept_household_invite`), die Rollbacks, die Export-Routen (CSV-Formel-Injection), Security-Header, die Git-Historie auf früher eingecheckte Secrets.
- **Nicht gelesen**: die Landing-Komponenten, `src/app/globals.css`, die meisten Seiten unter Strategie, Inventar, Schulden, Sparziele, Einstellungen; in `src/lib/tax` wurden `position.ts` und `euer.ts` nur überflogen; `reports/build.ts` (Summenlogik) gar nicht.
- **Steuertarif**: hinterlegt ist nur 2026 (`supabase/migrations/20260906140000_tax_engine.sql:74-97`); für 2025 wird der nächstliegende Tarif genommen (`src/lib/tax/laden.ts:173-175`). Die Werte selbst sind nicht gegen eine Quelle geprüft.
- **Keine Laufzeitmessung**: kein Build, kein Bundle-Analyzer, kein Profiler. Die Race Conditions in C4 sind aus dem Code hergeleitet, nicht reproduziert.
