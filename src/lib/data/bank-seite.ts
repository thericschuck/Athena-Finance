import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { BankBalance, BankTransaction, FinanceCategory } from '@/types/bank'
import { getMonthlyFlows } from '@/lib/data/flows'
import { FLOW_DEFAULT_KEY, flowDefaultFrom, includeFromParam, INCLUDE_PARAM } from '@/lib/finance/flow-calc'
import { parsePeriod, periodCutoff } from '@/lib/period'
import { normIban } from '@/lib/bank/scope'
import type { BankSeitenDaten } from '@/lib/bank/typen'

/**
 * Laedt alles, was die Bankdaten-Seite braucht, auf dem Server und in einem Rutsch.
 *
 * Vorher holte die Seite im Browser nach dem Laden Salden, Buchungen, Kategorien und
 * Monatssummen ueber vier eigene Routen — mit Skeleton-Flackern und Abfragen hintereinander.
 * Jetzt laufen alle Abfragen gleichzeitig vor dem ersten Byte, und die Abschnitte bekommen
 * fertige Daten. Gefiltert wird danach in lib/bank/scope.ts, nicht in der Datenbank: die
 * Historie ist klein (rund 700 Buchungen), und alle Abschnitte sehen so exakt dieselben
 * Zeilen. Zeitraum, Konto und Monat stehen in der URL; jeder Wechsel rendert die Seite auf
 * dem Server neu (wie die Analyse-Seite) und blendet solange die alten Zahlen ab.
 */

type DB = SupabaseClient<Database>

const BUCHUNGS_SPALTEN =
  'id, user_id, bank_label, account_iban, account_bic, amount, currency, value_date, ' +
  'entry_date, description, counterpart_name, counterpart_iban, counterpart_bic, ' +
  'category_id, raw_description, bank_reference, created_at'

const SEITE = 1000
const MAX_BUCHUNGEN = 5000

async function ladeBuchungen(supabase: DB, userId: string): Promise<BankTransaction[]> {
  const alle: BankTransaction[] = []
  for (let von = 0; von < MAX_BUCHUNGEN; von += SEITE) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select(BUCHUNGS_SPALTEN)
      .eq('user_id', userId)
      .order('value_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(von, von + SEITE - 1)
    if (error) throw new Error(`bank_transactions: ${error.message}`)
    const zeilen = (data ?? []) as unknown as BankTransaction[]
    alle.push(...zeilen)
    if (zeilen.length < SEITE) break
  }
  return alle
}

async function ladeSalden(supabase: DB, userId: string): Promise<BankBalance[]> {
  const [{ data, error }, { data: verknuepft }] = await Promise.all([
    supabase.from('bank_balance').select('*').eq('user_id', userId).order('account_iban'),
    // Verknuepftes Konto: nur ueber accounts.bank_iban, kein Fremdschluessel (siehe
    // api/bank/balance) — deshalb zwei Abfragen statt eines Embeds.
    supabase.from('accounts').select('id, bank_iban').eq('user_id', userId).not('bank_iban', 'is', null),
  ])
  if (error) throw new Error(`bank_balance: ${error.message}`)
  const idByIban = new Map(
    (verknuepft ?? []).flatMap(a => (a.bank_iban ? [[normIban(a.bank_iban), a.id] as const] : [])),
  )
  return (data ?? []).map(b => ({ ...b, account_id: idByIban.get(normIban(b.account_iban)) ?? null })) as unknown as BankBalance[]
}

async function ladeKategorien(supabase: DB, userId: string): Promise<FinanceCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, type, color, icon, parent_id')
    .eq('user_id', userId)
    .order('type')
    .order('sort_order')
    .order('name')
  if (error) throw new Error(`categories: ${error.message}`)
  return (data ?? []) as FinanceCategory[]
}

/** Ein kaputter `number_format` in den Einstellungen wuerde in Intl einen RangeError werfen und die ganze Seite kippen. */
function gueltigeLocale(wert: unknown): string {
  if (typeof wert !== 'string' || !wert) return 'de-DE'
  try {
    return Intl.NumberFormat.supportedLocalesOf([wert]).length > 0 ? wert : 'de-DE'
  } catch {
    return 'de-DE'
  }
}

export interface BankSeitenParams {
  period?: string
  month?: string
  konto?: string
  partei?: string
  kat?: string
  [INCLUDE_PARAM]?: string
}

/** `settings` = Ergebnis von getSettings (Zahlen-/Datumsformat, Standardzeitraum, Flow-Standard). */
export async function ladeBankSeite(
  supabase: DB, userId: string, params: BankSeitenParams,
  settings: Record<string, unknown>, heute: string,
): Promise<BankSeitenDaten> {
  const [balances, transactions, categories, flowRows] = await Promise.all([
    ladeSalden(supabase, userId),
    ladeBuchungen(supabase, userId),
    ladeKategorien(supabase, userId),
    getMonthlyFlows(supabase, userId, { source: 'bank_sync' }),
  ])

  // 1W und 1M fehlen bewusst: Monatstrend und Kategorien brauchen mehrere Monate.
  const erlaubt = new Set(['3M', '6M', '1J', 'Alles'])
  let periode = parsePeriod(params.period)
  if (!erlaubt.has(periode)) periode = parsePeriod(undefined)

  const monat = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null

  return {
    heute,
    locale: gueltigeLocale(settings.number_format),
    dateFormat: (settings.date_format as string) ?? 'dd.MM.yyyy',
    periode,
    cutoff: periodCutoff(periode, new Date(`${heute}T12:00:00`)),
    monat,
    konto: params.konto ? params.konto : null,
    partei: params.partei ? params.partei : null,
    kat: params.kat ? params.kat : null,
    include: includeFromParam(params[INCLUDE_PARAM], flowDefaultFrom(settings[FLOW_DEFAULT_KEY])),
    balances,
    transactions,
    categories,
    flowRows: flowRows.map(r => ({ ...r })) as BankSeitenDaten['flowRows'],
    eigeneIbans: balances.map(b => normIban(b.account_iban)),
  }
}
