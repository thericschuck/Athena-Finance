import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getDashboardAccounts, getBalanceSums, getNetWorthSnapshotsSince } from '@/lib/data/overview'
import { getBankBalances } from '@/lib/data/finance-accounts'
import { getFlowTransactions } from '@/lib/data/flows'
import { fetchSettingValue } from '@/lib/data/settings'
import { computeAccountBalances } from '@/lib/finance/dashboard-calc'
import { ladeSteuerdaten } from '@/lib/tax/laden'
import { addMonate, addTage, monatVon, parse } from './datum'
import { ANNAHMEN_KEY, leseAnnahmen, type Annahme } from './annahmen'
import { berechnePrognose, type Prognose, type PrognoseVertrag } from './cashflow'
import { baueTage, typischerLohnTag } from './historie'
import { tagesverlauf, type VerlaufPunkt } from './verlauf'
import { berechneSteuerPrognose, laufrateAus, type SteuerPrognose } from './steuer'

/**
 * Lädt alles, was die Prognose braucht, und ruft die reinen Rechenfunktionen auf. Dünn gehalten:
 * die Logik steht in cashflow.ts / steuer.ts / historie.ts und ist dort getestet.
 */

type DB = SupabaseClient<Database>

/** Kontotypen, deren Saldo als „flüssig" gilt (Giro, Sparkonto, Bargeld). */
const LIQUIDE_TYPEN = new Set(['checking', 'savings', 'cash'])

export type PrognoseSeite = {
  heute: string
  stand: { liquiditaet: number; vermoegen: number | null; vermoegenStand: string | null; liquideKonten: number }
  basis: Prognose
  szenario: Prognose
  /** Rückblick: Tageswerte der letzten Monate (aus den Tages-Snapshots). */
  verlauf: VerlaufPunkt[]
  steuer: SteuerPrognose[]
  laufrateQuelle: string
  annahmen: Annahme[]
  hinweise: string[]
}

export async function ladePrognose(
  supabase: DB, userId: string, heute: string, opts: { monate?: number } = {},
): Promise<PrognoseSeite> {
  const monate = opts.monate ?? 18
  const jahr = parse(heute).y
  const hinweise: string[] = []

  const [accounts, balanceSums, bankBalances, vertraegeRes, nwRes, buchungen, lohnRes, annahmenRoh, snapshots] = await Promise.all([
    getDashboardAccounts(supabase, userId),
    getBalanceSums(supabase, userId),
    getBankBalances(supabase, userId),
    supabase
      .from('contracts')
      .select('id, name, type, frequency, amount, currency, billing_day, start_date, end_date, auto_renews, is_active, account_id, to_account_id')
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase.from('current_net_worth').select('snapshot_date, net_worth').eq('user_id', userId).maybeSingle(),
    // Die GANZE Historie: das Zyklusmodell lernt aus allem, was da ist, und gewichtet selbst.
    getFlowTransactions(supabase, userId, { to: heute }),
    supabase
      .from('unified_transactions')
      .select('date')
      .eq('user_id', userId)
      .eq('tax_role_effective', 'lohn')
      .eq('type', 'income')
      .gte('date', addMonate(monatVon(heute), -8) + '-01')
      .limit(200),
    fetchSettingValue(supabase, userId, ANNAHMEN_KEY),
    getNetWorthSnapshotsSince(supabase, userId, addTage(heute, -190)),
  ])

  // ── Konten und Liquidität ─────────────────────────────────────────────────────────────
  const aktiv = accounts.filter(a => a.is_active)
  const bankByIban = new Map(bankBalances.map(b => [b.account_iban, Number(b.booked_balance)]))
  const salden = computeAccountBalances(accounts, balanceSums, bankByIban)
  const liquide = aktiv.filter(a => LIQUIDE_TYPEN.has(a.type))
  const liquiditaet = liquide.reduce((s, a) => s + (salden.get(a.id) ?? 0), 0)

  const vermoegen = nwRes.data?.net_worth != null ? Number(nwRes.data.net_worth) : null
  if (vermoegen === null) hinweise.push('Es gibt noch keinen Vermögens-Snapshot — der Vermögensverlauf startet bei der Liquidität.')

  // ── Verträge (nur EUR) ────────────────────────────────────────────────────────────────
  const vertraege: PrognoseVertrag[] = (vertraegeRes.data ?? [])
    .filter(v => v.currency === 'EUR')
    .map(v => ({
      id: v.id, name: v.name, type: v.type, frequency: v.frequency, amount: Number(v.amount),
      billing_day: v.billing_day, start_date: v.start_date, end_date: v.end_date,
      auto_renews: v.auto_renews, is_active: v.is_active, account_id: v.account_id, to_account_id: v.to_account_id,
    }))

  // ── Historie, Lohn-Tag, Annahmen ──────────────────────────────────────────────────────
  const tage = baueTage(
    buchungen.map(b => ({ date: b.date, type: b.type, amount: b.amount, flow_kind: b.flow_kind, tax_role: b.tax_role })),
  )
  const lohnTag = typischerLohnTag((lohnRes.data ?? []).map(r => String(r.date)))
  const annahmen = leseAnnahmen(annahmenRoh)

  const gemeinsam = {
    heute, monate,
    liquideKontoIds: liquide.map(a => a.id),
    liquiditaet,
    vermoegen: vermoegen ?? liquiditaet,
    vertraege, tage, lohnTag,
  }
  const basis = berechnePrognose({ ...gemeinsam, annahmen: [] })
  const szenario = berechnePrognose({ ...gemeinsam, annahmen })

  // ── Steuer: laufendes und nächstes Jahr ───────────────────────────────────────────────
  const [aktuell, vorjahr, naechstes] = await Promise.all([
    ladeSteuerdaten(supabase, userId, jahr),
    ladeSteuerdaten(supabase, userId, jahr - 1),
    ladeSteuerdaten(supabase, userId, jahr + 1),
  ])
  const { rate, quelle } = laufrateAus(
    aktuell.eingaben,
    {
      betriebseinnahmen: vorjahr.eingaben.betriebseinnahmen,
      betriebsausgaben: vorjahr.eingaben.betriebsausgaben,
      lohnNetto: vorjahr.eingaben.lohnNettoImJahr,
    },
    heute,
  )
  const steuerJetzt = berechneSteuerPrognose({ jahr, heute, istStand: aktuell.eingaben, laufrate: rate, annahmen })
  // Das nächste Jahr braucht den Umsatz des laufenden als „Vorjahr" (Kleinunternehmer-Grenze): den
  // hochgerechneten, nicht den bisherigen Ist-Stand.
  const steuerNaechstes = berechneSteuerPrognose({
    jahr: jahr + 1, heute,
    istStand: { ...naechstes.eingaben, umsatzVorjahr: steuerJetzt.szenario.hochrechnung.betriebseinnahmen },
    laufrate: rate, annahmen,
  })

  return {
    heute,
    stand: {
      liquiditaet: Math.round(liquiditaet * 100) / 100,
      vermoegen,
      vermoegenStand: nwRes.data?.snapshot_date ? String(nwRes.data.snapshot_date) : null,
      liquideKonten: liquide.length,
    },
    basis, szenario,
    verlauf: tagesverlauf(snapshots, heute, 180),
    steuer: [steuerJetzt, steuerNaechstes],
    laufrateQuelle: quelle,
    annahmen,
    hinweise,
  }
}
