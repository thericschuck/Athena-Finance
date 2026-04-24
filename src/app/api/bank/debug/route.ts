import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PinTanClient } from 'node-fints'

/**
 * GET /api/bank/debug
 * Validates FinTS config and attempts a minimal connection to the bank.
 * Shows detailed error info. Dev/personal use only.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const url       = process.env.FINTS_URL?.trim()
  const blz       = process.env.FINTS_BLZ?.replace(/\D/g, '')
  const name      = process.env.FINTS_USERNAME?.trim()
  const pin       = process.env.FINTS_PIN?.trim()
  const productId = process.env.FINTS_PRODUCT_ID?.trim() || 'fints'

  const config = {
    url:       url || '(nicht gesetzt)',
    blz:       blz || '(nicht gesetzt)',
    blzLength: blz?.length,
    username:  name ? name.substring(0, 3) + '***' : '(nicht gesetzt)',
    pinSet:    !!pin,
    productId: productId,
    productIdLength: productId.length,
  }

  if (!url || !blz || !name || !pin) {
    return NextResponse.json({ ok: false, config, error: 'Fehlende Umgebungsvariablen' })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new PinTanClient({ url, blz, name, pin, productId, debug: true } as any)
    const accounts = await client.accounts()
    return NextResponse.json({
      ok: true,
      config,
      accounts: accounts.map(a => ({
        iban: a.iban,
        bic: a.bic,
        name: a.accountName,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, config, error: message }, { status: 500 })
  }
}
