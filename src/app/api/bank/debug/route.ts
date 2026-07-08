import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runSidecar } from '@/lib/fints/sidecar'

/**
 * GET /api/bank/debug
 * Validates FinTS config and runs a minimal live check via the Python sidecar
 * (accounts + balances, last 7 days of transactions). Dev/personal use only.
 */
export const maxDuration = 300

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const url       = process.env.FINTS_URL?.trim()
  const blz       = process.env.FINTS_BLZ?.replace(/\D/g, '')
  const name      = process.env.FINTS_USERNAME?.trim()
  const pin       = process.env.FINTS_PIN?.trim()
  const productId = process.env.FINTS_PRODUCT_ID?.trim()

  const config = {
    url:             url || '(nicht gesetzt)',
    blz:             blz || '(nicht gesetzt)',
    blzLength:       blz?.length,
    username:        name ? name.substring(0, 3) + '***' : '(nicht gesetzt)',
    pinSet:          !!pin,
    productId:       productId || '(nicht gesetzt)',
    productIdLength: productId?.length ?? 0,
    python:          process.env.FINTS_PYTHON?.trim() || '(venv default)',
  }

  if (!url || !blz || !name || !pin) {
    return NextResponse.json({ ok: false, config, error: 'Fehlende Umgebungsvariablen' })
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  try {
    const result = await runSidecar({ startDate, balances: true })
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
