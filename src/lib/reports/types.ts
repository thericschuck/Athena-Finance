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
  generatedAt:          string
}
