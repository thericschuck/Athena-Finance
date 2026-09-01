// ── Shared types für die Analyse-Komponenten ──────────────────────────────────

export interface HeatmapDay {
  date:   string  // "2026-03-15"
  amount: number  // Ausgaben in €
  income: number  // Einnahmen in €
}

export interface SankeyNodeDatum { name: string }
export interface SankeyLinkDatum {
  source: number
  target: number
  /**
   * Bandbreite im Diagramm. Fuer Ausgabenkategorien heruntergerechnet, damit die Summe der
   * abgehenden Baender zu den eingehenden Einnahmen passt — recharts' Sankey-Layout setzt
   * eine ausgeglichene Bilanz voraus (siehe buildSankey in analyse/page.tsx).
   */
  value: number
  /**
   * Der tatsaechliche Betrag in EUR — die Zahl, die im Tooltip stehen muss.
   *
   * Optional, weil `value` und `realValue` nur dann auseinanderfallen, wenn ueberhaupt
   * skaliert wurde. Wo beides identisch ist (z. B. die Demodaten der Landingpage), waere
   * die doppelte Angabe nur eine zweite Stelle, die man vergessen kann anzupassen. Der
   * Tooltip faellt entsprechend auf `value` zurueck.
   */
  realValue?: number
}
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
