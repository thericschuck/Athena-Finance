/**
 * Shared formatting utilities that respect user settings.
 * `locale` comes from `number_format` setting (e.g. 'de-DE', 'en-US', 'fr-FR').
 * `dateFormat` comes from `date_format` setting (e.g. 'dd.MM.yyyy').
 */

export function fmtCurrency(
  n: number,
  currency = 'EUR',
  locale = 'de-DE',
  opts: { fractionDigits?: number; maxFractionDigits?: number } = {},
): string {
  const minD = opts.fractionDigits ?? 0
  const maxD = opts.maxFractionDigits ?? opts.fractionDigits ?? 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minD,
    maximumFractionDigits: maxD,
  }).format(n)
}

export function fmtNumber(n: number, locale = 'de-DE', fractionDigits = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

/** Zahl mit freier Spanne an Nachkommastellen (z. B. Anteile: 4 bis 6). */
export function fmtNumberRange(n: number, locale = 'de-DE', minDigits = 0, maxDigits = 3): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits }).format(n)
}

/** Prozentwert mit Leerzeichen vor dem Zeichen ("12,34 %"); `n` ist bereits in Prozent (12.34, nicht 0.1234). */
export function fmtPercent(n: number, locale = 'de-DE', fractionDigits = 2): string {
  return fmtNumber(n, locale, fractionDigits) + ' %'
}

/** Anteile/Stueckzahlen (4 bis 6 Nachkommastellen). */
export function fmtShares(n: number, locale = 'de-DE'): string {
  return fmtNumberRange(n, locale, 4, 6)
}

/** Uhrzeit (Stunde:Minute) eines ISO-Zeitstempels, nach Locale. */
export function fmtTime(iso: string, locale = 'de-DE'): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/** Langes Datum mit Wochentag ("Mo., 03. Nov. 2025") aus `YYYY-MM-DD`, nach Locale. */
export function fmtDateLong(iso: string, locale = 'de-DE'): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

/** Kurzes Datum mit Monatsnamen ("03. Nov. 25") aus `YYYY-MM-DD`, nach Locale (Achsenbeschriftung). */
export function fmtDateMonthShort(s: string, locale = 'de-DE'): string {
  return new Date(s + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' })
}

/**
 * Format a date string or Date object according to the user's date format setting.
 * Supported patterns: 'dd.MM.yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'
 */
export function fmtDate(
  d: string | Date | null | undefined,
  format = 'dd.MM.yyyy',
): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const day   = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year  = String(date.getFullYear())
  switch (format) {
    case 'MM/dd/yyyy': return `${month}/${day}/${year}`
    case 'yyyy-MM-dd': return `${year}-${month}-${day}`
    default:           return `${day}.${month}.${year}`
  }
}

/** Short date (day + month only), locale-aware */
export function fmtDateShort(
  d: string | Date | null | undefined,
  format = 'dd.MM.yyyy',
): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const day   = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  switch (format) {
    case 'MM/dd/yyyy': return `${month}/${day}`
    case 'yyyy-MM-dd': return `${month}-${day}`
    default:           return `${day}.${month}`
  }
}
