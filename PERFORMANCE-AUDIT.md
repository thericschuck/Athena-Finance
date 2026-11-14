# Performance-Audit Athena Finance: Tagesaggregat-Tabelle (C1 / 1.8)

> **PLAN, NOCH NICHT UMGESETZT.** Dieses Dokument beschreibt einen geplanten Umbau. Im Code, in den Migrationen und in der Datenbank ist dazu nichts angelegt. Die Spalten- und Funktionsnamen unten sind Entwurf.

Stand: 14.11.2026, Commit `ce12334` (main). Nur gelesen und geplant, nichts am Code geändert.

## Das Wichtigste zuerst

1. **Das Problem (AUDIT.md C1, 1.8):** Alles auf Buchungsebene (Heatmap, Kalender, Sankey, Kategorien-Nutzung, Gegenparteien, Prognose) wird in JS aus vollständig geladenen Zeilen gerechnet, und jede Seite lädt diese Zeilen für sich neu. Die Kosten wachsen linear mit der Historie und mit jeder weiteren Auswertung dieser Art.
2. **Die Lösung:** Eine Tabelle `daily_aggregates` mit Summe und Anzahl je (Haushalt, Konto, Kategorie, Gegenpartei, Tag), die ausschließlich ein Trigger pflegt und die bei jeder Änderung aus den Rohdaten neu berechnet wird. Es gibt nur eine Wahrheit (die Buchungen); das Aggregat kann höchstens veraltet sein, nie eine eigene Zahl führen.
3. **Der Entwurf allein reicht nicht.** Beim Gegenlesen von Schema und Code sind sieben Punkte aufgefallen, die den Plan ändern oder ergänzen (Abschnitt „Befunde zum Entwurf"). Die wichtigsten: `unified_transactions` ist eine **View**, auf der es keinen Trigger gibt, ihre Spalten hängen von Tabellen ab, die der Trigger nicht sieht, und „komplette Neuberechnung" allein verhindert verlorene Updates bei gleichzeitigen Buchungen **nicht**.
4. **Einordnung:** Die kleine Lösung aus 1.8 (ein pro Request geteilter Buchungs-Loader mit `cache()`) bleibt als Zwischenschritt sinnvoll und ist in einem halben Tag machbar. Die Aggregat-Tabelle lohnt sich erst, wenn die Historie wirklich wächst. Das Vorgehen dort ist also eine Entscheidung zwischen Aufwand jetzt und Kosten später.

## Methode und Grenzen

- Gelesen: `AUDIT.md` (C1, 1.8, 2.2), die Migration `20261101100000_perf_indexes_views.sql` (Definition von `unified_transactions`), `src/lib/data/flows.ts`, `flows-scope.ts`, `analyse-seite.ts`, `kategorien-seite.ts`, `src/lib/analyse/aufbereiten.ts`, `AnalyseKalender.tsx`, die Analyse-Seite.
- **Nicht geprüft:** der Live-Zustand der Datenbank, echte Zeilenzahlen, Abfragepläne, die Last eines Triggers. Alle Zahlen und Kostenaussagen sind aus dem Code hergeleitet, nichts gemessen. Vor dem Bau ist eine Messung nötig (siehe „Offene Punkte").
- Die Aussagen zu Postgres (Sperren, Isolationsstufe, Transition Tables) sind Standardverhalten von Postgres und im Repo nicht ausprobiert.

## 1. Architektur

### Tabelle `daily_aggregates`

| Spalte | Bedeutung |
|---|---|
| `household_id` | Haushalt, dem die Buchung zugeordnet ist (siehe Befund 3) |
| `account_id` | Konto |
| `category_id` | Kategorie (kann leer sein: unkategorisiert) |
| `counterparty_hash` | Hash der normalisierten Gegenpartei (siehe Befund 5) |
| `day` | Buchungsdatum |
| `amount_sum` | Summe der Beträge |
| `tx_count` | Anzahl Buchungen |
| `updated_at` | Zeitpunkt der letzten Neuberechnung |

Primary Key über die ersten fünf Spalten. Die Tabelle soll Heatmap, Kalender, Sankey und Kategorien-Nutzung gemeinsam bedienen.

### Die drei Kernprinzipien für Konsistenz

1. **Nie manuell pflegen.** Das Aggregat wird nur von einem AFTER-Trigger geschrieben, der in derselben Transaktion läuft wie die Buchung. Committet die Buchung, committet das Aggregat, und umgekehrt. Kein Code der App schreibt in die Tabelle (RLS: nur Lesen für `authenticated`, kein Schreibrecht, auch nicht für `service_role`-Pfade der App).
2. **Immer komplette Neuberechnung aus den Rohdaten** für die betroffene Kombination (Tag, Konto, Kategorie, Gegenpartei), nie ein inkrementelles +/-. Das macht das Ergebnis robust gegen doppelt feuernde Trigger und nachträgliche Korrekturen: Es kann veraltet, aber nicht strukturell falsch sein. **Einschränkung:** Das gilt nur zusammen mit einer Sperre, siehe Befund 1.
3. **Eigener Integritäts-Check.** Eine SQL-Funktion (`pruefe_daily_aggregates`) vergleicht `SUM(daily_aggregates)` mit der Summe der Rohdaten für Stichproben und meldet Abweichungen. Aufgerufen wöchentlich (pg_cron oder Vercel-Cron, siehe „Offene Punkte"). Konsistenz ist damit nachprüfbar, nicht nur behauptet.

### Sonderfälle

- **UPDATE:** Ändert sich Kategorie, Tag, Konto, Betrag oder Gegenpartei einer Buchung, werden **beide** betroffenen Schlüssel neu berechnet: der alte (aus `OLD`) und der neue (aus `NEW`). Ändert sich nichts am Schlüssel (nur der Betrag), ist es ein Schlüssel.
- **DELETE:** Der Schlüssel aus `OLD` wird neu berechnet. Ergibt die Neuberechnung keine Zeile mehr, wird die Aggregat-Zeile **gelöscht** (nicht auf 0 gesetzt), sonst sammeln sich Nullzeilen.
- **Historischer Backfill:** Beim Einführen einmaliger Lauf über die gesamte bestehende Historie, in Abschnitten (Monat für Monat), außerhalb der Trigger-Pfade der laufenden App, danach nur noch der Trigger. Direkt nach dem Backfill läuft der Integritäts-Check über **alles**, nicht nur über Stichproben.
- **Massenschreiber:** Bank-Sync, Import und die Neukategorisierung schreiben viele Zeilen in einer Anweisung. Ein Row-Level-Trigger mit Neuberechnung je Zeile wäre dort teuer. Plan: Statement-Level-Trigger mit Transition Tables (`REFERENCING OLD TABLE / NEW TABLE`), die die betroffenen Schlüssel einsammeln und jeden **einmal** neu berechnen.

## 2. Befunde zum Entwurf (vor dem Bau klären)

**1. Verlorene Updates bei gleichzeitigen Buchungen (betrifft Prinzip 2 und Test 4).**
In Postgres' Standard-Isolationsstufe (READ COMMITTED) sieht die Neuberechnung in Transaktion A die noch nicht committete Buchung aus Transaktion B nicht, und umgekehrt. Beide berechnen für denselben Schlüssel eine Summe, die die jeweils andere Buchung nicht enthält, die zuletzt schreibende gewinnt, und eine Buchung fehlt im Aggregat. Die Neuberechnung verhindert das allein nicht.
*Lösung:* Vor der Neuberechnung eine Sperre pro Schlüssel nehmen, zum Beispiel `pg_advisory_xact_lock(hashtextextended(<Schlüssel>, 0))`. Die zweite Transaktion wartet dann, bis die erste committet hat, und liest danach (mit eigenem Snapshot je Anweisung) die vollständigen Rohdaten. Bei mehreren Schlüsseln in einer Anweisung die Sperren in fester Reihenfolge nehmen (sortiert), sonst droht ein Deadlock.

**2. `unified_transactions` ist eine View, kein Trigger-Ziel.**
Die View vereinigt `public.transactions` (manuell) und `public.bank_transactions` (FinTS-Sync). Triggerziele sind diese **beiden Tabellen**: zwei Trigger (je INSERT, UPDATE, DELETE) mit derselben Funktion. Die Neuberechnung liest aus beiden Quellen (am einfachsten über die View selbst, mit dem Preis ihrer Kosten, oder über einen schlanken, eigenen Select auf beide Tabellen).

**3. Abgeleitete Spalten ändern sich ohne Buchungsänderung.**
In `unified_transactions` hängen mehrere Spalten von **anderen Tabellen** ab: `flow_kind` und `counts_in_flow` von `categories` (Typ, Name der Hauptkategorie: Schulden, Transfers), `root_category_id`/`root_category_name` vom Kategorienbaum, `tax_role_effective` von den Steuer-Overrides, die Erkennung von Umbuchungen (`counterpart_account_id`) von `accounts.bank_iban`, die Haushaltszuordnung von `household_members`. Ändert sich dort etwas (Kategorie umbenannt, verschoben, Typ geändert, Konto-IBAN geändert, Mitglied tritt aus), feuert **kein** Buchungs-Trigger, und das Aggregat wäre strukturell veraltet.
*Lösung (empfohlen):* Im Aggregat nur **rohe Dimensionen** speichern (Konto, Kategorie-ID, Tag, Richtung, Summe) und alles Abgeleitete (`flow_kind`, Hauptkategorie, Steuerrolle) beim Lesen über einen Join auf die **aktuellen** Tabellen bestimmen. Dann kann das Aggregat bei einer Kategorie-Umbenennung nicht veralten. `household_id` soll möglichst ebenfalls beim Lesen über das Konto bestimmt werden, nicht gespeichert werden (Befund 4). Wo das nicht geht, braucht es zusätzliche Trigger auf `categories`, `accounts` und `household_members`, die die betroffenen Bereiche neu berechnen.

**4. `household_id` ist nicht Teil der Buchung.**
Buchungen tragen `user_id` und `account_id`; die Haushaltszuordnung entsteht über Konto, Freigabe (`accounts.shared`) und `household_members`. Tritt jemand einem Haushalt bei oder aus, ändert sich die Zuordnung rückwirkend für die ganze Historie. Gespeichert im Aggregat wäre `household_id` daher eine zweite Wahrheit (Befund 3). Entscheidung vor dem Bau: `household_id` weglassen und die RLS über `account_id` lösen (wie die bisherigen Views, `applyAccountScope`).

**5. `amount_sum` allein trennt Einnahmen und Ausgaben nicht.**
Die Heatmap braucht je Tag **getrennt** Ausgaben und Einnahmen (`buildHeatmap` in `aufbereiten.ts`), die Kategorien-Nutzung ebenfalls. Eine vorzeichenbehaftete Summe hebt beides gegeneinander auf. Der Plan sieht vor, entweder `direction` (`income`/`expense`) in den Schlüssel aufzunehmen oder `income_sum` und `expense_sum` als zwei Spalten zu führen. Dazu `flow_kind` beziehungsweise `counts_in_flow`, damit Umbuchungen, Anfangsbestände und Anlagen nicht in die Auswertung einfließen (Befund 3 gilt: aus der Kategorie abgeleitet).
Zu `counterparty_hash`: Gegenparteien werden heute über `parteiName` / `parteiSchluesselVon` (`lib/analyse/gegenparteien.ts`) normalisiert. Ein Hash über **denselben** Normalisierer reicht zum Gruppieren, taugt aber **nicht zur Anzeige**: für den Namen braucht die Auswertung entweder eine Namenstabelle (Hash → Anzeigename) oder weiter die Rohdaten.

**6. Die Herabstufung hängt vom Scope ab.**
`flows-scope.ts` und `lib/haushalt/umbuchung.ts` stufen im Haushalt eine Umbuchung, deren Gegenkonto nicht im Scope liegt, zur echten Buchung herab (`flow_kind := flow_kind_extern`). Das Ergebnis hängt also von `counterpart_account_id` **und** vom Scope ab. Ein Aggregat ohne `counterpart_account_id` (oder `flow_kind_extern`) kann das nicht nachbilden; der Schlüssel muss diese Dimension tragen, oder die Herabstufung bleibt auf der JS-Seite für die wenigen Umbuchungszeilen.

**7. Ein Aggregat ersetzt nicht jeden Lesezugriff.**
Der Kalender zeigt je Tag **einzelne Buchungen** (`CashflowEvent` mit Beschriftung, Kategorie oder Beschreibung oder Händler, Betrag), die Tagesdetails brauchen Rohzeilen. Das Raster (Summe je Tag) kommt aus dem Aggregat, die Detailliste eines angeklickten Tages aus einer kleinen Rohabfrage für diesen einen Tag.

## 3. Testplan

Als SQL-Tests, nach dem Muster der vorhandenen (`perf_views.sql`), gegen eine Testdatenbank oder lokale Supabase-Instanz. Jeder Test vergleicht am Ende `daily_aggregates` mit der Summe aus den Rohdaten.

1. **Insert:** Eine manuelle Buchung und eine Bank-Buchung einfügen. Das Aggregat der betroffenen Zeile entspricht `SUM` und `COUNT` der Rohdaten.
2. **Update:** Betrag ändern (eine Zeile ändert sich). Kategorie ändern (alte **und** neue Zeile stimmen). Tag ändern (alter und neuer Tag stimmen). Konto ändern. Mehrere Änderungen in einer Anweisung.
3. **Delete:** Eine von mehreren Buchungen löschen: Summe und Anzahl sinken. Die letzte Buchung eines Schlüssels löschen: Die Aggregat-Zeile **verschwindet**.
4. **Gleichzeitige Buchungen:** Zwei Sitzungen buchen parallel auf denselben Tag und dieselbe Kategorie (ohne Sperre müsste dieser Test ein verlorenes Update zeigen, mit Sperre nicht). Mehrfach wiederholen (zum Beispiel 200 Durchläufe), plus ein Lauf mit zwei Sitzungen, die zwei Schlüssel in **umgekehrter** Reihenfolge ansprechen (Deadlock-Test).
5. **Integritäts-Check:** Künstliche Abweichung herstellen (eine Aggregat-Zeile direkt als Superuser ändern, die Trigger dabei umgehen). Der Check muss genau diese Abweichung melden und bei sauberen Daten **nichts** melden.
6. **Massenschreiber:** Import und Bank-Sync mit mehreren hundert Zeilen. Das Ergebnis stimmt, und die Zahl der Neuberechnungen entspricht der Zahl der Schlüssel, nicht der Zeilen.
7. **Änderung an abgeleiteten Daten (Befund 3):** Kategorie umbenennen, verschieben, Typ ändern, Konto-IBAN ändern. Die Auswertung stimmt danach ohne Neuberechnung (bei Speicherung roher Dimensionen) oder nach dem zusätzlichen Trigger.
8. **Backfill:** Auf einer Kopie der Produktionsdaten laufen lassen. Anschließend vergleicht der Integritäts-Check die **gesamte** Tabelle gegen die Rohdaten.
9. **RLS:** Ein Haushaltsmitglied sieht nur Zeilen seiner Konten; ein Fremder sieht nichts; kein Schreibzugriff für `authenticated`.

## 4. Migrationspfad für die lesenden Komponenten

Heute lädt jede der folgenden Stellen Rohzeilen aus `unified_transactions` (`flows.ts`, seitenweise zu 1.000 Zeilen, bis `MAX_PAGES`) und rechnet in JS.

| Komponente / Datei | Heute | Mit `daily_aggregates` |
|---|---|---|
| `AusgabenHeatmap.tsx` | `buildHeatmap(daten.txns)` (`analyse/page.tsx:148`) rechnet je Tag Ausgaben und Einnahmen aus den geladenen Buchungen (nur Datum, Typ, Betrag). Immer die letzten 52 Wochen (`heatmap.ts:43`) | Ein Select je Tag mit `income_sum`/`expense_sum` für den Bereich, **dieselbe Form `HeatmapDay[]`**. Die Komponente und `heatmap.ts` bleiben unverändert. Voraussetzung: Befund 5 (Richtung) und 6 (Herabstufung). Nebeneffekt: ältere Jahre wären billig ansehbar (AUDIT.md 2.2) |
| `CashflowKalender.tsx` / `AnalyseKalender.tsx` | Eigene Abfrage der **gesamten** Historie bis Ende des nächsten Monats (`getFlowTransactionsScope`), `buildCashflow` macht je Buchung ein `CashflowEvent` | Das Monatsraster (Summe je Tag) aus dem Aggregat, nur für den sichtbaren Monat. Die Tagesdetails (einzelne Buchungen) per Rohabfrage **für den angeklickten Tag** (Befund 7). `CashflowEvent` bekommt eine zweite Quelle. Die größte Einzelabfrage der Analyse-Seite entfällt |
| `GeldflussChart-impl.tsx` | `buildSankey(daten.txns)` → `baueGeldfluss` (`lib/analyse/geldfluss.ts`): Top-N nach Hauptkategorie, Anlagen als eigener Fluss, „Weitere" und „Fehlbetrag" | `baueGeldfluss` bekommt Summen je (Kategorie, Richtung) statt Einzelbuchungen. Dafür den Aggregat-Select über den Zeitraum gruppieren und die Hauptkategorie über den Kategorienbaum zuordnen (Befund 3). Eine neue Eingabeform für `baueGeldfluss`, die vorhandenen Tests (`geldfluss`) müssen auf beide Formen laufen |
| Kategorien-Nutzung (`kategorien-seite.ts`, `lib/kategorien/berechnen.ts`) | `ladeBuchungen`: **alle** kategorisierten Buchungen (`category_id, type, flow_kind, amount_eur, date`), bis 60 Seiten à 1.000 Zeilen | Summe und Anzahl je (Kategorie, Monat) direkt aus dem Aggregat. Die Zählabfrage und die Seitenschleife entfallen. `berechnen.ts` bekommt vorgruppierte Eingaben |
| `getFlowTransactionsScope` (`flows-scope.ts`) | Gemeinsamer Lader mit Herabstufung für Analyse, Dashboard-Prognose und weitere | Bleibt für alles, was Einzelbuchungen braucht (Listen, Gegenparteien-Anzeige, Prognose-Zyklusmodell). Wird nicht ersetzt, nur von den vier obigen Stellen nicht mehr aufgerufen |

**Nicht abgedeckt, auch nach dem Umbau Rohzeilen:** das Zyklusmodell der Prognose (`forecast/laden.ts`, lernt aus allen Einzelbuchungen), Gegenparteien-Anzeige (Namen), Buchungslisten und Exporte, EÜR und Steuer, Athenas Tools. Der Umbau löst C1 also nur für die vier genannten Auswertungen.

## 5. Reihenfolge der Umsetzung (Vorschlag)

1. **Messen:** Zeilenzahlen von `transactions` und `bank_transactions`, Dauer der heutigen Abfragen auf der Analyse-Seite. Ohne Zahl keine Entscheidung.
2. **Zwischenschritt (klein):** pro Request geteilter Buchungs-Loader mit `cache()` (AUDIT.md 1.8, Weg 2).
3. **Schema:** Tabelle, Funktion (mit Sperre), zwei Trigger, RLS, Rollback-Skript (`supabase/rollbacks/`, wie bei den bisherigen Migrationen).
4. **Tests 1 bis 9** schreiben und grün bekommen, bevor ein Lesezugriff umgestellt wird.
5. **Backfill** auf einer Kopie, dann Integritäts-Check über alles.
6. **Leser einzeln umstellen**, hinter einem Schalter (zum Beispiel Einstellung oder Umgebungsvariable), mit Vergleich: Aggregat gegen Rohzeilen-Ergebnis für dieselbe Seite. Erst bei Gleichheit den alten Pfad entfernen. Reihenfolge: Heatmap, Kategorien-Nutzung, Sankey, Kalender.
7. **Wöchentlicher Integritäts-Check** aktivieren.

## 6. Offen und nicht entschieden

- Aggregat auf rohe Dimensionen beschränken (empfohlen, Befund 3 und 4) oder `household_id`/`flow_kind` speichern und zusätzliche Trigger auf `categories`, `accounts`, `household_members` bauen?
- `direction`-Spalte oder `income_sum`/`expense_sum` (Befund 5)?
- Wohin geht der Alarm des Integritäts-Checks? Im Repo gibt es kein Fehlermonitoring (AUDIT.md, Zahlen). Möglich: pg_cron mit Eintrag in eine Tabelle plus Anzeige in der App, oder ein Vercel-Cron mit Mail. Nicht entschieden.
- Wie viele Zeilen und welche Last? Erst messen (Abschnitt 5, Schritt 1).
- Wie geht das Aggregat mit der Herabstufung im Haushalt um (Befund 6)?
