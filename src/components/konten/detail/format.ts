import { fmtCurrency } from '@/lib/format'

/**
 * Betragsformate der Konto-Detailseite. Krypto-Beträge (BTC/ETH) brauchen sechs Nachkommastellen,
 * alles andere läuft über `fmtCurrency`.
 */
const KRYPTO = ['BTC', 'ETH']

export function formatBetrag(amount: number, currency: string, locale: string): string {
  if (KRYPTO.includes(currency)) return `${amount.toFixed(6)} ${currency}`
  return fmtCurrency(amount, currency, locale, { fractionDigits: 2 })
}

/** Mit Vorzeichen (echtes Minuszeichen), für Salden und Abweichungen. */
export function formatMitVorzeichen(n: number, currency: string, locale: string): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}${formatBetrag(Math.abs(n), currency, locale)}`
}

/**
 * Buchungsbetrag aus `signed_amount` (die view-Spalte trägt die echte Richtung, auch für
 * Umbuchungen zwischen eigenen Konten — über `type` allein zeigte eine Umbuchung immer „+“).
 */
export function formatBuchung(signedAmount: number, amount: number, currency: string, locale: string) {
  const sign = signedAmount > 0 ? '+' : signedAmount < 0 ? '−' : ''
  return { sign, display: formatBetrag(Math.abs(amount), currency, locale), net: signedAmount }
}

/** IBAN in Vierergruppen; Eingaben ohne Leerzeichen werden gegliedert, sonst unverändert. */
export function formatIban(iban: string): string {
  const roh = iban.replace(/\s+/g, '')
  return roh.replace(/(.{4})/g, '$1 ').trim()
}

/** Heutiges Datum in deutscher Zeit (YYYY-MM-DD) — `toISOString` lieferte nach Mitternacht noch den Vortag. */
export function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

/** `YYYY-MM` als „Oktober 2026“. */
export function monatLabel(monat: string, locale: string): string {
  return new Date(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)) - 1, 1)
    .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}
