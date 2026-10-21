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
- **Service-Role im Cron**, jedes Werkzeug filtert wie im Chat auf `userId`.

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
