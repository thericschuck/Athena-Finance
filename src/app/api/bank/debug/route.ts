import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { runSidecar } from '@/lib/fints/sidecar'
import { resolveConnectionsForUser, maskUsername } from '@/lib/fints/connections'

/**
 * GET /api/bank/debug
 * Validates FinTS config and runs a minimal live check via the Python sidecar
 * (accounts + balances, last 7 days of transactions). Dev/personal use only.
 */
export const maxDuration = 300

export async function GET() {
  const { user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  // Zugangsdaten wie beim Sync: eigene Verbindung aus der DB, sonst (nur Env-Nutzer) die FINTS_*-Env.
  let resolved
  try {
    resolved = await resolveConnectionsForUser(user.id)
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Verbindungen nicht ladbar' }, { status: 500 })
  }
  if (resolved.connections.length === 0) {
    return NextResponse.json({ ok: false, error: 'Keine Bankverbindung hinterlegt (Einstellungen -> Integrationen).' })
  }

  const productId = process.env.FINTS_PRODUCT_ID?.trim()
  const config = {
    source:          resolved.source,
    connections:     resolved.connections.map(c => ({
      label:     c.label,
      url:       c.url,
      blz:       c.blz,
      blzLength: c.blz.length,
      username:  maskUsername(c.username),
      pinSet:    !!c.pin,
    })),
    productId:       productId || '(nicht gesetzt)',
    productIdLength: productId?.length ?? 0,
    python:          process.env.FINTS_PYTHON?.trim() || '(venv default)',
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  try {
    const result = await runSidecar({ startDate, balances: true, profiles: resolved.source === 'db' ? resolved.connections : undefined })
    return NextResponse.json({
      ok: true,
      config,
      accounts: result.accounts.map(a => ({ iban: a.iban, bic: a.bic, name: a.accountName })),
      balances: result.balances,
      statementsCheck: {
        ok: true,
        count: result.transactions.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, config, error: message }, { status: 500 })
  }
}
