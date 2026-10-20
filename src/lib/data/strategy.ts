import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Datenzugriff für den Strategy-Bereich (Indikatoren, Backtests, Combos, Strategien).
 * Reine Funktionen: Client und userId kommen vom Aufrufer. Mutationen bleiben in
 * den jeweiligen actions.ts.
 *
 * Alle Listen sind unbegrenzt (kleine, handgepflegte Bibliothek); `indicators.code`
 * (Pine-Quelltext) wird bewusst mitgeladen, weil das Bearbeiten-Formular ihn braucht.
 */

type Client = SupabaseClient<Database>
type Tables = Database['public']['Tables']

// ─── Indikatoren ─────────────────────────────────────────────────────────────

export type IndicatorRow = Omit<Tables['indicators']['Row'], 'user_id' | 'created_at' | 'updated_at'>
export type IndicatorPerformanceRow = Omit<Tables['indicator_performance']['Row'], 'created_at'>

const INDICATOR_COLUMNS =
  'id, name, author, type, subtype, tv_url, repaints, is_forbidden, forbidden_reason, notes, code'

const PERFORMANCE_COLUMNS =
  'id, indicator_id, asset, asset_class, timeframe, settings, test_start, test_end, trades, win_rate, profit_factor, net_profit_pct, equity_max_dd, intra_trade_dd, sharpe, sortino, omega_ratio, cobra_green, cobra_red'

export type IndicatorFilters = { type?: string; author?: string; onlyAllowed?: boolean }

/** Indikatoren des Users (optional nach Typ/Autor/„nur erlaubte" gefiltert), nach Name. */
export async function getIndicators(supabase: Client, userId: string, filters: IndicatorFilters = {}): Promise<IndicatorRow[]> {
  let q = supabase
    .from('indicators')
    .select(INDICATOR_COLUMNS)
    .eq('user_id', userId)
  if (filters.type)        q = q.eq('type', filters.type)
  if (filters.author)      q = q.eq('author', filters.author)
  if (filters.onlyAllowed) q = q.eq('is_forbidden', false)
  const { data } = await q.order('name')
  return data ?? []
}

/** Performance-Einträge der Indikatoren, neueste zuerst. */
export async function getPerformanceForIndicators(supabase: Client, indicatorIds: string[]): Promise<IndicatorPerformanceRow[]> {
  if (indicatorIds.length === 0) return []
  const { data } = await supabase
    .from('indicator_performance')
    .select(PERFORMANCE_COLUMNS)
    .in('indicator_id', indicatorIds)
    .order('created_at', { ascending: false })
  return data ?? []
}

/** Typ/Autor ALLER Indikatoren (für die Filter-Optionen, unabhängig vom aktiven Filter). */
export async function getIndicatorFilterOptions(supabase: Client, userId: string): Promise<{ type: string; author: string }[]> {
  const { data } = await supabase
    .from('indicators')
    .select('type, author')
    .eq('user_id', userId)
  return data ?? []
}

export type IndicatorOption = { id: string; name: string; author: string }

/** Indikatoren als Auswahloptionen (Combo-Formular), nach Name. */
export async function getIndicatorOptions(supabase: Client, userId: string): Promise<IndicatorOption[]> {
  const { data } = await supabase
    .from('indicators')
    .select('id, name, author')
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

export type IndicatorInfo = { id: string; name: string; author: string; type: string }

/** Kurzinfo aller Indikatoren (Backtests-Seite: Zuordnung Name/Autor/Typ). */
export async function getIndicatorInfos(supabase: Client, userId: string): Promise<IndicatorInfo[]> {
  const { data } = await supabase
    .from('indicators')
    .select('id, name, author, type')
    .eq('user_id', userId)
  return data ?? []
}

export type PerformanceFilters = {
  assetClass?: string
  minCobraGreen?: number | null
  minCobraRed?: number | null
  minProfitFactor?: number | null
  minWinRate?: number | null
}

/** Backtests für die übergebenen Indikatoren, optional gefiltert. Unbegrenzt, Reihenfolge wie DB. */
export async function getPerformanceFiltered(
  supabase: Client, indicatorIds: string[], f: PerformanceFilters = {},
): Promise<IndicatorPerformanceRow[]> {
  let q = supabase
    .from('indicator_performance')
    .select(PERFORMANCE_COLUMNS)
    .in('indicator_id', indicatorIds.length ? indicatorIds : ['__none__'])
  if (f.assetClass) q = q.eq('asset_class', f.assetClass)
  if (f.minCobraGreen != null)   q = q.gte('cobra_green', f.minCobraGreen)
  if (f.minCobraRed != null)     q = q.gte('cobra_red', f.minCobraRed)
  if (f.minProfitFactor != null) q = q.gte('profit_factor', f.minProfitFactor)
  if (f.minWinRate != null)      q = q.gte('win_rate', f.minWinRate)
  const { data } = await q
  return data ?? []
}

// ─── Combos ──────────────────────────────────────────────────────────────────

export type ComboIndicatorLink = {
  indicator_id: string; role: string; settings_override: string | null; sort_order: number
}

export type ComboWithIndicators = {
  id: string; name: string; asset: string; asset_class: string; status: string
  passes_guard: boolean | null; guard_failures: string[] | null
  long_condition: string | null; short_condition: string | null
  indicator_count: number | null; notes: string | null
  combo_indicators: ComboIndicatorLink[]
}

/** Combos inkl. Indikator-Verknüpfungen, nach Name; die Verknüpfungen sind nach sort_order sortiert. */
export async function getCombosWithIndicators(supabase: Client, userId: string): Promise<ComboWithIndicators[]> {
  const { data } = await supabase
    .from('combos')
    .select(
      'id, name, asset, asset_class, status, passes_guard, guard_failures, long_condition, short_condition, indicator_count, notes, combo_indicators(indicator_id, role, settings_override, sort_order)',
    )
    .eq('user_id', userId)
    .order('name')
  return ((data ?? []) as unknown as ComboWithIndicators[]).map(c => ({
    ...c,
    combo_indicators: [...(c.combo_indicators ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export type ComboOptionRow = { id: string; name: string }

/** Combos als Auswahloptionen (Strategie-Formular), nach Name. */
export async function getComboOptions(supabase: Client, userId: string): Promise<ComboOptionRow[]> {
  const { data } = await supabase
    .from('combos')
    .select('id, name')
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

// ─── Strategien ──────────────────────────────────────────────────────────────

export type StrategyRow = Omit<Tables['strategies']['Row'], 'user_id' | 'created_at' | 'updated_at'>

const STRATEGY_COLUMNS =
  'id, name, asset, asset_class, timeframe, status, combo_id, pine_version, version, initial_capital, process_on_close, tv_script_url, submission_date, notes'

/** Alle Strategien des Users, nach Name. */
export async function getStrategies(supabase: Client, userId: string): Promise<StrategyRow[]> {
  const { data } = await supabase
    .from('strategies')
    .select(STRATEGY_COLUMNS)
    .eq('user_id', userId)
    .order('name')
  return data ?? []
}

/** Eine Strategie (`null`, wenn sie nicht existiert oder nicht dem User gehört). */
export async function getStrategy(supabase: Client, userId: string, id: string): Promise<StrategyRow | null> {
  const { data } = await supabase
    .from('strategies')
    .select(STRATEGY_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  return data ?? null
}

/**
 * IDs der submission-ready Strategien. Die View hat kein user_id; die Eingrenzung auf den
 * User passiert wie bisher über RLS der zugrunde liegenden Tabelle.
 */
export async function getSubmissionReadyIds(supabase: Client): Promise<string[]> {
  const { data } = await supabase
    .from('submission_ready')
    .select('id')
  return (data ?? []).map(r => r.id).filter((id): id is string => !!id)
}

export type SubmissionChecklistRow = Pick<Tables['submission_checklist']['Row'],
  'equity_screenshot' | 'indicator_desc' | 'inputs_screenshot' | 'repaint_tested' |
  'robustness_sheet' | 'stats_screenshot' | 'tv_script_url'>

export async function getSubmissionChecklist(supabase: Client, strategyId: string): Promise<SubmissionChecklistRow | null> {
  const { data } = await supabase
    .from('submission_checklist')
    .select('equity_screenshot, indicator_desc, inputs_screenshot, repaint_tested, robustness_sheet, stats_screenshot, tv_script_url')
    .eq('strategy_id', strategyId)
    .maybeSingle()
  return data ?? null
}

export type RobustnessStatusRow = Pick<Database['public']['Views']['robustness_status']['Row'],
  'all_tests_pass' | 'exchange_test' | 'parameter_test' | 'timeframe_test'>

export async function getRobustnessStatus(supabase: Client, strategyId: string): Promise<RobustnessStatusRow | null> {
  const { data } = await supabase
    .from('robustness_status')
    .select('all_tests_pass, exchange_test, parameter_test, timeframe_test')
    .eq('strategy_id', strategyId)
    .maybeSingle()
  return data ?? null
}
