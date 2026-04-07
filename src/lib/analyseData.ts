// ── Shared types für die Analyse-Komponenten ──────────────────────────────────

export interface HeatmapDay {
  date:   string  // "2026-03-15"
  amount: number  // Ausgaben in €
  income: number  // Einnahmen in €
}

export interface SankeyNodeDatum { name: string }
export interface SankeyLinkDatum { source: number; target: number; value: number }
export interface SankeyData {
  nodes: SankeyNodeDatum[]
  links: SankeyLinkDatum[]
}

export interface CashflowEvent {
  date:   string
  type:   'income' | 'expense'
  label:  string
  amount: number
}

export interface MonthlyComparison {
  month:     string
  einnahmen: number
  ausgaben:  number
  sparquote: number
}

export interface CategoryDatum {
  name:  string
  value: number  // positiv = Einnahme, negativ = Ausgabe
}
