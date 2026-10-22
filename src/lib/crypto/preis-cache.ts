/**
 * Cache-Optionen für ÖFFENTLICHE Kurs-Abfragen (CoinGecko, Kraken-Ticker).
 *
 * Warum: Crypto-Tab und Dashboard fragten bei jedem Aufruf frisch bei CoinGecko/Kraken nach (`cache: 'no-store'`). Das
 * läuft ohne API-Key gegen das IP-Limit der Free-Tier und kostet jedes Mal einen Roundtrip, obwohl sich ein Kurs in
 * 30 Sekunden kaum bewegt. Mit `next.revalidate` hält Next.js die Antwort im Data Cache (serverseitig, geteilt über
 * Anfragen und Funktionsinstanzen); nur erfolgreiche Antworten (Status 200) werden gespeichert, ein 429 bleibt also nie hängen.
 *
 * Wo NICHT gecacht wird (`fresh: true`):
 *  - der Kraken-Sync (Bestände und Bewertung müssen den Stand dieser Sekunde sehen),
 *  - Rebalancing-Vorschläge und -Ausführung (Kaufmengen aus veralteten Kursen wären falsch),
 *  - vom Nutzer ausgelöste Kurs-Aktualisierungen („Preise aktualisieren", neuer Coin).
 * Private Kraken-Endpunkte (Balance, Trades, Ledger, Orders) laufen gar nicht über diese Funktionen und bleiben ungecacht.
 *
 * Keine Imports, damit `node --test` die Datei direkt lädt.
 */

/** Wie lange ein öffentlicher Kurs höchstens alt sein darf, wenn nichts anderes verlangt ist. */
export const PREIS_TTL_S = 30

export type PreisAbruf = { fresh?: boolean }

/** `fetch`-Optionen: frisch ohne Cache, sonst mit kurzem Data Cache. */
export function preisFetchOptionen(opts?: PreisAbruf): { cache: 'no-store' } | { next: { revalidate: number } } {
  return opts?.fresh ? { cache: 'no-store' } : { next: { revalidate: PREIS_TTL_S } }
}
