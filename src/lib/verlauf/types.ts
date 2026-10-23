/**
 * Gemeinsame Typen der Verlauf-Seite (analyse/verlauf). Hier, damit Rechenlogik, Chart und
 * Tabs unabhängig voneinander gebaut werden können und sich nur über diese Formen treffen.
 */

/** Ein Tag aus `net_worth_snapshots` (eine Zeile pro Nutzer und Tag). */
export interface NetWorthPunkt {
  /** YYYY-MM-DD */
  datum: string
  net_worth: number
  total_assets: number
  total_checking: number
  total_investment: number
  total_savings: number
  total_cash: number
  total_depot: number
  total_crypto: number
  total_bausparer: number
  total_business: number
  /** Positiv gespeichert (Betrag der Schulden), wird in Charts abgezogen. */
  total_debts: number
}

/** Töpfe, in die sich das Vermögen aufteilt — Schlüssel = Spalte, Label = Anzeige. */
export const NETWORTH_TOEPFE = [
  { key: 'total_checking',   label: 'Girokonto' },
  { key: 'total_investment', label: 'Geschäftsanteile' },
  { key: 'total_savings',    label: 'Sparkonto' },
  { key: 'total_cash',       label: 'Cash' },
  { key: 'total_depot',      label: 'Depot' },
  { key: 'total_crypto',     label: 'Crypto' },
  { key: 'total_bausparer',  label: 'Bausparer' },
  { key: 'total_business',   label: 'Business' },
] as const

export type NetWorthTopf = typeof NETWORTH_TOEPFE[number]['key']

/** Punkt einer zusätzlichen Linie (Projektion, Sammlung …). */
export interface LinienPunkt {
  datum: string
  wert: number
}

/** Prognosepunkt mit Unsicherheitsbereich (80 %), aus der Cashflow-Prognose (lib/forecast). */
export interface ProjektionPunkt extends LinienPunkt {
  unten?: number
  oben?: number
}

/** Zeitraum-Schalter, den Chart und Seite gemeinsam benutzen. */
export const ZEITRAEUME = ['1m', '3m', '6m', '1y', 'ytd', 'max'] as const
export type Zeitraum = typeof ZEITRAEUME[number]
