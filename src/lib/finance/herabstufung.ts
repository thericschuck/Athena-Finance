/**
 * Reine Rechenregeln fuer die Herabstufung haushaltsweiter Umbuchungen im Scope (kein DB-Zugriff, laeuft unter `node --test`).
 * Die Abfragen stehen in lib/data/flows-scope.ts, die verbindliche Regel in lib/haushalt/umbuchung.ts (`wirdHerabgestuft`).
 */
import { wirdHerabgestuft } from '../haushalt/umbuchung.ts'
import type { FlowTransaction, MonthlyFlowRow, MonthlyTotalsPageRow } from '../data/flows.ts'

/** Zeile aus der View monthly_umbuchungen (Sicht eines Kontos, Richtung als income/expense). */
export type UmbMonatsZeile = {
  month: string | null
  account_id: string | null
  counterpart_account_id: string | null
  source: string | null
  flow_kind_extern: string | null
  category_id: string | null
  category_name: string | null
  root_category_id: string | null
  root_category_name: string | null
  tax_role_effective: string | null
  income: number | null
  expense: number | null
  tx_count: number | null
}

/** Im Scope zu echten Buchungen herabgestufte Monatszeilen (nur Arten aus `kinds`). `scope` = ctx.accountIds. */
export function herabgestufteMonate(rows: readonly UmbMonatsZeile[], scope: ReadonlySet<string>, kinds: ReadonlySet<string>): MonthlyFlowRow[] {
  const out: MonthlyFlowRow[] = []
  for (const r of rows) {
    const art = r.flow_kind_extern
    if (!art || !kinds.has(art) || r.month === null) continue
    if (!wirdHerabgestuft({ flow_kind: 'umbuchung', account_id: r.account_id, counterpart_account_id: r.counterpart_account_id, flow_kind_extern: art }, scope)) continue
    out.push({
      month: String(r.month), account_id: r.account_id, source: String(r.source), flow_kind: art,
      category_id: r.category_id, category_name: r.category_name,
      root_category_id: r.root_category_id, root_category_name: r.root_category_name,
      tax_role: r.tax_role_effective,
      income: Number(r.income ?? 0), expense: Number(r.expense ?? 0), tx_count: Number(r.tx_count ?? 0),
    })
  }
  return out
}

/** Zeile aus unified_transactions mit flow_kind = 'umbuchung'. */
export type UmbBuchung = {
  id: string | null
  date: string | null
  amount_eur: number | null
  signed_amount: number | null
  source: string | null
  account_id: string | null
  counterpart_account_id: string | null
  flow_kind_extern: string | null
  category_id: string | null
  category_name: string | null
  root_category_id: string | null
  root_category_name: string | null
  description: string | null
  merchant: string | null
  tax_role_effective: string | null
}

/**
 * Herabgestufte Einzelbuchungen. Manuelle Umbuchungen haben EINE Zeile (Abgang auf `account_id`, Zugang auf
 * `counterpart_account_id`); jede Seite zaehlt aus der Sicht ihres Kontos (wie monthly_umbuchungen), die Zugangsseite bekommt
 * die ID `<id>:zu`. `konten` = ausgewaehlte Konten im Scope, `scope` = ctx.accountIds.
 */
export function herabgestufteBuchungen(
  rows: readonly UmbBuchung[], konten: ReadonlySet<string>, scope: ReadonlySet<string>, kinds: ReadonlySet<string>,
): FlowTransaction[] {
  const out: FlowTransaction[] = []
  for (const r of rows) {
    const art = r.flow_kind_extern
    if (r.id === null || r.date === null || !art || !kinds.has(art)) continue
    const gemeinsam = {
      date: String(r.date).slice(0, 10), amount: Math.abs(Number(r.amount_eur ?? 0)), flow_kind: art, source: String(r.source),
      category_id: r.category_id, category_name: r.category_name,
      root_category_id: r.root_category_id, root_category_name: r.root_category_name,
      description: r.description, merchant: r.merchant, tax_role: r.tax_role_effective, herabgestuft: true,
    }
    if (r.account_id && konten.has(r.account_id)
      && wirdHerabgestuft({ flow_kind: 'umbuchung', account_id: r.account_id, counterpart_account_id: r.counterpart_account_id, flow_kind_extern: art }, scope)) {
      out.push({ ...gemeinsam, id: r.id, type: Number(r.signed_amount ?? 0) > 0 ? 'income' : 'expense', account_id: r.account_id })
    }
    if (r.source === 'manual' && r.counterpart_account_id && konten.has(r.counterpart_account_id)
      && wirdHerabgestuft({ flow_kind: 'umbuchung', account_id: r.counterpart_account_id, counterpart_account_id: r.account_id, flow_kind_extern: art }, scope)) {
      out.push({ ...gemeinsam, id: `${r.id}:zu`, type: 'income', account_id: r.counterpart_account_id })
    }
  }
  return out
}

/**
 * Ersatz fuer `monthly_flow_totals` aus Monatszeilen (monthly_flows + herabgestufte Umbuchungen): je Monat
 * income/expense ueber alle Arten, dazu je Art. Jüngster Monat zuerst. Gleiche Summenbildung wie die View.
 */
export function monatsTotals(zeilen: readonly Pick<MonthlyFlowRow, 'month' | 'flow_kind' | 'income' | 'expense' | 'tx_count'>[]): MonthlyTotalsPageRow[] {
  const je = new Map<string, MonthlyTotalsPageRow>()
  for (const z of zeilen) {
    const m = je.get(z.month) ?? {
      month: z.month, income: 0, expense: 0, echt_income: 0, echt_expense: 0, anlage_income: 0, anlage_expense: 0,
      forderung_income: 0, forderung_expense: 0, tx_count: 0,
    }
    m.income += z.income
    m.expense += z.expense
    m.tx_count += z.tx_count
    if (z.flow_kind === 'echt') { m.echt_income += z.income; m.echt_expense += z.expense }
    else if (z.flow_kind === 'anlage') { m.anlage_income += z.income; m.anlage_expense += z.expense }
    else if (z.flow_kind === 'forderung') { m.forderung_income += z.income; m.forderung_expense += z.expense }
    je.set(z.month, m)
  }
  return [...je.values()].sort((a, b) => b.month.localeCompare(a.month))
}
