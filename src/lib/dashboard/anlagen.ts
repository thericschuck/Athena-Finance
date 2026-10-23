/**
 * Reine Hilfen fuer die Reihen Konten und Anlagen des Dashboards. Die Werte kommen fertig aus dem
 * Kern; hier wird nur beschriftet und die Krypto-Rendite gegen die Kosten gebildet.
 */

const KONTOTYPEN: Record<string, string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment: 'Depot / Investment',
  crypto: 'Krypto',
  cash: 'Bargeld',
  credit: 'Kreditkarte',
  other: 'Sonstiges',
}

/** Lesbarer Kontotyp; unbekannte Werte erscheinen unveraendert statt leer. */
export function kontotypLabel(typ: string): string {
  return KONTOTYPEN[typ] ?? typ
}

/**
 * Gewinn/Verlust der Krypto-Position gegen die eingesetzten Kosten. Ohne Kosten (null oder <= 0)
 * gibt es keine Aussage — dann null, damit nichts Erfundenes angezeigt wird.
 */
export function kryptoErgebnis(gesamt: number, kosten: number | null): { betrag: number; prozent: number } | null {
  if (kosten === null || !(kosten > 0)) return null
  const betrag = gesamt - kosten
  return { betrag, prozent: (betrag / kosten) * 100 }
}

/** Rebalancing-Hinweis erst ab 1 EUR Handelsvolumen (wie der bisherige Alert). */
export function zeigeRebalancing(volumen: number): boolean {
  return volumen >= 1
}

/** Prozentwert mit Vorzeichen, eine Nachkommastelle; Rundung auf 0,0 zeigt kein Vorzeichen. */
export function prozentText(p: number, locale: string): string {
  const r = Math.round(p * 10) / 10
  const zahl = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(r))
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${zahl} %`
}

export type Ton = 'gut' | 'schlecht' | 'neutral'

export function tonFuer(wert: number): Ton {
  const r = Math.round(wert * 10) / 10
  return r > 0 ? 'gut' : r < 0 ? 'schlecht' : 'neutral'
}
