# Reminder-Feed

Stand: 2026-10-22. Erste Stufe der "vierten Schicht" aus `docs/athenas-takt.html`: ein Lauf ohne Chat-Nachricht.

## Was er tut

`/api/cron/reminders` (Cron-geschützt wie Kraken- und Bank-Sync) gleicht je Nutzer feste Regeln
(`src/lib/reminders/regeln.ts`) mit der Lage ab und schreibt Hinweise in `insights` (Typ `reminder`,
`payload.key` = stabiler Schlüssel). Sie erscheinen im Dashboard-Block der offenen Hinweise und lassen sich
dort wie alle Insights wegklicken.

**Kein LLM.** Eingabe sind Zahlen, Daten und selbst vergebene Vertragsnamen, kein Bank-Freitext. Darum
schreibt der Lauf direkt, ohne die Bestätigungspflicht des Chat-Agenten, und die A/B-Frage zu `createInsight`
aus der Takt-Notiz berührt ihn nicht. Ein späterer LLM-Lauf bleibt davon getrennt.

## Regeln

| Schlüssel | Auslöser |
|---|---|
| `kuendigung:<vertrag>:<end_date>` | Vertrag mit automatischer Verlängerung, letzter Kündigungstag in 0–21 Tagen (Warnung ab 7) |
| `ruecklage:<jahr>:<quartal>` | Steuerrücklage-Lücke ab 50 € oder kein Sparziel bei geschätzter Steuer |
| `kleinunternehmer:<jahr>:<status>` | Ampel gelb oder rot |
| `krypto-nah:<jahr>` / `krypto-ueber:<jahr>` | Saldo ab 80 % der Freigrenze / Freigrenze überschritten |
| `haltefrist:<los>:<datum>` | Los wird in den nächsten 30 Tagen steuerfrei (höchstens 3) |
| `unkategorisiert:<monat>` | ab 10 Buchungen ohne Kategorie |
| `kraken-sync:<woche>` | Kraken-Schlüssel hinterlegt, letzter Sync älter als 3 Tage oder nie |

## Abgleich (idempotent)

- Schlüssel, die es schon gab (auch weggeklickte), werden nie neu angelegt.
- Offene Erinnerungen, deren Regel nicht mehr zutrifft, werden archiviert (`dismissed_at`), nicht gelöscht.
- Ein zweiter Lauf am selben Tag ändert nichts. Die Rücklage-Erinnerung kehrt höchstens einmal pro Quartal
  zurück, die Kraken-Warnung einmal pro Woche.

## Neue Regel hinzufügen

In `erzeugeErinnerungen` eine Bedingung mit stabilem Schlüssel ergänzen, die Eingabe in `ladeEingabe`
(`lauf.ts`) bereitstellen, einen Test in `regeln.test.ts` schreiben. Keine neue Tabelle nötig.

## Aktivierung

Die Route existiert, der Zeitplan nicht: in `vercel.json` fehlt der `crons`-Eintrag
`{ "path": "/api/cron/reminders", "schedule": "0 7 * * *" }`. `vercel.json` ändert sich nur nach Rückfrage.
Bis dahin lässt sich der Lauf mit `Authorization: Bearer <CRON_SECRET>` von Hand auslösen.
