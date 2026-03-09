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
