import { NextResponse } from 'next/server'

// STILLGELEGT (2026-09-09).
//
// Diese Route war der erste von zwei Schreibern für Sparplan-Ausführungen: sie kam aus dem
// "Auto Booking"-Commit vom 2026-03-09 und wurde nie in vercel.json eingetragen (dort steht
// seit Aufräumarbeiten nur noch bank-sync/kraken-sync/monthly-report). Die produktive Version
// ist die Supabase Edge Function `execute-savings-plans` (pg_cron Job 26, täglich 9 Uhr), die
// dieselbe Tabelle (`depot_transactions`) schreibt.
//
// Beide Implementierungen trugen bis 2026-09-09 denselben Bug: sie schrieben `shares` explizit
// mit, obwohl die Spalte inzwischen `GENERATED ALWAYS AS (amount_eur / price_per_share)` ist —
// jeder Insert scheiterte seither an "cannot insert a non-DEFAULT value into column shares".
// Der Fehler wurde nur in der Edge Function behoben, da diese die einzige noch laufende Kette ist.
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
        'Diese Route ist stillgelegt. Sparplan-Ausführungen laufen über Supabase: ' +
        'pg_cron "execute-savings-plans" (Job 26) → Edge Function execute-savings-plans. ' +
        'Falls im Vercel-Dashboard noch ein Cron auf diese Route zeigt, bitte löschen.',
    },
    { status: 410 },
  )
}
