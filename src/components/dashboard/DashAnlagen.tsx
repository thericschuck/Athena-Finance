import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { fmtCurrency, fmtNumber } from '@/lib/format'
import { kryptoErgebnis, prozentText, tonFuer, zeigeRebalancing, type Ton } from '@/lib/dashboard/anlagen'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DASH_KARTE, DashKartenReihe } from './DashKontoReihe'

const TON_KLASSE: Record<Ton, string> = {
  gut: 'text-success',
  schlecht: 'text-danger',
  neutral: 'text-muted-foreground',
}

/**
 * Anlagen als EINE Reihe kompakter Karten: je Depot, Krypto und (falls vorhanden) das Inventar.
 * Gleiche Karte und gleiches Scroll-Verhalten wie die Kontenreihe (DashKontoReihe).
 *
 * Krypto: Gewinn/Verlust in Prozent gegen die Kosten (kern.krypto.kosten). Der Rebalancing-Hinweis
 * ist ein Chip (wie der fruehere Alert, nur klein) und ein EIGENER Link neben dem Kartenlink,
 * weil ein <a> in einem <a> ungueltiges HTML waere.
 * Inventar: Sammlungswert ist geschaetzt und NICHT Teil des Net Worth — steht deshalb so auf der Karte.
 */
export function DashAnlagen({ kern }: DashAbschnittProps) {
  const { locale } = kern
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const k = kern.krypto
  const hatKrypto = k.gesamt > 0 || k.topAssets.length > 0
  const hatInventar = kern.inventar.stueck > 0
  const anzahl = kern.depots.length + (hatKrypto ? 1 : 0) + (hatInventar ? 1 : 0)
  if (anzahl === 0) return null

  const kErgebnis = kryptoErgebnis(k.gesamt, k.kosten)
  const top = k.topAssets[0]
  const rebalancing = zeigeRebalancing(k.rebalancingVolumen)

  return (
    <DashKartenReihe titel="Anlagen" zaehler={`(${anzahl})`} linkHref="/depot" linkText="Zum Depot">
      {kern.depots.map(d => {
        const ton = d.returnPct === null ? 'neutral' : tonFuer(d.returnPct)
        return (
          <Link key={d.id} href="/depot" className={DASH_KARTE}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-muted-foreground">{d.name}</span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-base font-semibold tabular-nums">
                  {d.depotValue === null ? '—' : euro(d.depotValue)}
                </span>
                {d.returnPct !== null && (
                  <span className={`shrink-0 text-xs font-medium tabular-nums ${TON_KLASSE[ton]}`}>
                    {prozentText(d.returnPct, locale)}
                  </span>
                )}
              </span>
              <span className="block truncate text-[10px] tabular-nums text-muted-foreground">
                {fmtNumber(d.totalShares, locale, 2)} Anteile
              </span>
            </span>
          </Link>
        )
      })}

      {hatKrypto && (
        <div className={`${DASH_KARTE} relative px-0!`}>
          <Link
            href="/crypto"
            className="flex h-full min-w-0 flex-1 items-center rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-muted-foreground">Krypto</span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-base font-semibold tabular-nums">{euro(k.gesamt)}</span>
                {kErgebnis && (
                  <span
                    className={`shrink-0 text-xs font-medium tabular-nums ${TON_KLASSE[tonFuer(kErgebnis.prozent)]}`}
                    title={`${kErgebnis.betrag >= 0 ? '+' : '−'}${euro(Math.abs(kErgebnis.betrag))} gegenüber den Kosten`}
                  >
                    {prozentText(kErgebnis.prozent, locale)}
                  </span>
                )}
              </span>
              <span className="block truncate pr-24 text-[10px] tabular-nums text-muted-foreground">
                {top ? `${top.symbol.toUpperCase()} ${top.pct.toFixed(0)} %` : ' '}
              </span>
            </span>
          </Link>
          {rebalancing && (
            <Link
              href="/crypto/rebalancing"
              title="Portfolio weicht von der Zielverteilung ab"
              className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-warning before:absolute before:-inset-2 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Rebalancing ≈ {euro(k.rebalancingVolumen)}</span>
            </Link>
          )}
        </div>
      )}

      {hatInventar && (
        <Link href="/inventar" className={DASH_KARTE}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium text-muted-foreground">
              Inventar · {kern.inventar.stueck} Stück
            </span>
            <span className="block truncate font-mono text-base font-semibold tabular-nums">{euro(kern.inventar.wert)}</span>
            <span className="block truncate text-[10px] text-muted-foreground">geschätzt, nicht im Net Worth</span>
          </span>
        </Link>
      )}
    </DashKartenReihe>
  )
}
