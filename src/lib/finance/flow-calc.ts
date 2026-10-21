/**
 * Reine Rechenfunktionen über die Zeilen der View `monthly_flows`.
 * Keine Imports außerhalb dieser Datei, damit `node --test` sie direkt laden kann.
 *
 * Regelwerk (Entscheidung 2026-10-21):
 *   • echt / anlage / forderung zählen als Einnahme bzw. Ausgabe — `monthly_flows` enthält
 *     nur diese. Umbuchungen und Anfangsbestände kommen gar nicht erst an.
 *   • flow_kind bleibt als Merkmal erhalten: „Konsum" = echt, „Anlage" = anlage,
 *     „Forderung" = forderung. Ein Schalter blendet Anlage/Forderung in Diagrammen aus.
 *   • Die Sparquote rechnet ausschließlich auf echt (wie vor der Umstellung): Geld, das in
 *     Anlagen fließt, ist Sparen und deshalb keine Konsumausgabe.
 */

export type FlowKind = 'echt' | 'anlage' | 'forderung'

/** Zeile von `monthly_flows`, soweit die Rechenfunktionen sie brauchen. */
export type FlowRow = {
  flow_kind: string
  income: number
  expense: number
  root_category_id?: string | null
  root_category_name?: string | null
  category_id?: string | null
  category_name?: string | null
}

/** Welche Arten in eine Summe eingehen. `echt` ist immer dabei. */
export type FlowInclude = { anlage: boolean; forderung: boolean }

export const INCLUDE_ALL: FlowInclude = { anlage: true, forderung: true }
export const INCLUDE_CONSUMPTION: FlowInclude = { anlage: false, forderung: false }

export type FlowTotals = {
  /** Einnahmen/Ausgaben nach `include`. */
  income: number
  expense: number
  net: number
  /** Aufschlüsselung, unabhängig von `include`. */
  echt:      { income: number; expense: number }
  anlage:    { income: number; expense: number }
  forderung: { income: number; expense: number }
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function included(kind: string, include: FlowInclude): boolean {
  if (kind === 'echt') return true
  if (kind === 'anlage') return include.anlage
  if (kind === 'forderung') return include.forderung
  return false // unbekannte Art (z. B. umbuchung): nie mitzählen
}

export function sumFlows(rows: FlowRow[], include: FlowInclude = INCLUDE_ALL): FlowTotals {
  const t: FlowTotals = {
    income: 0, expense: 0, net: 0,
    echt: { income: 0, expense: 0 },
    anlage: { income: 0, expense: 0 },
    forderung: { income: 0, expense: 0 },
  }
  for (const r of rows) {
    const income = num(r.income)
    const expense = num(r.expense)
    if (r.flow_kind === 'echt' || r.flow_kind === 'anlage' || r.flow_kind === 'forderung') {
      t[r.flow_kind].income += income
      t[r.flow_kind].expense += expense
    }
    if (included(r.flow_kind, include)) {
      t.income += income
      t.expense += expense
    }
  }
  t.net = t.income - t.expense
  return t
}

/**
 * Sparquote in Prozent, auf Konsum-Basis (nur `echt`). `null`, wenn es keine Einnahmen gibt:
 * die Quote ist dann nicht definiert, und „0 %" würde eine ausgeglichene Bilanz behaupten.
 */
export function savingsRate(totals: FlowTotals): number | null {
  const { income, expense } = totals.echt
  if (income <= 0) return null
  return Math.round(((income - expense) / income) * 100)
}

export type CategoryTotal = {
  id: string | null
  name: string
  income: number
  expense: number
  /** Beträge der Unterkategorien, nach größerer Summe zuerst. */
  children: { id: string | null; name: string; income: number; expense: number }[]
}

export const UNCATEGORIZED = 'Ohne Kategorie'

/**
 * Summen je Hauptkategorie mit Drilldown auf die Kategorie darunter. Gruppiert nach der ID,
 * nicht nach dem Namen: gleichnamige Kategorien unter verschiedenen Eltern bleiben getrennt.
 * Buchungen ohne Kategorie landen überall unter demselben Namen.
 */
export function rollupByRoot(
  rows: FlowRow[],
  include: FlowInclude = INCLUDE_ALL,
  by: 'income' | 'expense' = 'expense',
): CategoryTotal[] {
  const roots = new Map<string, CategoryTotal>()
  const key = (id: string | null | undefined) => id ?? '__none__'

  for (const r of rows) {
    if (!included(r.flow_kind, include)) continue
    const income = num(r.income)
    const expense = num(r.expense)
    if (income === 0 && expense === 0) continue

    const rootId = r.root_category_id ?? r.category_id ?? null
    const rootName = r.root_category_name ?? r.category_name ?? UNCATEGORIZED
    let root = roots.get(key(rootId))
    if (!root) {
      root = { id: rootId, name: rootName, income: 0, expense: 0, children: [] }
      roots.set(key(rootId), root)
    }
    root.income += income
    root.expense += expense

    const childId = r.category_id ?? null
    let child = root.children.find(c => c.id === childId)
    if (!child) {
      child = { id: childId, name: r.category_name ?? UNCATEGORIZED, income: 0, expense: 0 }
      root.children.push(child)
    }
    child.income += income
    child.expense += expense
  }

  const sortBy = by === 'income' ? (a: { income: number }, b: { income: number }) => b.income - a.income
                                 : (a: { expense: number }, b: { expense: number }) => b.expense - a.expense
  const out = [...roots.values()].filter(r => (by === 'income' ? r.income : r.expense) !== 0)
  for (const r of out) r.children.sort(sortBy)
  return out.sort(sortBy)
}

export type MonthSummary = FlowTotals & {
  /** Erster Tag des Monats, YYYY-MM-DD. */
  month: string
  /** Sparquote auf Konsum-Basis, siehe savingsRate. */
  savingsRate: number | null
}

/**
 * Eine Zeile je Monat, aufsteigend. Monate ohne Buchungen fehlen (die View liefert keine
 * Nullzeilen); wer eine lückenlose Achse braucht, füllt sie selbst auf.
 */
export function monthlySeries(
  rows: (FlowRow & { month: string })[],
  include: FlowInclude = INCLUDE_ALL,
): MonthSummary[] {
  const byMonth = new Map<string, (FlowRow & { month: string })[]>()
  for (const r of rows) {
    // Nur Zeilen, die in dieser Sicht zählen: sonst entstünde für einen Monat mit ausschließlich
    // Anlage-Zeilen in der Konsum-Sicht eine Nullzeile, die Durchschnitte und Achsen verzerrt.
    if (!included(r.flow_kind, include)) continue
    const list = byMonth.get(r.month)
    if (list) list.push(r)
    else byMonth.set(r.month, [r])
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      const totals = sumFlows(list, include)
      return { month, ...totals, savingsRate: savingsRate(totals) }
    })
}

export type CategoryMonthSeries = {
  /** Hauptkategorien nach Gesamtausgaben im Zeitraum, größte zuerst; evtl. gefolgt vom Sammelposten. */
  categories: string[]
  /** Name des Sammelpostens, falls es einen gibt — eindeutig gegenüber den echten Kategorien. */
  otherKey: string | null
  months: { month: string; values: Record<string, number> }[]
}

export const OTHER_CATEGORIES = 'Weitere'

/**
 * Ausgaben je Monat und Hauptkategorie für die größten `topN` Hauptkategorien; der Rest
 * wird zu „Sonstige" gebündelt. Die Bündelung geschieht über den ganzen Zeitraum, damit
 * eine Kategorie in jedem Monat dieselbe Farbe/Reihe behält.
 */
export function monthlyCategorySeries(
  rows: (FlowRow & { month: string })[],
  include: FlowInclude = INCLUDE_CONSUMPTION,
  topN = 5,
): CategoryMonthSeries {
  const nameOf = (r: FlowRow) => r.root_category_name ?? r.category_name ?? UNCATEGORIZED
  const totals = new Map<string, number>()
  for (const r of rows) {
    if (!included(r.flow_kind, include)) continue
    const e = num(r.expense)
    if (e !== 0) totals.set(nameOf(r), (totals.get(nameOf(r)) ?? 0) + e)
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
  const top = new Set(ranked.slice(0, topN))
  const hasRest = ranked.length > topN
  // Eindeutig, auch wenn es eine echte Hauptkategorie mit diesem Namen gibt (doppelte Keys im Chart).
  let otherKey = OTHER_CATEGORIES
  while (top.has(otherKey)) otherKey += ' ·'

  const byMonth = new Map<string, Record<string, number>>()
  for (const r of rows) {
    if (!included(r.flow_kind, include)) continue
    // Jeden Monat anlegen, in dem es in dieser Sicht Zeilen gibt — auch ohne Ausgaben. Sonst
    // zeigt ein Chart nach Kategorie andere Monate als der Einnahmen/Ausgaben-Chart daneben.
    const values = byMonth.get(r.month) ?? {}
    byMonth.set(r.month, values)
    const e = num(r.expense)
    if (e === 0) continue
    const key = top.has(nameOf(r)) ? nameOf(r) : otherKey
    values[key] = (values[key] ?? 0) + e
  }
  return {
    otherKey: hasRest ? otherKey : null,
    categories: hasRest ? [...ranked.slice(0, topN), otherKey] : ranked.slice(0, topN),
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, values })),
  }
}

/** URL-Parameter `anlage=1` schaltet Anlage und Forderungen dazu; ohne ihn gilt die Konsum-Sicht. */
export const INCLUDE_PARAM = 'anlage'

export function includeFromParam(value: string | null | undefined): FlowInclude {
  return value === '1' ? INCLUDE_ALL : INCLUDE_CONSUMPTION
}
