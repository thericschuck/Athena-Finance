# Athena-Wochenlauf (LLM ohne Chat)

Stand: 2026-10-22. Zweite Stufe der "vierten Schicht" aus `docs/athenas-takt.html`; die erste ist der
regelbasierte Reminder-Feed (`docs/reminder-feed.md`). Beide schreiben in `insights`, beide laufen per Vercel-Cron.

| | Reminder-Feed | Wochenlauf |
|---|---|---|
| Route | `/api/cron/reminders` | `/api/cron/athena-review` |
| Takt | täglich 07:00 UTC | montags 05:30 UTC |
| Technik | feste Regeln, kein LLM | LLM-Agent mit Lese-Werkzeugen |
| Finde | bekannte Muster (Frist, Rücklage, Freigrenze …) | was nur Urteilsvermögen findet |
| Insight-Typ | `reminder` | `athena_review` |

## Wie der Wochenlauf arbeitet

`src/lib/assistant/review.ts`. Eigene, schlanke Anweisung (`REVIEW_SYSTEM_PROMPT`), 14 Schritte, mittlere
Denktiefe, Modell aus den Athena-Einstellungen. Er beginnt mit `checkDataQuality`, liest `getInsights`
(damit er nichts doppelt meldet) und sucht: Kategorien mit auffälligem Anstieg, regelmäßige Zahlungen ohne
Vertrag, offene oder verschobene Fälligkeiten, den engsten Stand der Prognose, Einnahmenseite, Steuer-Sprünge.

## Leitplanken (warum das ohne Bestätigung geht)

Das ist die schmale Ausnahme "B" aus der Takt-Notiz: ein Hinweis bewegt kein Geld und verschwindet mit einem Klick.

- **Nur Lese-Werkzeuge.** Keine Vorschlags-Werkzeuge, kein Speicher, keine Wissensbasis, kein Web. Eine
  eingeschleuste Anweisung aus einem Buchungstext hätte nichts, womit sie etwas bewirken könnte.
- **Einziger Ausgang: `meldeBefund`.** Was ankommt, wird bereinigt (Links, HTML, Auszeichnung, Steuerzeichen),
  hart gekürzt, auf fünf je Lauf begrenzt und gegen offene Hinweise gleichen Titels entdoppelt.
- **Kein Friedhof.** Befunde, die nach 14 Tagen nicht angefasst wurden, werden archiviert.
- **Kostenbremse.** Mindestabstand 5 Tage zwischen zwei Läufen (`user_settings.athena_review_last`); Kosten und
  Schritte stehen im System-Log (`/assistant/logs`, `meta.kind = "review"`).
- **Keine parallelen Läufe.** Eine Sperre (`user_settings.athena_review_lock`, 6 Minuten) verhindert, dass zwei
  Läufe denselben Stand lesen und dasselbe in anderen Worten melden. `force=1` umgeht sie nicht.
- **Zeitlimit 240 s.** Danach wird abgebrochen und mit den bis dahin gemeldeten Befunden weitergemacht (Vercel kappt
  bei 300 s). Ein abgebrochener Lauf zählt nicht als erledigt.
- **Service-Role im Cron**, jedes Werkzeug filtert wie im Chat auf `userId`.

## Gemessene Kosten (Probeläufe vom 2026-10-21, Sonnet 5, mittlere Denktiefe)

| Lauf | Schritte | Dauer | Input / Output | Kosten |
|---|---|---|---|---|
| ohne Prompt-Cache | 8 | 113 s | 201.241 / 6.156 Token | **0,70 $** |
| mit Prompt-Cache (nur Neues zu prüfen) | 4 | 86 s | 67.545 / 4.743 Token, davon 42.296 aus dem Cache gelesen | **0,18 $** |

Die Schätzung beruht auf dem Listenpreis (Sonnet 5: 3 $ / 15 $ je Million Token; Cache-Lesen 0,1x, Schreiben 1,25x).
Der Input wächst mit jedem Schritt (8.500 Token im ersten, 45.000 im achten), weil das ganze Gespräch erneut
mitgeschickt wird; deshalb setzt der Lauf Cache-Haltepunkte auf Werkzeuge/Systemprompt und auf die jeweils letzte
Nachricht (`cacheLetzteNachricht`). Hochgerechnet auf einen 8-Schritte-Lauf: etwa 0,30 $ statt 0,70 $. Das sind
rund 1,2–2 $ im Monat bei wöchentlichem Takt; mit Opus 5 (5 $ / 25 $) etwa das 1,7-fache.

Die wirklichen Gesamtkosten der Probeläufe lagen höher: drei Läufe auf einem hängenden lokalen Dev-Server liefen
überlappend mit (der Server hatte ein Netzwerkproblem, `fetch failed`) und haben nachträglich Dubletten geschrieben.
Das hat die Sperre oben zur Folge gehabt.

## Einstellen

`user_settings.athena_review` (JSON, alles optional):

```json
{ "enabled": true, "model": "claude-sonnet-5", "effort": "low", "maxSteps": 10 }
```

Ungültige Werte fallen auf den Standard zurück; `maxSteps` ist auf 6–24 begrenzt. Ausschalten: `{ "enabled": false }`.

## Probelauf

`GET /api/cron/athena-review?force=1` mit `Authorization: Bearer <CRON_SECRET>`. Der erste Lauf kostet echtes
Geld; danach im Log die Kosten prüfen und bei Bedarf Modell oder Denktiefe senken.

## Offen

- Befunde sind im Dashboard nicht als "von Athena" markiert (nur am Typ erkennbar).
- Kein Gegenlauf: ob ein Befund stimmte, lernt der Lauf nicht (weggeklickt vs. umgesetzt).
- Das Aufräumen der Chat-Werkzeuge (`getInsights` lesen, `createInsight` vorschlagen) bleibt unverändert.
