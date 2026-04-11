'use client'

import Link from 'next/link'
import { useKrakenPortfolio } from '@/lib/hooks/use-kraken-portfolio'
import { Button } from '@/components/ui/button'
import { AlertCircle, KeyRound, Loader2, RefreshCw } from 'lucide-react'

/** Maps Kraken's internal asset codes to readable symbols */
const ASSET_LABELS: Record<string, string> = {
  XXBT:   'BTC',
  XETH:   'ETH',
  XXRP:   'XRP',
  XXLM:   'XLM',
  XLTC:   'LTC',
  XDOGE:  'DOGE',
  ZUSD:   'USD',
  ZEUR:   'EUR',
  ZGBP:   'GBP',
  ZCAD:   'CAD',
  SOL:    'SOL',
  ADA:    'ADA',
  DOT:    'DOT',
  MATIC:  'MATIC',
  LINK:   'LINK',
  ATOM:   'ATOM',
  AVAX:   'AVAX',
  UNI:    'UNI',
  USDT:   'USDT',
  USDC:   'USDC',
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount)
  if (n >= 1000)   return n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  if (n >= 1)      return n.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return n.toLocaleString('de-DE', { maximumFractionDigits: 8 })
}

function displayAsset(raw: string): string {
  return ASSET_LABELS[raw] ?? raw
}

export function KrakenBalances() {
  const { connected, balances, loading, error, refetch } = useKrakenPortfolio()

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Kraken-Salden werden geladen…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-2.5 text-sm">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Kraken-Fehler</p>
            <p className="text-muted-foreground mt-0.5">{error}</p>
            <button
              onClick={refetch}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-md bg-muted flex items-center justify-center shrink-0">
              <KeyRound className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Kraken nicht verbunden</p>
              <p className="text-xs text-muted-foreground">
                Verbinde dein Konto, um Börsen-Salden hier anzuzeigen.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings">Jetzt verbinden</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
            <KeyRound className="size-3.5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold">Kraken — Börsen-Salden</h3>
        </div>
        <button
          onClick={refetch}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Aktualisieren"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Balances table */}
      {balances.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground text-center">
          Keine Salden gefunden.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {balances.map(({ asset, amount }) => (
            <div key={asset} className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="flex items-center gap-2.5">
                <div className="size-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground leading-none">
                    {displayAsset(asset).slice(0, 1)}
                  </span>
                </div>
                <span className="font-medium">{displayAsset(asset)}</span>
              </div>
              <span className="tabular-nums text-muted-foreground">
                {formatAmount(amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
