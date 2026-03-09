// Deploy: supabase functions deploy execute-contracts
// Cron (Supabase Dashboard → Cron Jobs):
//   Schedule: "0 8 * * *"  (täglich um 8 Uhr)
//   URL: POST /functions/v1/execute-contracts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const INTERVAL_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, biannual: 6, yearly: 12,
}
const INTERVAL_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 }
const TRANSFER_TYPES = new Set(['transfer', 'savings_plan', 'building_savings'])

function isDueToday(startDate: string, frequency: string, billingDay: number | null, today: Date): boolean {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  if (start > today) return false  // Vertrag noch nicht gestartet

  if (INTERVAL_DAYS[frequency]) {
    const days = INTERVAL_DAYS[frequency]
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000)
    return diff % days === 0
  }

  const months = INTERVAL_MONTHS[frequency] ?? 1

  if (billingDay) {
    // Fällig wenn: heute = billing_day UND Startdatum <= heute
    // UND Monat passt zum Intervall
    if (today.getDate() !== billingDay) return false
    const monthsDiff =
      (today.getFullYear() - start.getFullYear()) * 12 +
      (today.getMonth() - start.getMonth())
    return monthsDiff >= 0 && monthsDiff % months === 0
  }

  // Kein billing_day: selber Tag-des-Monats wie start_date, im richtigen Intervall
  if (today.getDate() !== start.getDate()) return false
  const monthsDiff =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth())
  return monthsDiff > 0 && monthsDiff % months === 0
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Alle aktiven Verträge laden
  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select('id, user_id, name, type, frequency, amount, currency, billing_day, start_date, end_date, account_id, to_account_id, category_id')
    .eq('is_active', true)

  if (cErr) {
    return new Response(JSON.stringify({ error: cErr.message }), { status: 500 })
  }

  const results: object[] = []

  for (const c of contracts ?? []) {
    // Enddatum prüfen
    if (c.end_date && new Date(c.end_date) < today) continue

    if (!isDueToday(c.start_date, c.frequency, c.billing_day, today)) continue

    // Bereits heute gebucht?
    const { data: existing } = await supabase
      .from('contract_executions')
      .select('id')
      .eq('contract_id', c.id)
      .eq('execution_date', todayStr)
      .maybeSingle()

    if (existing) {
      results.push({ contract: c.name, status: 'already_executed' })
      continue
    }

    // Transaktion(en) erstellen
    const isTransfer = TRANSFER_TYPES.has(c.type)
    let txId: string | null = null

    if (isTransfer && c.account_id && c.to_account_id) {
      // Ausgabe vom Quellkonto
      const { data: tx1 } = await supabase.from('transactions').insert({
        user_id: c.user_id, account_id: c.account_id,
        type: 'expense', amount: c.amount, currency: c.currency,
        date: todayStr, description: c.name, fx_rate: 1,
        category_id: c.category_id ?? null,
      }).select('id').single()

      // Einnahme auf Zielkonto
      await supabase.from('transactions').insert({
        user_id: c.user_id, account_id: c.to_account_id,
        type: 'income', amount: c.amount, currency: c.currency,
        date: todayStr, description: c.name, fx_rate: 1,
      })

      txId = tx1?.id ?? null
    } else if (c.account_id) {
      const { data: tx } = await supabase.from('transactions').insert({
        user_id: c.user_id, account_id: c.account_id,
        type: 'expense', amount: c.amount, currency: c.currency,
        date: todayStr, description: c.name, fx_rate: 1,
        category_id: c.category_id ?? null,
      }).select('id').single()

      txId = tx?.id ?? null
    }

    // Execution protokollieren
    await supabase.from('contract_executions').insert({
      contract_id: c.id,
      execution_date: todayStr,
      transaction_id: txId,
    })

    results.push({ contract: c.name, status: 'executed', amount: c.amount, currency: c.currency })
  }

  return new Response(JSON.stringify({ date: todayStr, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
