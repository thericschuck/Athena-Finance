import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { FinanceCategory } from '@/types/bank'
import { getActiveAccountOptions } from '@/lib/data/overview'
import { getFlowMonthsScope, getFlowTransactionsScope, getMonthlyFlowsScope } from '@/lib/data/flows-scope'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { FLOW_DEFAULT_KEY, flowDefaultFrom, includeFromParam } from '@/lib/finance/flow-calc'
import { parsePeriod, periodCutoff } from '@/lib/period'
import { aktuellesFenster, monatPlus, monatsErster, parseVergleich, vergleichsFenster, zusammenhaengenderBeginn } from '@/lib/analyse/vergleich'
import type { AnalyseDaten } from '@/lib/analyse/typen'

/**
 * Lädt den Kern der Analyse-Seite in einem Durchgang. Der Kalender (die GANZE Historie) ist
 * bewusst nicht dabei: er lädt sich selbst hinter einer Suspense-Grenze, damit der Rest der
 * Seite nicht auf die größte Abfrage wartet.
 */

type DB = SupabaseClient<Database>

export interface AnalyseParams {
  period?: string
  accounts?: string
  anlage?: string
  kat?: string
  monat?: string
  tag?: string
  partei?: string
  vergleich?: string
}

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/
const TAG = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Kategorienbaum pro Haushalt: die RLS liefert ihn, kein user_id-/Scope-Filter (ohne Partner unveraendert nur die eigenen). */
async function ladeKategorien(supabase: DB): Promise<FinanceCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, type, color, icon, parent_id')
    .order('type')
    .order('sort_order')
    .order('name')
  if (error) throw new Error(`categories: ${error.message}`)
  return (data ?? []) as FinanceCategory[]
}

/**
 * Scope-faehig: Konten (ctx.accountIds), Buchungen und Monatssummen (Konten im Scope, im Haushalt mit herabgestuften
 * Umbuchungen, siehe flows-scope.ts), Kategorien (Haushaltsbaum per RLS). Ohne Partner liefert 'ich' die bisherigen Werte.
 */
export async function ladeAnalyse(
  supabase: DB, ctx: ScopeContext, params: AnalyseParams,
  settings: Record<string, unknown>, heute: string,
): Promise<AnalyseDaten> {
  // Kategorien und Monate mit Buchungen haengen nicht an der Kontenliste: gleich mitstarten statt erst nach ihr.
  const kategorienP = ladeKategorien(supabase)
  const fruehesteP = getFlowMonthsScope(supabase, ctx)
  kategorienP.catch(() => {}); fruehesteP.catch(() => {}) // Ablehnung wird unten beim Abwarten behandelt, hier nur kein "unhandled"
  const konten = await getActiveAccountOptions(supabase, ctx)
  const kontoMenge = new Set(konten.map(k => k.id))

  const periode = parsePeriod(params.period, parsePeriod(settings.analyse_default_period))
  const cutoff = periodCutoff(periode, new Date(`${heute}T12:00:00`))
  const include = includeFromParam(params.anlage, flowDefaultFrom(settings[FLOW_DEFAULT_KEY]))
  const vergleich = parseVergleich(params.vergleich)

  // Konten-Filter: 'all' ist ein ausdruecklicher Klick auf „Alle Konten" und gewinnt immer. Fehlt
  // der Parameter ganz, gilt die gespeicherte Standardauswahl; eine konkrete Liste gewinnt auch.
  const standardKonten = Array.isArray(settings.analyse_default_accounts)
    ? (settings.analyse_default_accounts as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  let kontoIds: string[]
  if (params.accounts === undefined) kontoIds = standardKonten.filter(id => kontoMenge.has(id))
  else if (params.accounts === 'all' || params.accounts === '') kontoIds = []
  else kontoIds = params.accounts.split(',').map(s => s.trim()).filter(id => kontoMenge.has(id))
  const accountIds = kontoIds.length > 0 ? kontoIds : undefined

  const fenster = aktuellesFenster(cutoff, heute)
  const vFenster = vergleichsFenster(periode, cutoff, heute, vergleich)

  // Monatssummen: mindestens 24 Monate (Verteilung, Monatsvergleich) UND das Vergleichsfenster.
  const monatsStart24 = monatPlus(heute, -24)
  const monatsStart = vFenster && vFenster.von < monatsStart24 ? vFenster.von : monatsStart24

  const [txns, monatsZeilen, categories, fruehesterMonate] = await Promise.all([
    // Ab dem Monatsersten des Cutoffs, wie die Monatssummen: sonst fehlen im Geldfluss, in der
    // Heatmap und in der Liste die ersten Tage des ersten Monats, obwohl Kennzahlen und der
    // Monatsvergleich ihn ganz zaehlen.
    getFlowTransactionsScope(supabase, ctx, { from: cutoff ? monatsErster(cutoff) : null, accountIds, include }),
    // Bei Alles die ganze Historie (Monatssummen sind klein): mit nur 24 Monaten deckten
    // Kategorien und Kennzahlen dort nicht die ganze Historie ab.
    getMonthlyFlowsScope(supabase, ctx, { from: periode === 'Alles' ? null : monatsStart, accountIds, include }),
    kategorienP,
    // Monate mit Buchungen: ohne Partner monthly_flow_totals (wie bisher), im Haushalt aus monthly_flows im Scope.
    fruehesteP,
  ])

  return {
    scopeCtx: ctx,
    heute,
    locale: (typeof settings.number_format === 'string' && settings.number_format) || 'de-DE',
    dateFormat: (typeof settings.date_format === 'string' && settings.date_format) || 'dd.MM.yyyy',
    periode,
    cutoff,
    include,
    konten,
    kontoIds,
    filter: {
      kat: params.kat || null,
      monat: params.monat && MONAT.test(params.monat) ? params.monat : null,
      tag: params.tag && TAG.test(params.tag) ? params.tag : null,
      partei: params.partei || null,
    },
    vergleich,
    fenster,
    vergleichsFenster: vFenster,
    // Beginn der ZUSAMMENHAENGENDEN Historie: einzelne Streumonate weit davor (2018, 2021) wuerden
    // sonst jeden Vergleich als abgedeckt gelten lassen.
    fruehesterMonat: zusammenhaengenderBeginn(fruehesterMonate),
    txns,
    monatsZeilen,
    categories,
  }
}

/** Heutiges Datum in deutscher Zeit (YYYY-MM-DD) — `toISOString` lieferte nach Mitternacht noch den Vortag. */
export function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

