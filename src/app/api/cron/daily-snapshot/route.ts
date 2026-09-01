import { NextResponse } from 'next/server'

// STILLGELEGT (31.08.2026).
//
// Diese Route war der zweite von zwei Snapshot-Schreibern: sie holte Live-CoinGecko-Preise
// und schrieb `portfolio_snapshots`, `asset_valuations` und `net_worth_snapshots` — dieselben
// Tabellen, die auch `fn_take_snapshot()` (Supabase pg_cron → Edge Function `daily-snapshot`)
// befüllt. Wer zuletzt lief, gewann. Weil `fn_take_snapshot` Krypto ausschließlich über den
// seit März toten `crypto_price_cache` bewertete, hat sie die hier geschriebenen, korrekten
// Tageskurse regelmäßig mit 0 überschrieben — im Crypto-Tab standen dann Preise wie
// "ETH 0,00 €" und ein Bitcoin-Kurs vom 11.03.2026.
//
// Aufgelöst wurde das auf der Supabase-Seite (Migration 20260831120000):
//   • `fn_asset_price_eur()` staffelt die Preisermittlung und liefert nie mehr blind 0
//   • der Upsert in `asset_valuations` stuft einen vorhandenen Preis nie auf 0 zurück
//   • die Edge Function bekommt ihren Authorization-Header und füllt den Kurs-Cache wieder
//
// Damit ist `fn_take_snapshot()` die einzige Snapshot-Pipeline. Die Route bleibt als
// sprechender 410 stehen statt gelöscht zu werden, weil der zugehörige Cron im
// Vercel-Dashboard konfiguriert ist (nicht in vercel.json) — ein 404 wäre dort nicht von
// einem Deploy-Fehler zu unterscheiden.
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      message:
        'Diese Route ist stillgelegt. Der tägliche Snapshot läuft über Supabase: ' +
        'pg_cron "Daily-Snapshot" → Edge Function daily-snapshot → fn_take_snapshot(). ' +
        'Bitte den Cron-Job im Vercel-Dashboard löschen.',
    },
    { status: 410 },
  )
}
