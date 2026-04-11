import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/encryption'
import type { ExchangeKeyInsert } from '@/types/exchange-keys'

// POST /api/exchange-keys
// Encrypts and upserts an exchange API key pair for the authenticated user.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { exchange: string; api_key: string; api_secret: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { exchange, api_key, api_secret } = body
  if (!exchange || !api_key || !api_secret) {
    return Response.json(
      { error: 'exchange, api_key, and api_secret are required' },
      { status: 400 }
    )
  }

  const row: ExchangeKeyInsert = {
    user_id:    user.id,
    exchange,
    api_key:    encrypt(api_key),
    api_secret: encrypt(api_secret),
  }

  // exchange_keys not yet in generated types — remove cast after `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('exchange_keys')
    .upsert(row, { onConflict: 'user_id,exchange' })

  if (error) {
    return Response.json({ error: (error as { message: string }).message }, { status: 500 })
  }

  return Response.json({ success: true })
}

// DELETE /api/exchange-keys?exchange=kraken
// Removes an exchange key pair for the authenticated user.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const exchange = req.nextUrl.searchParams.get('exchange') ?? 'kraken'

  // exchange_keys not yet in generated types — remove cast after `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('exchange_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('exchange', exchange)

  if (error) {
    return Response.json({ error: (error as { message: string }).message }, { status: 500 })
  }

  return Response.json({ success: true })
}
