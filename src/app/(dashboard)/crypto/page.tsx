import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtDate as fmtDateLib } from '@/lib/format'
import { PortfolioOverview, type AssetWithPrice } from '@/components/crypto/portfolio-overview'
import { getStrategySignals, getPortfolioAllocations } from '@/app/(dashboard)/crypto/actions'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'
import { History } from 'lucide-react'

export default async function CryptoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: rawAssets },
    { data: snapshots },
    { data: auditLog },
    signals,
    allocations,
    settings,
  ] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .in('type', ['crypto', 'stable', 'fiat'])
      .eq('user_id', user!.id)
      .order('name'),
    supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, portfolio_name, value_eur')
      .eq('user_id', user!.id)
      .gte('snapshot_date', (() => {
        const d = new Date()
        d.setFullYear(d.getFullYear() - 1)
        return d.toISOString().split('T')[0]
      })())
      .order('snapshot_date'),
    supabase
      .from('asset_audit_log')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    getStrategySignals(user!.id),
    getPortfolioAllocations(user!.id),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  const assetIds = (rawAssets ?? []).map(a => a.id)

  const { data: rawValuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('*')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] }

  // Latest valuation per asset (first match wins due to ordering)
  const latestMap = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
  for (const v of rawValuations ?? []) {
    if (!latestMap.has(v.asset_id)) {
      latestMap.set(v.asset_id, {
        price_per_unit: v.price_per_unit,
        total_value:    v.total_value,
        valuation_date: v.valuation_date,
      })
    }
  }

  const assets: AssetWithPrice[] = (rawAssets ?? []).map(a => {
    const val = latestMap.get(a.id)
    return {
      ...a,
      current_price: val?.price_per_unit ?? null,
      current_value: val?.total_value    ?? null,
      last_updated:  val?.valuation_date ?? null,
    }
  })

  const totalValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)

  const rebalancingResult = calculateRebalancing(signals, allocations, assets, totalValue)

  return (
    <>
      <PortfolioOverview
        initialAssets={assets}
        snapshots={snapshots ?? []}
        rebalancingRows={rebalancingResult.rows}
      />
      <AssetAuditLog entries={auditLog ?? []} locale={locale} dateFormat={dateFormat} />
    </>
  )
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
type AuditEntry = {
  id: string
  asset_name: string
  asset_symbol: string
  action: string
  changes: Record<string, { from: unknown; to: unknown }> | Record<string, unknown> | null
  created_at: string
}

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  created: { label: 'Erstellt',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  updated: { label: 'Geändert',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  deleted: { label: 'Gelöscht',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

const FIELD_LABEL: Record<string, string> = {
  quantity:      'Menge',
  avg_buy_price: 'Ø Kaufpreis',
  portfolio_name:'Portfolio',
  exchange:      'Exchange',
  name:          'Name',
  notes:         'Notizen',
}

function fmtVal(val: unknown, locale: string): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') return val.toLocaleString(locale, { maximumFractionDigits: 8 })
  return String(val)
}

function fmtTs(iso: string, dateFormat: string): string {
  return fmtDateLib(iso, dateFormat) + ' ' + new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function AssetAuditLog({ entries, locale, dateFormat }: { entries: AuditEntry[]; locale: string; dateFormat: string }) {
  if (entries.length === 0) return null

  return (
    <div className="px-4 sm:px-8 pb-8">
      <div className="flex items-center gap-2 mb-3">
        <History className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Änderungsprotokoll</h2>
        <span className="text-xs text-muted-foreground">(letzte {entries.length} Einträge)</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Datum</th>
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Aktion</th>
                <th className="px-4 py-2.5 font-medium">Änderungen</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const cfg = ACTION_LABEL[e.action] ?? { label: e.action, cls: 'bg-muted text-muted-foreground' }
                const isLast = i === entries.length - 1

                // For 'updated': changes is { field: { from, to } }
                // For 'created'/'deleted': changes is flat { field: value }
                const changeLines: string[] = []
                if (e.changes) {
                  if (e.action === 'updated') {
                    for (const [field, diff] of Object.entries(e.changes)) {
                      const d = diff as { from: unknown; to: unknown }
                      const label = FIELD_LABEL[field] ?? field
                      changeLines.push(`${label}: ${fmtVal(d.from, locale)} → ${fmtVal(d.to, locale)}`)
                    }
                  } else {
                    for (const [field, val] of Object.entries(e.changes)) {
                      if (val !== null && val !== undefined) {
                        const label = FIELD_LABEL[field] ?? field
                        changeLines.push(`${label}: ${fmtVal(val, locale)}`)
                      }
                    }
                  }
                }

                return (
                  <tr key={e.id} className={`hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtTs(e.created_at, dateFormat)}</td>
                    <td className="px-4 py-2.5 font-medium">{e.asset_name}
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal uppercase">{e.asset_symbol}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {changeLines.length === 0 ? '—' : (
                        <ul className="space-y-0.5">
                          {changeLines.map((l, j) => <li key={j}>{l}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
