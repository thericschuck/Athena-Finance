// Deploy: supabase functions deploy execute-savings-plans
// Cron (Supabase Dashboard → Cron Jobs):
//   Schedule: "0 9 * * *"  (täglich um 9 Uhr, nach fetch-fund-price)
//   URL: POST /functions/v1/execute-savings-plans

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr   = today.toISOString().split('T')[0]
  const todayDay   = today.getDate()
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  // Alle aktiven Sparpläne laden
  const { data: plans, error: pErr } = await supabase
    .from('savings_plans')
    .select('id, user_id, isin, fund_name, monthly_amount, execution_day, start_date')
    .eq('is_active', true)

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  const results: object[] = []

  for (const plan of plans ?? []) {
    // Noch nicht gestartet?
    if (plan.start_date > todayStr) continue

    // Ausführungstag noch nicht erreicht?
    if (plan.execution_day > todayDay) continue

    // Bereits diesen Monat ausgeführt?
    const { data: existing } = await supabase
      .from('depot_transactions')
      .select('id')
      .eq('user_id', plan.user_id)
      .eq('isin', plan.isin)
      .eq('transaction_type', 'savings_plan')
      .like('transaction_date', `${monthPrefix}-%`)
      .maybeSingle()

    if (existing) {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'already_executed' })
      continue
    }

    // Aktuellen Preis aus Cache holen
    const { data: cache } = await supabase
      .from('fund_price_cache')
      .select('price')
      .eq('isin', plan.isin)
      .maybeSingle()

    if (!cache?.price) {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'no_price_in_cache' })
      continue
    }

    const pricePerShare = Number(cache.price)
    const shares = plan.monthly_amount / pricePerShare

    // Depot-Transaktion buchen
    const { error: txErr } = await supabase.from('depot_transactions').insert({
      user_id: plan.user_id,
      isin: plan.isin,
      fund_name: plan.fund_name,
      transaction_date: todayStr,
      amount_eur: plan.monthly_amount,
      price_per_share: pricePerShare,
      shares,
      transaction_type: 'savings_plan',
      notes: 'Automatische Sparplan-Ausführung',
    })

    if (txErr) {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'error', error: txErr.message })
    } else {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'executed', amount: plan.monthly_amount, price: pricePerShare, shares })
    }
  }

  return new Response(JSON.stringify({ date: todayStr, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
