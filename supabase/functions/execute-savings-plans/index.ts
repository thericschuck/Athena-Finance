// Deploy: supabase functions deploy execute-savings-plans   (verify_jwt = false steht in supabase/config.toml)
// Cron: pg_cron-Job "execute-savings-plans", "0 9 * * *" (täglich um 9 Uhr, nach fetch-fund-price)
//   URL: POST /functions/v1/execute-savings-plans, Header `Authorization: Bearer <CRON_SECRET>`
//   (das Secret liest der Job aus supabase_vault, siehe Migration 20261113100000_cron_jobs_vault_secret.sql)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cronAuthAntwort } from './cron-auth.ts'
import { MAX_KURSALTER_STUNDEN, kursAlterStunden, kursIstFrisch, monatsGrenzen } from './regeln.ts'

Deno.serve(async (req) => {
  // Erste Prüfung, vor jedem Datenbankzugriff: ohne gültiges CRON_SECRET bucht niemand einen Sparplan.
  const abgewiesen = cronAuthAntwort(req, Deno.env.get('CRON_SECRET'))
  if (abgewiesen) return abgewiesen

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Alles in UTC: Die Edge Runtime läuft in UTC, der Job um 09:00 UTC. Ausdrücklich getUTC*, damit das Ergebnis
  // nicht von der Zeitzone des Rechners abhängt, auf dem die Function läuft oder getestet wird.
  const jetzt = new Date()
  const todayStr = jetzt.toISOString().slice(0, 10)
  const todayDay = jetzt.getUTCDate()
  const { von: monatVon, bis: monatBis } = monatsGrenzen(todayStr)

  // Alle aktiven Sparpläne laden
  const { data: plans, error: pErr } = await supabase
    .from('savings_plans')
    .select('id, user_id, isin, fund_name, monthly_amount, execution_day, start_date')
    .eq('is_active', true)

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  const results: Record<string, unknown>[] = []

  for (const plan of plans ?? []) {
    // Noch nicht gestartet?
    if (plan.start_date > todayStr) continue

    // Ausführungstag noch nicht erreicht?
    if (plan.execution_day > todayDay) continue

    // Bereits diesen Monat ausgeführt? Bereichsabfrage auf die DATE-Spalte. Die frühere `.like()`-Abfrage gibt es in
    // Postgres für `date` nicht (42883); der Fehler wurde nicht gelesen, `existing` blieb leer und der Plan wurde ab
    // dem Ausführungstag jeden Tag erneut gebucht. `.limit(1)` genügt: gefragt ist nur, ob es eine Buchung gibt.
    const { data: existing, error: existingErr } = await supabase
      .from('depot_transactions')
      .select('id')
      .eq('user_id', plan.user_id)
      .eq('isin', plan.isin)
      .eq('transaction_type', 'savings_plan')
      .gte('transaction_date', monatVon)
      .lt('transaction_date', monatBis)
      .limit(1)

    if (existingErr) {
      // Nicht wissen heißt nicht buchen: Ohne gelesenes Ergebnis lässt sich eine Doppelbuchung nicht ausschließen.
      // Kein Raten, kein Weiterbuchen. Der Plan bleibt fällig und kommt beim nächsten Lauf wieder dran.
      console.error(`[execute-savings-plans] Prüfung auf bestehende Buchung fehlgeschlagen, Plan ${plan.id} übersprungen: ${existingErr.message}`)
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'error', error: `Prüfung auf bestehende Buchung fehlgeschlagen: ${existingErr.message}` })
      continue
    }

    if (existing && existing.length > 0) {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'already_executed' })
      continue
    }

    // Aktuellen Preis aus Cache holen, samt Zeitpunkt des letzten Abrufs
    const { data: cache, error: cacheErr } = await supabase
      .from('fund_price_cache')
      .select('price, fetched_at')
      .eq('isin', plan.isin)
      .maybeSingle()

    if (cacheErr) {
      console.error(`[execute-savings-plans] Kurs nicht lesbar, Plan ${plan.id} übersprungen: ${cacheErr.message}`)
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'error', error: `Kurs nicht lesbar: ${cacheErr.message}` })
      continue
    }

    if (!cache?.price) {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'no_price_in_cache' })
      continue
    }

    // Ein Wochen alter Kurs darf nicht als Ausführungskurs gebucht werden (Grenze und Begründung: regeln.ts).
    // Überspringen statt buchen: Der Plan bleibt fällig und wird am nächsten Tag erneut versucht.
    if (!kursIstFrisch(cache.fetched_at, jetzt)) {
      const alter = kursAlterStunden(cache.fetched_at, jetzt)
      console.warn(
        `[execute-savings-plans] Kurs zu alt, Plan ${plan.id} übersprungen: letzter Abruf ${cache.fetched_at ?? 'unbekannt'}` +
        (alter === null ? '' : ` (${Math.round(alter)} h, erlaubt ${MAX_KURSALTER_STUNDEN} h)`),
      )
      results.push({
        plan: plan.fund_name, isin: plan.isin, status: 'price_stale',
        price_fetched_at: cache.fetched_at ?? null,
        age_hours: alter === null ? null : Math.round(alter),
        max_age_hours: MAX_KURSALTER_STUNDEN,
      })
      continue
    }

    const pricePerShare = Number(cache.price)
    const shares = plan.monthly_amount / pricePerShare

    // Depot-Transaktion buchen (shares ist eine generierte Spalte, nicht mitschreiben)
    const { error: txErr } = await supabase.from('depot_transactions').insert({
      user_id: plan.user_id,
      isin: plan.isin,
      fund_name: plan.fund_name,
      transaction_date: todayStr,
      amount_eur: plan.monthly_amount,
      price_per_share: pricePerShare,
      transaction_type: 'savings_plan',
      notes: 'Automatische Sparplan-Ausführung',
    })

    if (txErr?.code === '23505') {
      // Unique-Index je (Nutzer, ISIN, Monat) für savings_plan: Ein zweiter, gleichzeitiger Aufruf war schneller.
      // Genau dafür ist die Absicherung auf Datenbankebene da, das ist kein Fehler.
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'already_executed', via: 'unique_index' })
    } else if (txErr) {
      console.error(`[execute-savings-plans] Buchung fehlgeschlagen, Plan ${plan.id}: ${txErr.message}`)
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'error', error: txErr.message })
    } else {
      results.push({ plan: plan.fund_name, isin: plan.isin, status: 'executed', amount: plan.monthly_amount, price: pricePerShare, shares })
    }
  }

  // pg_cron sieht nur den Statuscode (net._http_response). Ein Fehler beim Prüfen, Lesen oder Buchen darf deshalb
  // nicht als 200 durchgehen. Überspringen wegen altem Kurs ist dagegen ein vorgesehener Ausgang (200).
  const fehler = results.filter(r => r.status === 'error').length
  return new Response(JSON.stringify({ date: todayStr, results }), {
    status: fehler > 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
