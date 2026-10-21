import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getNetWorthHistoryPage, getHistoryAccounts, getAccountBalanceHistoryPage, getHistoryAssets,
  getPortfolioSnapshotHistoryPage,
} from '@/lib/data/overview'
import { getMonthlyTotalsPage } from '@/lib/data/flows'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtNumber, fmtDate as fmtDateLib } from '@/lib/format'

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS     = ['networth', 'accounts', 'portfolio', 'monthly'] as const
type Tab       = typeof TABS[number]
const PAGE_SIZE = 50

const TAB_LABELS: Record<Tab, string> = {
  networth:  'Net Worth',
  accounts:  'Konten',
  portfolio: 'Portfolio',
  monthly:   'Monatsübersicht',
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtEur(n: number | null | undefined, locale: string): string {
  if (n == null) return '—'
  return fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
}

function fmtNum(n: number | null | undefined, decimals = 4, locale = 'de-DE'): string {
  if (n == null) return '—'
  return fmtNumber(n, locale, decimals)
}

function fmtDate(s: string | null, dateFormat: string): string {
  return fmtDateLib(s, dateFormat)
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ children, right, mono, dim, red }: {
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
function Pagination({ tab, page, total }: { tab: string; page: number; total: number }) {
  const pages   = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 0
  const hasNext = page + 1 < pages

  const btnCls = 'px-3 py-1.5 text-xs rounded border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none'

  return (
    <div className="flex items-center justify-between px-3 py-3 border-t border-border text-xs text-muted-foreground">
      <span>{total} Einträge · Seite {page + 1} / {pages}</span>
      <div className="flex gap-2">
        {hasPrev && (
          <Link href={`?tab=${tab}&page=${page - 1}`} className={btnCls}>← Zurück</Link>
        )}
        {hasNext && (
          <Link href={`?tab=${tab}&page=${page + 1}`} className={btnCls}>Weiter →</Link>
        )}
      </div>
    </div>
  )
}

// ─── Shared tab context ───────────────────────────────────────────────────────
type TabCtx = {
  supabase: SupabaseClient<Database>
  uid: string
  locale: string
  dateFormat: string
  page: number
  from: number
  to: number
}

// ─── Tab: Net Worth ───────────────────────────────────────────────────────────
async function NetworthTab({ supabase, uid, locale, dateFormat, page, from, to }: TabCtx) {
  const { rows: data, count } = await getNetWorthHistoryPage(supabase, uid, { from, to })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <Th>Datum</Th>
            <Th right>Net Worth</Th>
            <Th right>Assets</Th>
            <Th right>Girokonto</Th>
            <Th right>Geschäftsant.</Th>
            <Th right>Sparkonto</Th>
            <Th right>Cash</Th>
            <Th right>Depot</Th>
            <Th right>Crypto</Th>
            <Th right>Bausparer</Th>
            <Th right>Business</Th>
            <Th right>Schulden</Th>
            <Th>Quelle</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
              <Td>{fmtDate(r.snapshot_date, dateFormat)}</Td>
              <Td right mono>
                <span className="font-semibold">{fmtEur(r.net_worth, locale)}</span>
              </Td>
              <Td right mono>{fmtEur(r.total_assets, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_checking, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_investment, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_savings, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_cash, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_depot, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_crypto, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_bausparer, locale)}</Td>
              <Td right mono dim>{fmtEur(r.total_business, locale)}</Td>
              <Td right mono red>{fmtEur(r.total_debts, locale)}</Td>
              <Td dim>{r.source}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination tab="networth" page={page} total={count} />
    </div>
  )
}

// ─── Tab: Accounts ────────────────────────────────────────────────────────────
async function AccountsTab({ supabase, uid, locale, dateFormat, page, from, to }: TabCtx) {
  // Get user's accounts first, then filter balances
  const accts = await getHistoryAccounts(supabase, uid)

  const acctIds  = accts.map(a => a.id)
  const acctMap  = new Map(accts.map(a => [a.id, a]))

  const { rows: data, count } = await getAccountBalanceHistoryPage(supabase, acctIds, { from, to })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <Th>Datum</Th>
            <Th>Konto</Th>
            <Th>Typ</Th>
            <Th right>Saldo</Th>
            <Th>Währung</Th>
            <Th>Quelle</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const acct = acctMap.get(r.account_id)
            const neg  = r.balance < 0
            return (
              <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <Td>{fmtDate(r.snapshot_date, dateFormat)}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    {acct?.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
                    )}
                    {acct?.name ?? r.account_id}
                  </span>
                </Td>
                <Td dim>{acct?.type ?? '—'}</Td>
                <Td right mono red={neg}>
                  <span className={neg ? '' : 'font-medium'}>{fmtNum(r.balance, 2, locale)}</span>
                </Td>
                <Td dim>{r.currency}</Td>
                <Td dim>{r.source}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pagination tab="accounts" page={page} total={count} />
    </div>
  )
}

// ─── Tab: Portfolio ───────────────────────────────────────────────────────────
async function PortfolioTab({ supabase, uid, locale, dateFormat, page, from, to }: TabCtx) {
  const assetsAll = await getHistoryAssets(supabase, uid)

  const assetMap = new Map(assetsAll.map(a => [a.id, a]))
  const assetIds = assetsAll.map(a => a.id)

  const { rows: data, count } = await getPortfolioSnapshotHistoryPage(supabase, uid, assetIds, { from, to })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <Th>Datum</Th>
            <Th>Asset</Th>
            <Th>Symbol</Th>
            <Th>Typ</Th>
            <Th>Portfolio</Th>
            <Th right>Menge</Th>
            <Th right>Preis (€)</Th>
            <Th right>Wert (€)</Th>
            <Th>Quelle</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const asset = assetMap.get(r.asset_id)
            return (
              <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <Td>{fmtDate(r.snapshot_date, dateFormat)}</Td>
                <Td>{asset?.name ?? '—'}</Td>
                <Td dim>{asset?.symbol ?? '—'}</Td>
                <Td dim>{asset?.type ?? '—'}</Td>
                <Td dim>{r.portfolio_name ?? '—'}</Td>
                <Td right mono>{fmtNum(r.quantity, 6, locale)}</Td>
                <Td right mono dim>{fmtEur(r.price_eur, locale)}</Td>
                <Td right mono>
                  <span className="font-medium">{fmtEur(r.value_eur, locale)}</span>
                </Td>
                <Td dim>{r.source}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pagination tab="portfolio" page={page} total={count} />
    </div>
  )
}

// ─── Tab: Monthly ─────────────────────────────────────────────────────────────
// Aus `monthly_flow_totals` (live aus monthly_flows) statt der früheren Cron-Tabelle. Einnahmen und
// Ausgaben zählen alles, was zählt; Konsum, Anlage und Forderungen stehen getrennt daneben.
// Die Sparquote rechnet nur auf Konsum (siehe lib/finance/flow-calc).
async function MonthlyTab({ supabase, uid, locale, page, from, to }: TabCtx) {
  const { rows: data, count } = await getMonthlyTotalsPage(supabase, uid, { from, to })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <Th>Monat</Th>
            <Th right>Einnahmen</Th>
            <Th right>Ausgaben</Th>
            <Th right>Saldo</Th>
            <Th right>Konsum&nbsp;E.</Th>
            <Th right>Konsum&nbsp;A.</Th>
            <Th right>Sparquote</Th>
            <Th right>Anlage&nbsp;A.</Th>
            <Th right>Anlage&nbsp;E.</Th>
            <Th right>Forderung&nbsp;A.</Th>
            <Th right>Forderung&nbsp;E.</Th>
            <Th right>Buchungen</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => {
            const net = r.income - r.expense
            const pos = net >= 0
            const rate = r.echt_income > 0 ? Math.round(((r.echt_income - r.echt_expense) / r.echt_income) * 100) : null
            return (
              <tr key={r.month} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <Td>
                  <span className="font-medium">{r.month.slice(0, 7)}</span>
                </Td>
                <Td right mono>
                  <span className="text-success font-medium">{fmtEur(r.income, locale)}</span>
                </Td>
                <Td right mono>
                  <span className="text-danger">{fmtEur(r.expense, locale)}</span>
                </Td>
                <Td right mono>
                  <span className={pos ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                    {pos ? '+' : ''}{fmtEur(net, locale)}
                  </span>
                </Td>
                <Td right mono dim>{fmtEur(r.echt_income, locale)}</Td>
                <Td right mono dim>{fmtEur(r.echt_expense, locale)}</Td>
                <Td right mono dim>{rate === null ? '–' : `${rate} %`}</Td>
                <Td right mono dim>{fmtEur(r.anlage_expense, locale)}</Td>
                <Td right mono dim>{fmtEur(r.anlage_income, locale)}</Td>
                <Td right mono dim>{fmtEur(r.forderung_expense, locale)}</Td>
                <Td right mono dim>{fmtEur(r.forderung_income, locale)}</Td>
                <Td right mono dim>{r.tx_count}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pagination tab="monthly" page={page} total={count} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const { tab: rawTab, page: rawPage } = await searchParams
  const tab  = (TABS.includes(rawTab as Tab) ? rawTab : 'networth') as Tab
  const page = Math.max(0, parseInt(rawPage ?? '0', 10) || 0)
  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const { supabase, user } = await getAuthUser()
  const uid = user!.id

  const settings = await getSettings(uid)
  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  const ctx: TabCtx = { supabase, uid, locale, dateFormat, page, from, to }

  // ── Fetch data for active tab ──────────────────────────────────────────────
  let content: React.ReactNode = null
  if (tab === 'networth')  content = await NetworthTab(ctx)
  if (tab === 'accounts')  content = await AccountsTab(ctx)
  if (tab === 'portfolio') content = await PortfolioTab(ctx)
  if (tab === 'monthly')   content = await MonthlyTab(ctx)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historie</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Gespeicherte Snapshots und historische Daten
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => {
          const active = t === tab
          return (
            <Link
              key={t}
              href={`?tab=${t}`}
              className={[
                'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {TAB_LABELS[t]}
            </Link>
          )
        })}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {content}
      </div>

    </div>
  )
}
