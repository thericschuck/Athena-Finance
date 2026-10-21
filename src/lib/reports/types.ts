/** Gemeinsames Datenmodell für Monats- und Jahresreports — von build.ts gefüllt, von
 *  render-html.ts, render-pdf.tsx und der In-App-Ansicht gleichermaßen gelesen. */

export type ReportType = 'monthly' | 'annual'

export type ReportTotals = {
  income:   number
  expenses: number
  net:      number
}

export type ReportCategoryDatum = {
  name:   string
  amount: number
}

export type ReportCategoryChange = {
  name:            string
  amount:          number
  previousAmount:  number
  delta:           number
}

export type ReportNetWorth = {
  start: number | null
  end:   number | null
  delta: number | null
}

export type ReportInsightRow = {
  title:     string
  severity:  string
  createdAt: string
}

/** Steuer-Anhang des Jahresreports (opt-in): nur Zahlen, die die Steuer-Seite auch zeigt. */
export type ReportTax = {
  year:                number
  profit:              number
  taxableIncome:       number
  estimatedTax:        number
  marginalRatePct:     number
  smallBusinessStatus: 'gruen' | 'gelb' | 'rot' | 'unbekannt'
  reserveTarget:       number
  reserveActual:       number | null
  /** Krypto (§ 23 EStG, nur Kraken); null, wenn nicht ladbar. */
  crypto: { taxableBalance: number; toTax: number; taxFreeGain: number; allowance: number } | null
  warnings:            string[]
}

export type ReportData = {
  type:                 ReportType
  periodStart:          string
  periodEnd:            string
  label:                string
  previousLabel:        string
  totals:               ReportTotals
  previousTotals:       ReportTotals
  topExpenseCategories: ReportCategoryDatum[]
  notableChanges:       ReportCategoryChange[]
  netWorth:             ReportNetWorth
  openInsights:         ReportInsightRow[]
  /** Nur im Jahresreport und nur auf ausdrücklichen Wunsch (enthält persönliche Steuerzahlen). */
  tax?:                 ReportTax
  /** Warum der gewünschte Steuer-Anhang fehlt. */
  taxError?:            string
  generatedAt:          string
}
