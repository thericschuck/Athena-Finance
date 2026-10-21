/**
 * Annahmen für die Prognose: bekannte oder erwartete Änderungen, die in der Vergangenheit noch
 * nicht stehen (z. B. „ab Januar 2027 mehr Gehalt von Schera"). Liegen als JSON in
 * `user_settings` unter dem Schlüssel `forecast_assumptions`.
 *
 * Wie sie wirken:
 *   lohn              SETZT das monatliche Lohnniveau ab `von` (ersetzt den bisherigen Lohn, addiert nicht).
 *                     `betrag` = Netto pro Monat, `brutto` = Brutto pro Monat (für die Steuer).
 *                     Gelten mehrere, gewinnt die mit dem spätesten `von`, das schon erreicht ist.
 *   betriebseinnahme  zusätzlich pro Monat (Gewerbe, Umsatz), zählt für die Steuer.
 *   betriebsausgabe   zusätzlich pro Monat (Gewerbe), mindert den Gewinn.
 *   einnahme          zusätzlich pro Monat, steuerlich ohne Wirkung (z. B. Zuwendung).
 *   ausgabe           zusätzlich pro Monat, steuerlich ohne Wirkung (z. B. höhere Miete).
 *
 * Keine Imports, damit `node --test` die Datei direkt laden kann.
 */

export const ANNAHME_ARTEN = ['lohn', 'betriebseinnahme', 'betriebsausgabe', 'einnahme', 'ausgabe'] as const
export type AnnahmeArt = typeof ANNAHME_ARTEN[number]

export const ANNAHMEN_KEY = 'forecast_assumptions'

export type Annahme = {
  id: string
  label: string
  art: AnnahmeArt
  /** Erster Monat, `YYYY-MM`. */
  von: string
  /** Letzter Monat inklusive, `YYYY-MM`; null = unbegrenzt. */
  bis: string | null
  /** Betrag pro Monat in EUR, immer ≥ 0. Bei `lohn` das Netto. */
  betrag: number
  /** Nur `lohn`: Brutto pro Monat. */
  brutto: number | null
}

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/

function zahl(v: unknown): number | null {
  // Ein leeres Feld ist keine 0: Number('') ergibt 0, und eine leere Zeile würde als „0 €" gespeichert.
  if (typeof v === 'string' && v.trim() === '') return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

/** Liest die Annahmen defensiv aus dem JSON: ungültige Einträge fallen heraus, statt die Seite zu brechen. */
export function leseAnnahmen(roh: unknown): Annahme[] {
  if (!Array.isArray(roh)) return []
  const out: Annahme[] = []
  for (const e of roh) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const art = ANNAHME_ARTEN.find(a => a === o.art)
    const betrag = zahl(o.betrag)
    const von = typeof o.von === 'string' && MONAT.test(o.von) ? o.von : null
    if (!art || betrag === null || betrag < 0 || !von) continue
    const bis = typeof o.bis === 'string' && MONAT.test(o.bis) && o.bis >= von ? o.bis : null
    const brutto = art === 'lohn' ? zahl(o.brutto) : null
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `a${out.length}`,
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 80) : art,
      art,
      von,
      bis,
      betrag: Math.round(betrag * 100) / 100,
      brutto: brutto !== null && brutto >= 0 ? Math.round(brutto * 100) / 100 : null,
    })
  }
  return out.slice(0, 50)
}

/** Gilt die Annahme im Monat `monat` (`YYYY-MM`)? */
export function giltImMonat(a: Annahme, monat: string): boolean {
  return monat >= a.von && (a.bis === null || monat <= a.bis)
}

/** Die Lohn-Annahme, die im Monat gilt (die mit dem spätesten `von`), sonst null. */
export function lohnImMonat(annahmen: Annahme[], monat: string): Annahme | null {
  let beste: Annahme | null = null
  for (const a of annahmen) {
    if (a.art !== 'lohn' || !giltImMonat(a, monat)) continue
    if (!beste || a.von > beste.von) beste = a
  }
  return beste
}

/** Summe der zusätzlichen Annahmen einer Art im Monat. */
export function summeImMonat(annahmen: Annahme[], art: Exclude<AnnahmeArt, 'lohn'>, monat: string): number {
  return annahmen.filter(a => a.art === art && giltImMonat(a, monat)).reduce((s, a) => s + a.betrag, 0)
}
