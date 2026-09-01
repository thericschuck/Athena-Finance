'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import {
  getKrakenOpenPositions,
  type OpenPositionView,
  type OpenPositionsMeta,
} from '@/app/(dashboard)/crypto/actions'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

// Kraken keeps margin/leveraged positions entirely separate from spot Balance, and Kraken
// Futures positions are separate again (own product, own API key) — they're fetched live here
// (like the EUR/USD rate elsewhere), not synced into `assets`, since a position's
// side/margin/unrealized-P&L shape doesn't fit the plain quantity+avg-price model spot
// holdings use. See `getKrakenOpenPositions()` in crypto/actions.ts.

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; positions: OpenPositionView[]; meta: OpenPositionsMeta }

export function OpenPositionsCard() {
  const { locale } = useSettings()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getKrakenOpenPositions()
      .then(result => {
        if (cancelled) return
        if ('error' in result) {
          setState({ status: 'error', message: result.error })
        } else {
          setState({ status: 'ready', positions: result.positions, meta: result.meta })
          for (const warning of result.warnings) toast.warning(warning)
        }
      })
      // Without this, a thrown (not returned) error from the server action would leave the
      // card in `loading` forever — it just silently disappears instead of showing what went
      // wrong, which reads as "nothing to see" rather than "something broke".
      .catch((e: Error) => {
        if (!cancelled) setState({ status: 'error', message: e.message })
      })
    return () => { cancelled = true }
  }, [])

  if (state.status === 'loading') {
    return (
      <Shell>
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Gehebelte Positionen werden von Kraken abgerufen…
        </p>
      </Shell>
    )
  }

  if (state.status === 'error') {
    return (
      <Shell>
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Gehebelte Positionen konnten nicht geladen werden: {state.message}
        </p>
      </Shell>
    )
  }

  const { positions, meta } = state

  // „Keine Positionen" und „nicht abgefragt" sind zwei verschiedene Aussagen. Vorher stand
  // hier in beiden Fällen dieselbe Entwarnung — bei fehlendem Futures-Schlüssel las sich das
  // als „du hast nichts offen", obwohl schlicht niemand nachgesehen hat.
  const notChecked: string[] = []
  if (!meta.spotChecked)    notChecked.push('Spot-Margin')
  if (!meta.futuresChecked) notChecked.push('Futures')

  if (positions.length === 0) {
    return (
      <Shell>
        <div className="px-4 py-6 space-y-2">
          {(meta.spotChecked || meta.futuresChecked) && (
            <p className="text-sm text-muted-foreground">
              Keine offenen gehebelten Positionen
              {meta.spotChecked && meta.futuresChecked
                ? ' (Spot-Margin und Futures geprüft).'
                : ` (${meta.spotChecked ? 'Spot-Margin' : 'Futures'} geprüft).`}
            </p>
          )}
          {notChecked.length > 0 && <NotCheckedHint markets={notChecked} />}
        </div>
      </Shell>
    )
  }

  const fmtEur = (n: number | null) => (n != null ? fmtCurrency(n, 'EUR', locale) : '—')
  const fmtQty = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 8 })

  const totalPnl = positions.reduce<number | null>((acc, p) => {
    if (p.netPnlEur == null) return acc
    return (acc ?? 0) + p.netPnlEur
  }, null)

  return (
    <Shell totalPnl={totalPnl} locale={locale}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="text-left  px-4 py-2.5 font-medium">Paar</th>
              <th className="text-left  px-4 py-2.5 font-medium">Markt</th>
              <th className="text-left  px-4 py-2.5 font-medium">Seite</th>
              <th className="text-right px-4 py-2.5 font-medium">Hebel</th>
              <th className="text-right px-4 py-2.5 font-medium">Menge</th>
              <th className="text-right px-4 py-2.5 font-medium">Einstieg</th>
              <th className="text-right px-4 py-2.5 font-medium">Margin</th>
              <th className="text-right px-4 py-2.5 font-medium">Einstand</th>
              <th className="text-right px-4 py-2.5 font-medium">Wert</th>
              <th className="text-right px-4 py-2.5 font-medium">Gebühren</th>
              <th className="text-right px-4 py-2.5 font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              // Verlust gemessen an der eingesetzten Margin — das ist die Zahl, die über eine
              // Liquidation entscheidet, nicht die Rendite auf den Positionswert.
              const marginPct =
                p.netPnlEur != null && p.marginEur != null && p.marginEur > 0
                  ? (p.netPnlEur / p.marginEur) * 100
                  : null
              const atRisk = marginPct != null && marginPct <= -50

              return (
                <tr key={`${p.source}-${p.pair}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium">
                    {p.pair}
                    {p.openedAt && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        seit {new Date(p.openedAt).toLocaleDateString(locale)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.source === 'futures' ? 'Futures' : 'Spot-Margin'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.side === 'long' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    }`}>
                      {p.side === 'long' ? 'Long' : 'Short'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.leverage != null ? (
                      <span className={`font-medium ${p.leverage >= 5 ? 'text-danger' : ''}`}>
                        {p.leverage.toFixed(1).replace('.', ',')}×
                      </span>
                    ) : (
                      <span
                        className="text-muted-foreground"
                        title="Kraken Futures rechnet Margin auf Kontoebene (Cross Margin) — zu einer einzelnen Position gibt es dort keinen Hebelfaktor."
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums">{fmtQty(p.volume)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmtEur(p.entryPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmtEur(p.marginEur)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmtEur(p.costEur)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtEur(p.valueEur)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{fmtEur(p.feeEur)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${
                    p.netPnlEur == null ? '' : p.netPnlEur >= 0 ? 'text-success' : 'text-danger'
                  }`}>
                    {p.netPnlEur != null ? (
                      <>
                        {p.netPnlEur >= 0 ? '+' : ''}{fmtEur(p.netPnlEur)}
                        {marginPct != null && (
                          <span className="block text-xs font-normal opacity-80">
                            {marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1).replace('.', ',')} % der Margin
                            {atRisk && <AlertTriangle className="inline size-3 ml-1 align-[-2px]" />}
                          </span>
                        )}
                      </>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {notChecked.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <NotCheckedHint markets={notChecked} />
        </div>
      )}
    </Shell>
  )
}

function NotCheckedHint({ markets }: { markets: string[] }) {
  return (
    <p className="text-xs text-muted-foreground">
      {markets.join(' und ')} {markets.length > 1 ? 'wurden' : 'wurde'} nicht abgefragt — kein
      API-Schlüssel hinterlegt.{' '}
      <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
        In den Einstellungen verbinden
      </Link>
      {markets.includes('Futures') && ' (Futures braucht einen eigenen, auf futures.kraken.com erzeugten Schlüssel).'}
    </p>
  )
}

function Shell({
  children, totalPnl, locale,
}: {
  children: React.ReactNode
  totalPnl?: number | null
  locale?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Gehebelte Positionen (Kraken)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live von Kraken abgerufen — nicht Teil der Spot-Bestände oben
          </p>
        </div>
        {totalPnl != null && locale && (
          <span className={`text-sm font-medium tabular-nums ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
            {totalPnl >= 0 ? '+' : ''}{fmtCurrency(totalPnl, 'EUR', locale)} unrealisiert
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
