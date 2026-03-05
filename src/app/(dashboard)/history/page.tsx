import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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
function fmtEur(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

function fmtNum(n: number | null | undefined, decimals = 4): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0, maximumFractionDigits: decimals,
  }).format(n)
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
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
      red   ? 'text-red-600 dark:text-red-400' : '',
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  // ── Fetch data for active tab ──────────────────────────────────────────────
  let content: React.ReactNode = null

  if (tab === 'networth') {
    const [{ data, count }] = await Promise.all([
      supabase
        .from('net_worth_snapshots')
        .select('*', { count: 'exact' })
        .eq('user_id', uid)
        .order('snapshot_date', { ascending: false })
        .range(from, to),
    ])

    content = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Datum</Th>
              <Th right>Net Worth</Th>
              <Th right>Assets</Th>
              <Th right>Girokonto</Th>
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
            {(data ?? []).map((r, i) => (
              <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                <Td>{fmtDate(r.snapshot_date)}</Td>
                <Td right mono>
                  <span className="font-semibold">{fmtEur(r.net_worth)}</span>
                </Td>
                <Td right mono>{fmtEur(r.total_assets)}</Td>
                <Td right mono dim>{fmtEur(r.total_checking)}</Td>
                <Td right mono dim>{fmtEur(r.total_savings)}</Td>
                <Td right mono dim>{fmtEur(r.total_cash)}</Td>
                <Td right mono dim>{fmtEur(r.total_depot)}</Td>
                <Td right mono dim>{fmtEur(r.total_crypto)}</Td>
                <Td right mono dim>{fmtEur(r.total_bausparer)}</Td>
                <Td right mono dim>{fmtEur(r.total_business)}</Td>
                <Td right mono red>{fmtEur(r.total_debts)}</Td>
                <Td dim>{r.source}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination tab={tab} page={page} total={count ?? 0} />
      </div>
    )
  }

  if (tab === 'accounts') {
    // Get user's accounts first, then filter balances
    const { data: accts } = await supabase
      .from('accounts')
      .select('id, name, type, color')
      .eq('user_id', uid)

    const acctIds  = (accts ?? []).map(a => a.id)
    const acctMap  = new Map((accts ?? []).map(a => [a.id, a]))

    const { data, count } = await supabase
      .from('account_balances')
      .select('*', { count: 'exact' })
      .in('account_id', acctIds.length ? acctIds : ['__none__'])
      .order('snapshot_date', { ascending: false })
      .order('account_id')
      .range(from, to)

    content = (
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
            {(data ?? []).map((r, i) => {
              const acct = acctMap.get(r.account_id)
              const neg  = r.balance < 0
              return (
                <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                  <Td>{fmtDate(r.snapshot_date)}</Td>
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
                    <span className={neg ? '' : 'font-medium'}>{fmtNum(r.balance, 2)}</span>
                  </Td>
                  <Td dim>{r.currency}</Td>
                  <Td dim>{r.source}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination tab={tab} page={page} total={count ?? 0} />
      </div>
    )
  }

  if (tab === 'portfolio') {
    const { data: assetsAll } = await supabase
      .from('assets')
      .select('id, name, symbol, type')
      .eq('user_id', uid)

    const assetMap = new Map((assetsAll ?? []).map(a => [a.id, a]))
    const assetIds = (assetsAll ?? []).map(a => a.id)

    const { data, count } = await supabase
      .from('portfolio_snapshots')
      .select('*', { count: 'exact' })
      .eq('user_id', uid)
      .in('asset_id', assetIds.length ? assetIds : ['__none__'])
      .order('snapshot_date', { ascending: false })
      .order('asset_id')
      .range(from, to)

    content = (
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
            {(data ?? []).map((r, i) => {
              const asset = assetMap.get(r.asset_id)
              return (
                <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                  <Td>{fmtDate(r.snapshot_date)}</Td>
                  <Td>{asset?.name ?? '—'}</Td>
                  <Td dim>{asset?.symbol ?? '—'}</Td>
                  <Td dim>{asset?.type ?? '—'}</Td>
                  <Td dim>{r.portfolio_name ?? '—'}</Td>
                  <Td right mono>{fmtNum(r.quantity, 6)}</Td>
                  <Td right mono dim>{fmtEur(r.price_eur)}</Td>
                  <Td right mono>
                    <span className="font-medium">{fmtEur(r.value_eur)}</span>
                  </Td>
                  <Td dim>{r.source}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination tab={tab} page={page} total={count ?? 0} />
      </div>
    )
  }

  if (tab === 'monthly') {
    const { data, count } = await supabase
      .from('monthly_finance_summary')
      .select('*', { count: 'exact' })
      .eq('user_id', uid)
      .order('month', { ascending: false })
      .range(from, to)

    content = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th>Monat</Th>
              <Th right>Einnahmen</Th>
              <Th right>Ausgaben</Th>
              <Th right>Bilanz</Th>
              <Th right>Gehalt</Th>
              <Th right>Lebensmittel</Th>
              <Th right>Freizeit</Th>
              <Th right>Abos</Th>
              <Th right>Sparen</Th>
              <Th right>Taschengeld</Th>
              <Th right>Sonstige&nbsp;E.</Th>
              <Th right>Sonstige&nbsp;A.</Th>
              <Th>Quelle</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r, i) => {
              const pos = r.net_balance >= 0
              return (
                <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/20 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                  <Td>
                    <span className="font-medium">{r.month}</span>
                  </Td>
                  <Td right mono>
                    <span className="text-green-600 dark:text-green-400 font-medium">{fmtEur(r.total_income)}</span>
                  </Td>
                  <Td right mono>
                    <span className="text-red-600 dark:text-red-400">{fmtEur(r.total_expenses)}</span>
                  </Td>
                  <Td right mono>
                    <span className={pos ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                      {pos ? '+' : ''}{fmtEur(r.net_balance)}
                    </span>
                  </Td>
                  <Td right mono dim>{fmtEur(r.salary)}</Td>
                  <Td right mono dim>{fmtEur(r.food)}</Td>
                  <Td right mono dim>{fmtEur(r.leisure)}</Td>
                  <Td right mono dim>{fmtEur(r.subscriptions)}</Td>
                  <Td right mono dim>{fmtEur(r.savings_transfer)}</Td>
                  <Td right mono dim>{fmtEur(r.pocket_money)}</Td>
                  <Td right mono dim>{fmtEur(r.other_income)}</Td>
                  <Td right mono dim>{fmtEur(r.other_expenses)}</Td>
                  <Td dim>{r.source}</Td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination tab={tab} page={page} total={count ?? 0} />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-6 max-w-[1400px]">

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
