import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtDate as fmtDateLib } from '@/lib/format'
import { PortfolioOverview } from '@/components/crypto/portfolio-overview'
import { RebalanceBanner } from '@/components/crypto/rebalance-banner'
import { PortfolioSwitcher, type PortfolioMeta } from '@/components/crypto/portfolio-switcher'
import { OpenPositionsCard } from '@/components/crypto/open-positions-card'
import {
  getCryptoAssetsWithPrice, getPortfolioSnapshots, getAssetAuditLog, hasExchangeKey, getUserSettingValue,
} from '@/lib/data/crypto'
import { getRebalancingTargets } from '@/app/(dashboard)/crypto/actions'
import { calculateRebalancing } from '@/lib/crypto/rebalancing'
import type { AssetWithPrice } from '@/lib/data/crypto'
import { getEurUsdRate } from '@/lib/crypto/coingecko'
import { History } from 'lucide-react'

export default async function CryptoPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  const [{ p: portfolioParam }, { supabase, user }] = await Promise.all([searchParams, requireAuthUser()])

  const oneYearAgo = (() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]
  })()

  const [
    allAssets,
    snapshots,
    auditLog,
    targets,
    settings,
    eurUsdRate,
    krakenConnected,
    lastSyncValue,
  ] = await Promise.all([
    getCryptoAssetsWithPrice(supabase, user!.id),
    getPortfolioSnapshots(supabase, user!.id, oneYearAgo),
    getAssetAuditLog(supabase, user!.id, 50),
    getRebalancingTargets(user!.id),
    getSettings(user!.id),
    getEurUsdRate(),
    // Check Kraken connection (no decryption needed)
    hasExchangeKey(supabase, user!.id, 'kraken'),
    getUserSettingValue(supabase, user!.id, 'kraken_last_sync'),
  ])

  const locale     = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string)   ?? 'dd.MM.yyyy'

  const lastSync = (lastSyncValue as string) ?? null

  // ── Build portfolio list ──────────────────────────────────────────────────
  // Kraken portfolio = assets with exchange='Kraken'
  const krakenAssets   = allAssets.filter(a => a.exchange?.toLowerCase() === 'kraken')
  const nonKrakenAssets = allAssets.filter(a => a.exchange?.toLowerCase() !== 'kraken')

  // Distinct portfolio names from non-Kraken assets
  const manualNames = [...new Set(
    nonKrakenAssets
      .map(a => a.portfolio_name)
      .filter((n): n is string => !!n)
  )]

  const portfolios: PortfolioMeta[] = [
    ...(krakenConnected ? [{ name: 'Kraken', isKraken: true, assetCount: krakenAssets.length }] : []),
    ...manualNames.map(name => ({
      name,
      assetCount: nonKrakenAssets.filter(a => a.portfolio_name === name).length,
    })),
  ]

  // If the URL names a portfolio that doesn't exist yet, add it as empty (user just created it)
  if (portfolioParam && !portfolios.some(p => p.name === portfolioParam)) {
    portfolios.push({ name: portfolioParam, assetCount: 0 })
  }

  // Determine active portfolio
  const activePortfolio = portfolioParam ?? portfolios[0]?.name ?? null

  // ── Filter assets + snapshots for active portfolio ────────────────────────
  const assets: AssetWithPrice[] = activePortfolio
    ? activePortfolio === 'Kraken'
      ? krakenAssets
      : nonKrakenAssets.filter(a => a.portfolio_name === activePortfolio)
    : allAssets

  const filteredSnapshots = activePortfolio
    ? snapshots.filter(s => s.portfolio_name === activePortfolio)
    : snapshots

  // ── Rebalancing ───────────────────────────────────────────────────────────
  const totalValue       = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const rebalancingResult = calculateRebalancing(targets, assets, totalValue)

  return (
    <>
      <PortfolioSwitcher
        portfolios={portfolios}
        activePortfolio={activePortfolio ?? ''}
        krakenConnected={krakenConnected}
        lastSync={lastSync}
      />
      {targets.length > 0 && rebalancingResult.rebalancing_volume > 1 && (
        <RebalanceBanner volumeEur={rebalancingResult.rebalancing_volume} />
      )}
      <PortfolioOverview
        initialAssets={assets}
        snapshots={filteredSnapshots}
        rebalancingRows={rebalancingResult.rows}
        eurUsdRate={eurUsdRate}
        activePortfolio={activePortfolio ?? undefined}
      />
      {activePortfolio === 'Kraken' && <OpenPositionsCard />}
      <AssetAuditLog entries={auditLog as unknown as AuditEntry[]} locale={locale} dateFormat={dateFormat} />
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
  created: { label: 'Erstellt',  cls: 'bg-success/10 text-success' },
  updated: { label: 'Geändert',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  deleted: { label: 'Gelöscht',  cls: 'bg-danger/10 text-danger' },
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
                const cfg    = ACTION_LABEL[e.action] ?? { label: e.action, cls: 'bg-muted text-muted-foreground' }
                const isLast = i === entries.length - 1

                const changeLines: string[] = []
                if (e.changes) {
                  if (e.action === 'updated') {
                    for (const [field, diff] of Object.entries(e.changes)) {
                      const d = diff as { from: unknown; to: unknown }
                      changeLines.push(`${FIELD_LABEL[field] ?? field}: ${fmtVal(d.from, locale)} → ${fmtVal(d.to, locale)}`)
                    }
                  } else {
                    for (const [field, val] of Object.entries(e.changes)) {
                      if (val !== null && val !== undefined) {
                        changeLines.push(`${FIELD_LABEL[field] ?? field}: ${fmtVal(val, locale)}`)
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
                        <ul className="space-y-0.5">{changeLines.map((l, j) => <li key={j}>{l}</li>)}</ul>
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
