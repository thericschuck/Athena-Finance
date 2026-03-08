import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TRANSFER_TYPES } from '@/lib/finance/contract-constants'
import type { Database } from '@/types/database'

// ─── Admin client (bypasses RLS) ──────────────────────────────────────────────
function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── Billing date generator ────────────────────────────────────────────────────
function billingDatesInRange(
  startDate: string,
  frequency: string,
  billingDay: number | null,
  from: Date,
  to: Date,
): string[] {
  const toISO = (d: Date) => d.toISOString().split('T')[0]
  const clamp = (y: number, m: number, day: number) =>
    new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))

  const start = new Date(startDate + 'T00:00:00')
  const dates: string[] = []

  const intervalDays: Record<string, number> = { weekly: 7, biweekly: 14 }
  const intervalMonths: Record<string, number> = {
    monthly: 1, quarterly: 3, biannual: 6, yearly: 12,
  }

  if (intervalDays[frequency]) {
    const step = intervalDays[frequency]
    let cur = new Date(start)
    while (cur <= to) {
      if (cur >= from) dates.push(toISO(cur))
      cur = new Date(cur)
      cur.setDate(cur.getDate() + step)
    }
  } else {
    const step = intervalMonths[frequency] ?? 1
    let cur = billingDay
      ? clamp(start.getFullYear(), start.getMonth(), billingDay)
      : new Date(start)

    // Advance to first date >= start if billing_day moved it back
    if (cur < start) cur = clamp(cur.getFullYear(), cur.getMonth() + step, billingDay ?? cur.getDate())

    while (cur <= to) {
      if (cur >= from) dates.push(toISO(cur))
      const next = new Date(cur)
      next.setMonth(next.getMonth() + step)
      if (billingDay) {
        const nd = clamp(next.getFullYear(), next.getMonth(), billingDay)
        cur = nd
      } else {
        cur = next
      }
    }
  }

  return dates
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = adminClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Look back up to 14 days to catch any missed runs
  const lookback = new Date(today)
  lookback.setDate(lookback.getDate() - 14)

  // Load all active contracts
  const { data: contracts, error: contractsErr } = await supabase
    .from('contracts')
    .select('*')
    .eq('is_active', true)

  if (contractsErr) {
    return NextResponse.json({ error: contractsErr.message }, { status: 500 })
  }

  let booked = 0
  let skipped = 0

  for (const contract of contracts ?? []) {
    if (!contract.account_id) { skipped++; continue }

    // Determine the "from" date: max(lookback, contract created_at)
    const createdAt = new Date(contract.created_at)
    createdAt.setHours(0, 0, 0, 0)
    const from = createdAt > lookback ? createdAt : lookback

    const dates = billingDatesInRange(
      contract.start_date,
      contract.frequency,
      contract.billing_day,
      from,
      today,
    )

    if (dates.length === 0) continue

    // Load existing transactions for this contract in the date range
    const { data: existing } = await supabase
      .from('transactions')
      .select('date')
      .eq('contract_id', contract.id)
      .gte('date', dates[0])
      .lte('date', dates[dates.length - 1])

    const existingDates = new Set((existing ?? []).map(t => t.date))
    const isTransfer = TRANSFER_TYPES.has(contract.type)

    for (const date of dates) {
      if (existingDates.has(date)) continue

      const base = {
        user_id:     contract.user_id,
        account_id:  contract.account_id,
        amount:      contract.amount,
        currency:    contract.currency,
        date,
        description: contract.name,
        contract_id: contract.id,
        category_id: contract.category_id,
        is_recurring: true,
        fx_rate:     1,
        tags:        [] as string[],
      }

      if (isTransfer) {
        await supabase.from('transactions').insert({
          ...base,
          type:        'transfer',
          transfer_to: (contract as typeof contract & { to_account_id?: string | null }).to_account_id ?? null,
        })
      } else {
        await supabase.from('transactions').insert({ ...base, type: 'expense' })
      }
      booked++
    }
  }

  return NextResponse.json({ ok: true, booked, skipped })
}
