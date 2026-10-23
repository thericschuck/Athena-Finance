import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { fmtCurrency, fmtNumber, fmtDate as fmtDateLib } from '@/lib/format'

export const PAGE_SIZE = 50

/**
 * Heutiges Datum (YYYY-MM-DD) in deutscher Zeit. `new Date().toISOString()` liefert UTC: in der
 * ersten Stunde nach Mitternacht ist es dort noch der Vortag, am 1. Januar also noch das
 * Vorjahr — und „seit Jahresanfang" zeigte auf das falsche Jahr.
 */
export function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmtEur(n: number | null | undefined, locale: string): string {
  if (n == null) return '—'
  return fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
}

export function fmtNum(n: number | null | undefined, decimals = 4, locale = 'de-DE'): string {
  if (n == null) return '—'
  return fmtNumber(n, locale, decimals)
}

export function fmtDate(s: string | null, dateFormat: string): string {
  return fmtDateLib(s, dateFormat)
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

export function Td({ children, right, mono, dim, red }: {
  children: React.ReactNode
  right?: boolean; mono?: boolean; dim?: boolean; red?: boolean
}) {
  return (
    <td className={[
      'px-3 py-2 text-sm whitespace-nowrap',
      right ? 'text-right' : 'text-left',
      mono  ? 'tabular-nums' : '',
      dim   ? 'text-muted-foreground' : '',
      red   ? 'text-danger' : '',
    ].join(' ')}>
      {children}
    </td>
  )
}

// ─── Pagination helper ────────────────────────────────────────────────────────
export function Pagination({ tab, page, total, params = {} }: { tab: string; page: number; total: number; params?: Record<string, string | undefined> }) {
  const pages   = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 0
  const hasNext = page + 1 < pages

  const btnCls = 'px-3 py-1.5 text-xs rounded border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div className="flex items-center justify-between px-3 py-3 border-t border-border text-xs text-muted-foreground">
      <span>{total} Einträge · Seite {page + 1} / {pages}</span>
      <div className="flex gap-2">
        {hasPrev && (
          <Link href={href({ ...params, tab }, { page: String(page - 1) })} className={btnCls}>← Zurück</Link>
        )}
        {hasNext && (
          <Link href={href({ ...params, tab }, { page: String(page + 1) })} className={btnCls}>Weiter →</Link>
        )}
      </div>
    </div>
  )
}

// ─── Shared tab context ───────────────────────────────────────────────────────
export type TabCtx = {
  supabase: SupabaseClient<Database>
  uid: string
  locale: string
  dateFormat: string
  page: number
  from: number
  to: number
  /** Alle Query-Parameter der Seite (tab, page, plus tabspezifische Filter wie `konto`, `agg`, `zeitraum`). */
  params: Record<string, string | undefined>
}

/**
 * Link auf dieselbe Seite mit geaenderten Query-Parametern. `undefined` oder leer entfernt
 * einen Parameter. Filter bleiben so beim Blaettern und Tabwechsel-Links erhalten, wo
 * gewuenscht: `href(params, { page: '2' })` behaelt `konto` & Co., `href({ tab: 'x' }, {})`
 * beginnt frisch.
 */
export function href(
  params: Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {},
): string {
  const merged = { ...params, ...overrides }
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v)
  const str = q.toString()
  return str ? `?${str}` : '?'
}
