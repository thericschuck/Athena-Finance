/** Mehr Zeilen liest im Chat niemand — der Rest wird nur noch gezählt. */
export const DETAIL_LIMIT = 8

/** Für Struktur-Vorschläge (Kategoriebaum) etwas mehr: hier ist die Liste
    nicht Beleg für eine Zahl, sondern selbst der Inhalt der Entscheidung. */
export const STRUCTURE_DETAIL_LIMIT = 20

export const money = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value)

export const eur = (value: number) => money(value)

/** Betrag oder Gedankenstrich — in der Aufschlüsselung ist eine leere Zelle
    nicht von „0 €" zu unterscheiden. */
export const eurOr = (value: number | null | undefined) => (value == null ? '—' : eur(value))

/** ISO-Datum als de-DE. Unparsbare Eingaben werden durchgereicht statt zu
    „Invalid Date" zu werden — der Rohwert ist immer noch informativer. */
export const day = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed)
}

export const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  yearly: 'jährlich',
  weekly: 'wöchentlich',
  once: 'einmalig',
}

export const PRIORITY_LABELS: Record<string, string> = { high: 'hoch', medium: 'mittel', low: 'niedrig' }

export const GOAL_STATUS_LABELS: Record<string, string> = {
  active: 'aktiv',
  paused: 'pausiert',
  reached: 'erreicht',
  cancelled: 'abgebrochen',
}

export const SEVERITY_LABELS: Record<string, string> = {
  info: 'Info',
  warning: 'Warnung',
  critical: 'Kritisch',
}
