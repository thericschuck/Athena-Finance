'use client'

import { useMemo } from 'react'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency, fmtDate, fmtDateLong, fmtDateMonthShort, fmtDateTime, fmtNumber, fmtNumberRange, fmtPercent, fmtShares, fmtTime } from '@/lib/format'

/**
 * Formatierer, gebunden an die Nutzereinstellungen `number_format` (Locale) und `date_format` (siehe SettingsProvider).
 * Eine Stelle statt je Komponente eigener `toLocaleString('de-DE', ...)`-Kopien (AUDIT.md C9). Nur in Client-Komponenten;
 * Server-Komponenten rufen die reinen Funktionen aus lib/format.ts mit der Locale aus den Einstellungen auf.
 */
export function useFormat() {
  const { locale, dateFormat } = useSettings()
  return useMemo(() => ({
    locale,
    /** Euro mit zwei Nachkommastellen. */
    fmtEur: (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 }),
    fmtPct: (n: number) => fmtPercent(n, locale),
    fmtShares: (n: number) => fmtShares(n, locale),
    /** Datum `YYYY-MM-DD` im eingestellten Datumsformat. */
    fmtDate: (s: string) => fmtDate(s + 'T00:00:00', dateFormat),
    /** Datum oder Zeitstempel (ISO) im eingestellten Datumsformat. */
    fmtDateIso: (iso: string) => fmtDate(iso, dateFormat),
    /** Datum und Uhrzeit eines Zeitstempels nach Locale (Datum mittellang, Uhrzeit kurz). */
    fmtDateTime: (iso: string) => fmtDateTime(iso, locale),
    /** Zahl mit zwei Nachkommastellen und angehaengtem " €" (Budget-Ansichten). */
    fmtBetragEuro: (n: number) => fmtNumber(n, locale, 2) + ' €',
    fmtDateLong: (s: string) => fmtDateLong(s, locale),
    fmtDateMonthShort: (s: string) => fmtDateMonthShort(s, locale),
    fmtTime: (iso: string) => fmtTime(iso, locale),
    /** Zahl mit fester Zahl an Nachkommastellen. */
    fmtZahl: (n: number, digits = 2) => fmtNumber(n, locale, digits),
    /** Zahl mit Spanne an Nachkommastellen. */
    fmtZahlSpanne: (n: number, min: number, max: number) => fmtNumberRange(n, locale, min, max),
  }), [locale, dateFormat])
}
