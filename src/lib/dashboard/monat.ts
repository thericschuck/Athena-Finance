/**
 * Reine Hilfen fuer die Monatskarte des Dashboards. Die Summen selbst kommen fertig aus dem Kern
 * (dashboard-seite.ts); hier wird nichts neu gerechnet, nur beurteilt und beschriftet.
 */

export type BudgetTon = 'gut' | 'warnung' | 'schlecht'

export interface BudgetStand {
  /** Verbrauch in Prozent des Budgets (kann ueber 100 liegen). */
  prozent: number
  /** Breite des Balkens, auf 0..100 begrenzt. */
  balken: number
  ton: BudgetTon
  /** Rest bis zum Budget; negativ = ueberzogen. */
  rest: number
}

/**
 * Budgetstand: Konsum gegen Monatsbudget. Gruen bis unter 80 %, gelb ab 80 %, rot ab 100 %.
 * Ohne Budget (null oder <= 0) gibt es keinen Stand, damit die Karte die Zeile weglaesst statt
 * durch null zu teilen.
 */
export function budgetStand(budget: number | null, konsum: number): BudgetStand | null {
  if (budget === null || !(budget > 0)) return null
  const verbrauch = Math.max(0, konsum)
  const prozent = (verbrauch / budget) * 100
  const ton: BudgetTon = prozent >= 100 ? 'schlecht' : prozent >= 80 ? 'warnung' : 'gut'
  return { prozent, balken: Math.min(100, prozent), ton, rest: budget - verbrauch }
}

/** Nettozeichen fuer die Anzeige: Rundung auf Cent, damit -0,001 nicht als Minus erscheint. */
export function nettoVorzeichen(netto: number): 'plus' | 'minus' | 'null' {
  const r = Math.round(netto * 100) / 100
  return r > 0 ? 'plus' : r < 0 ? 'minus' : 'null'
}
