import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getNetWorthSnapshotsSince } from '@/lib/data/overview'
import { getAccounts, getBankBalances, getUnifiedBalanceSums } from '@/lib/data/finance-accounts'
import { applyAccountScope, applyOwnerScope, type ScopeContext } from '@/lib/haushalt/scope'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'
import { fetchSettingValue } from '@/lib/data/settings'
import { getNetWorthReihe, nutztSnapshotFunktion } from '@/lib/data/networth-reihe'
import { computeAccountBalances } from '@/lib/finance/dashboard-calc'
import { ladeSteuerdaten, neuerSteuerCache } from '@/lib/tax/laden'
import { addMonate, addTage, monatVon, parse } from './datum'
import { leseAnnahmen, type Annahme } from './annahmen'
import { berechnePrognose, lerneModelle, type Prognose, type PrognoseVertrag } from './cashflow'
import { typischerLohnTag } from './historie'
import { leseUeberschreibung, type EinmalKandidat } from './einmalig'
import { baueScopeHistorie } from './scope-historie'
import { tagesverlauf, type SnapshotZeile, type VerlaufPunkt } from './verlauf'
import {
  annahmenKey, steuerErlaubt, ueberschreibungKey, STEUER_HINWEIS, ZU_WENIG_HISTORIE_HINWEIS,
} from './scope-regeln'
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
  /** Große Posten, die das Modell vermutlich verzerren: Auswahl und Stand (ausgeschlossen oder nicht). */
  einmalposten: EinmalKandidat[]
  /** Wie viele Buchungen insgesamt vom Lernen ausgenommen sind. */
  ausgeschlossen: number
  hinweise: string[]
  zuWenigHistorie: boolean
}

/**
 * Alles, was die Cashflow-/Vermögensprognose braucht, ohne Steuer und Rückblick: Daten laden,
 * Modelle einmal lernen, Basis und Szenario rechnen. Eigene Funktion, damit andere Seiten (der
 * Vermögensverlauf) dieselbe Prognose benutzen können, ohne die Steuerberechnung mitzuladen.
 */
export type PrognoseBasis = {
  stand: PrognoseSeite['stand']
  basis: Prognose
  szenario: Prognose
  annahmen: Annahme[]
  einmalposten: EinmalKandidat[]
  ausgeschlossen: number
  hinweise: string[]
  /** Scope ohne genug Historie (< 3 Monate ab dem Tag, an dem alle Konten des Scopes Buchungen haben): keine Prognose, nur Hinweis. */
  zuWenigHistorie: boolean
  /** Rückblick-Reihe der letzten ~190 Tage aus `net_worth_series`, wenn der Scope sie braucht (sonst undefined: Snapshots des Nutzers). */
  rueckblick?: SnapshotZeile[]
}

/**
 * `ctx`: Konten/Vertraege/Historie des Scopes.
 * Owner-only bleiben die Einstellungen (Annahmen/Auswahl, je Scope mit eigenem Schluessel, siehe scope-regeln.ts) und die Steuer
 * (nur Scope 'ich'). Das Start-Vermoegen und der Rueckblick kommen im Scope 'ich' (ohne fremdes geteiltes Konto) wie bisher aus dem
 * Snapshot des Nutzers; sonst aus `net_worth_series` (networth-reihe.ts), damit Vermoegen und Liquiditaet zum selben Scope gehoeren.
 */
export async function ladePrognoseBasis(
  supabase: DB, ctx: ScopeContext, heute: string, opts: { monate?: number } = {},
): Promise<PrognoseBasis> {
  const monate = opts.monate ?? 18
  const hinweise: string[] = []
  const userId = ctx.userId
  const scope = ctx.scope
  const ueberKey = ueberschreibungKey(scope)
  const reiheCtx = nutztSnapshotFunktion(ctx) ? ctx : null
  const vertraegeQ = supabase
    .from('contracts')
    .select('id, name, type, frequency, amount, currency, billing_day, start_date, end_date, auto_renews, is_active, account_id, to_account_id')
  const lohnQ = supabase.from('unified_transactions').select('date')

  const [accounts, balanceSums, bankBalances, vertraegeRes, nwRes, reiheRes, buchungenRoh, lohnRes, annahmenRoh, ueRoh] = await Promise.all([
    getAccounts(supabase, ctx),
    getUnifiedBalanceSums(supabase, ctx).then(r => r.map(s => ({ ...s, tx_count: 0 }))),
    getBankBalances(supabase, ctx),
    applyOwnerScope(vertraegeQ, ctx).eq('is_active', true),
    reiheCtx
      ? Promise.resolve(null)
      : supabase.from('current_net_worth').select('snapshot_date, net_worth').eq('user_id', userId).maybeSingle(),
    reiheCtx ? getNetWorthReihe(supabase, reiheCtx, addTage(heute, -190)) : Promise.resolve(null),
    // Die GANZE Historie: das Zyklusmodell lernt aus allem, was da ist, und gewichtet selbst.
    getFlowTransactionsScope(supabase, ctx, { to: heute }),
    applyAccountScope(lohnQ, ctx)
      .eq('tax_role_effective', 'lohn')
      .eq('type', 'income')
      .gte('date', addMonate(monatVon(heute), -8) + '-01')
      .limit(200),
    fetchSettingValue(supabase, userId, annahmenKey(scope)),
    fetchSettingValue(supabase, userId, ueberKey),
  ])

  // ── Konten und Liquidität ─────────────────────────────────────────────────────────────
  const aktiv = accounts.filter(a => a.is_active)
  const bankByIban = new Map(bankBalances.map(b => [b.account_iban, Number(b.booked_balance)]))
  const salden = computeAccountBalances(accounts, balanceSums, bankByIban)
  const liquide = aktiv.filter(a => LIQUIDE_TYPEN.has(a.type))
  const liquiditaet = liquide.reduce((s, a) => s + (salden.get(a.id) ?? 0), 0)

  let vermoegen: number | null
  let vermoegenStand: string | null
  let rueckblick: SnapshotZeile[] | undefined
  if (reiheRes) {
    // Scope mit eigener Vermögensreihe: der jüngste Tag der Reihe ist das Start-Vermögen (gleicher Scope wie die Liquidität).
    const letzte = reiheRes.rows.length > 0 ? reiheRes.rows[reiheRes.rows.length - 1] : null
    vermoegen = letzte ? letzte.net_worth : null
    vermoegenStand = letzte ? letzte.snapshot_date : null
    rueckblick = reiheRes.rows
    if (vermoegen === null) {
      hinweise.push(
        'Das Vermögen dieser Ansicht konnte nicht berechnet werden' + (reiheRes.fehler ? ` (${reiheRes.fehler})` : '') +
        ' — der Vermögensverlauf startet bei der Liquidität.',
      )
    }
  } else {
    vermoegen = nwRes?.data?.net_worth != null ? Number(nwRes.data.net_worth) : null
    vermoegenStand = nwRes?.data?.snapshot_date ? String(nwRes.data.snapshot_date) : null
    if (vermoegen === null) hinweise.push('Es gibt noch keinen Vermögens-Snapshot — der Vermögensverlauf startet bei der Liquidität.')
  }

  // ── Verträge (nur EUR) ────────────────────────────────────────────────────────────────
  // Ansicht Partner/Gemeinsam: nur Verträge, deren Konto im Scope liegt (sonst wirkten sie auf das Vermögen, aber nicht auf die Liquidität).
  const kontoImScope = (id: string | null) => scope === 'ich' || id === null || ctx.accountIds.includes(id)
  const vertraege: PrognoseVertrag[] = (vertraegeRes.data ?? [])
    .filter(v => v.currency === 'EUR' && kontoImScope(v.account_id))
    .map(v => ({
      id: v.id, name: v.name, type: v.type, frequency: v.frequency, amount: Number(v.amount),
      billing_day: v.billing_day, start_date: v.start_date, end_date: v.end_date,
      auto_renews: v.auto_renews, is_active: v.is_active, account_id: v.account_id, to_account_id: v.to_account_id,
    }))

  // ── Historie, Lohn-Tag, Annahmen ──────────────────────────────────────────────────────
  // Historie des Scopes: erst ab dem Tag, an dem alle liquiden Konten Buchungen haben (nur Partner/Gemeinsam, siehe scope-regeln.ts).
  // Einmalposten: extreme Ausreißer sind standardmäßig draußen, der Rest nur auf Wunsch (siehe einmalig.ts); unregelmäßige
  // Haushalts-Einlagen (herabgestufte Umbuchungen ohne Zyklus-Muster) ebenfalls.
  const hist = baueScopeHistorie(
    scope,
    buchungenRoh.map(b => ({
      id: b.id, date: b.date, type: b.type, amount: b.amount, flow_kind: b.flow_kind, tax_role: b.tax_role,
      gegenpartei: b.merchant ?? b.description, kategorie: b.category_name, herabgestuft: b.herabgestuft, account_id: b.account_id,
    })),
    liquide.map(a => a.id),
    leseUeberschreibung(ueRoh),
    heute,
  )
  const { tage, zuWenigHistorie } = hist
  const einmal = { kandidaten: hist.kandidaten, ausgeschlossen: hist.ausgeschlossen }
  if (zuWenigHistorie) hinweise.push(ZU_WENIG_HISTORIE_HINWEIS)
  else if (hist.start) hinweise.push(`Gelernt wird ab ${hist.start}, dem Tag, an dem alle Konten dieser Ansicht Buchungen haben.`)
  const lohnTag = typischerLohnTag((lohnRes.data ?? []).map(r => String(r.date)))
  const annahmen = leseAnnahmen(annahmenRoh)

  const gemeinsam = {
    heute, monate,
    liquideKontoIds: liquide.map(a => a.id),
    liquiditaet,
    vermoegen: vermoegen ?? liquiditaet,
    vertraege, tage, lohnTag,
    ohneLohnWarnung: scope !== 'ich' && lohnTag === null,
  }
  // Lernen einmal (teuer), dann Basis und Szenario daraus rechnen: das Modell hängt nicht von den Annahmen ab.
  const gelernt = lerneModelle(gemeinsam)
  const basis = berechnePrognose({ ...gemeinsam, annahmen: [] }, gelernt)
  const szenario = berechnePrognose({ ...gemeinsam, annahmen }, gelernt)

  return {
    stand: {
      liquiditaet: Math.round(liquiditaet * 100) / 100,
      vermoegen,
      vermoegenStand,
      liquideKonten: liquide.length,
    },
    basis, szenario, annahmen,
    einmalposten: einmal.kandidaten,
    ausgeschlossen: einmal.ausgeschlossen.size,
    hinweise,
    zuWenigHistorie,
    rueckblick,
  }
}

export async function ladePrognose(
  supabase: DB, ctx: ScopeContext, heute: string, opts: { monate?: number } = {},
): Promise<PrognoseSeite> {
  const jahr = parse(heute).y
  const userId = ctx.userId
  const scope = ctx.scope
  const mitSteuer = steuerErlaubt(scope)
  const eigenerRueckblick = !nutztSnapshotFunktion(ctx)
  // Rückblick, Cashflow-Prognose und die drei Steuerjahre sind voneinander unabhängig (die Annahmen aus der Prognose fließen erst
  // in die Berechnung unten ein, nicht in das Laden) und laufen deshalb in EINER Stufe statt Prognose -> Steuer.
  // Ein gemeinsamer Zwischenspeicher: die drei Jahre überlappen (Vorjahre, Kraken-Historie) und werden so je einmal geladen.
  // Steuer ist persönlich (owner-only): nur in der Ansicht 'ich' geladen und gerechnet. Der Rückblick kommt im Scope mit eigener
  // Vermögensreihe aus der Prognose-Basis (dieselbe `net_worth_series`-Abfrage wie das Start-Vermögen), sonst aus den Snapshots des Nutzers.
  const steuerCache = neuerSteuerCache()
  const [b, snapshots, aktuell, vorjahr, naechstes] = await Promise.all([
    ladePrognoseBasis(supabase, ctx, heute, opts),
    eigenerRueckblick ? getNetWorthSnapshotsSince(supabase, ctx, addTage(heute, -190)) : Promise.resolve(null),
    mitSteuer ? ladeSteuerdaten(supabase, userId, jahr, steuerCache) : Promise.resolve(null),
    mitSteuer ? ladeSteuerdaten(supabase, userId, jahr - 1, steuerCache) : Promise.resolve(null),
    mitSteuer ? ladeSteuerdaten(supabase, userId, jahr + 1, steuerCache) : Promise.resolve(null),
  ])
  const { basis, szenario, annahmen } = b
  const hinweise = [...b.hinweise]

  let steuer: SteuerPrognose[] = []
  let laufrateQuelle = ''
  if (aktuell && vorjahr && naechstes) {
    const { rate, quelle } = laufrateAus(
      aktuell.eingaben,
      {
        betriebseinnahmen: vorjahr.eingaben.betriebseinnahmen,
        betriebsausgaben: vorjahr.eingaben.betriebsausgaben,
        lohnNetto: vorjahr.eingaben.lohnNettoImJahr,
      },
      heute,
    )
    laufrateQuelle = quelle
    const steuerJetzt = berechneSteuerPrognose({ jahr, heute, istStand: aktuell.eingaben, laufrate: rate, annahmen })
    // Das nächste Jahr braucht den Umsatz des laufenden als „Vorjahr" (Kleinunternehmer-Grenze): den
    // hochgerechneten, nicht den bisherigen Ist-Stand.
    const steuerNaechstes = berechneSteuerPrognose({
      jahr: jahr + 1, heute,
      istStand: { ...naechstes.eingaben, umsatzVorjahr: steuerJetzt.szenario.hochrechnung.betriebseinnahmen },
      laufrate: rate, annahmen,
    })
    steuer = [steuerJetzt, steuerNaechstes]
  } else {
    hinweise.push(STEUER_HINWEIS)
  }

  return {
    heute,
    stand: b.stand,
    basis, szenario,
    verlauf: tagesverlauf(snapshots ?? b.rueckblick ?? [], heute, 180),
    steuer,
    laufrateQuelle,
    annahmen,
    einmalposten: b.einmalposten,
    ausgeschlossen: b.ausgeschlossen,
    hinweise,
    zuWenigHistorie: b.zuWenigHistorie,
  }
}
