import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = adminClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr    = today.toISOString().split('T')[0]
  const todayDay    = today.getDate()
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const { data: plans, error } = await supabase
    .from('savings_plans')
    .select('id, user_id, isin, fund_name, monthly_amount, execution_day, start_date')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let executed = 0
  let skipped  = 0
  const log: string[] = []

  for (const plan of plans ?? []) {
    if (plan.start_date > todayStr)         { skipped++; continue }
    if (plan.execution_day > todayDay)      { skipped++; continue }

    // Bereits diesen Monat ausgeführt?
    const { data: existing } = await supabase
      .from('depot_transactions')
      .select('id')
      .eq('user_id', plan.user_id)
      .eq('isin', plan.isin)
      .eq('transaction_type', 'savings_plan')
      .gte('transaction_date', `${monthPrefix}-01`)
      .lt('transaction_date', `${monthPrefix}-32`)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // Preis aus Cache
    const { data: cache } = await supabase
      .from('fund_price_cache')
      .select('price')
      .eq('isin', plan.isin)
      .maybeSingle()

    if (!cache?.price) {
      log.push(`${plan.fund_name}: kein Preis im Cache`)
      skipped++
      continue
    }

    const pricePerShare = Number(cache.price)
    const shares        = plan.monthly_amount / pricePerShare

    const { error: txErr } = await supabase.from('depot_transactions').insert({
      user_id:          plan.user_id,
      isin:             plan.isin,
      fund_name:        plan.fund_name,
      transaction_date: todayStr,
      amount_eur:       plan.monthly_amount,
      price_per_share:  pricePerShare,
      shares,
      transaction_type: 'savings_plan',
      notes:            'Automatische Sparplan-Ausführung',
    })

    if (txErr) {
      log.push(`${plan.fund_name}: ${txErr.message}`)
    } else {
      log.push(`${plan.fund_name}: €${plan.monthly_amount} @ €${pricePerShare} = ${shares.toFixed(4)} Anteile`)
      executed++
    }
  }

  return NextResponse.json({ ok: true, date: todayStr, executed, skipped, log })
}
