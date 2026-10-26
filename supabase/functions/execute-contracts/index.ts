// STILLGELEGT (2026-10-26).
//
// Verträge und Abos sind nur eine Übersicht. Sie legen keine Buchungen mehr an: Eine Buchung
// kommt entweder vom Bank-Sync oder wird von Hand erfasst. Früher schrieb diese Funktion täglich um
// 8 Uhr eine `expense`-Zeile pro fälligem Vertrag in `transactions` — daher tauchten Buchungen auf, die
// es auf dem Konto nie gab.
//
// Stattdessen prüft die App lesend, ob zum Abbuchungstermin eine passende Buchung eingegangen ist
// (src/lib/forecast/vertrag-abgleich.ts) und gibt bei einer fehlenden einen Hinweis
// (src/lib/reminders/regeln.ts, Schlüssel `vertrag-offen:*`).
//
// Der pg_cron-Job 25 ist per Migration 20261026120000 abgemeldet. Die Funktion bleibt als No-op stehen,
// falls noch ein Aufruf von außen kommt, statt bei einem 404 wie ein Deploy-Fehler auszusehen.

Deno.serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      deprecated: true,
      message: 'Stillgelegt: Verträge legen keine Buchungen mehr an. Der Abgleich läuft in der App.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  ),
)
