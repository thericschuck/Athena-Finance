import { NextResponse } from 'next/server'

// STILLGELEGT (2026-09-09).
//
// Diese Route war der erste von zwei Schreibern für Vertragsbuchungen: sie kam aus dem
// "Auto Booking"-Commit vom 2026-03-09 und wurde nie in vercel.json eingetragen (dort steht
// seit Aufräumarbeiten nur noch bank-sync/kraken-sync/monthly-report). Die produktive Version
// ist die Supabase Edge Function `execute-contracts` (pg_cron Job 25, täglich 8 Uhr), die
// dieselben Tabellen (`transactions`, `contract_executions`) schreibt.
//
// Die Route bleibt als sprechender 410 stehen statt gelöscht zu werden, für den Fall, dass im
// Vercel-Dashboard noch ein eigener Cron auf sie zeigt (wie es beim alten `daily-snapshot` der
// Fall war) — ein 404 wäre dort nicht von einem Deploy-Fehler zu unterscheiden.
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      message:
        'Diese Route ist stillgelegt. Vertragsbuchungen laufen über Supabase: ' +
        'pg_cron "execute-contracts" (Job 25) → Edge Function execute-contracts. ' +
        'Falls im Vercel-Dashboard noch ein Cron auf diese Route zeigt, bitte löschen.',
    },
    { status: 410 },
  )
}
