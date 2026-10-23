import { fmtCurrency } from '@/lib/format'
import type { AssetKennzahl } from '@/lib/verlauf/portfolio'

/**
 * Eine Karte je Asset: Wert, Anteil am Portfolio und die Entwicklung im Zeitraum — getrennt
 * in Kurs (echte Performance) und Menge (Zukauf/Verkauf). Rechenweg und Begruendung stehen
 * bei assetKennzahlen in lib/verlauf/portfolio.ts.
 */

const vorzeichen = (n: number) => (n >= 0 ? '+' : '−')

export function PortfolioKarten({
  kennzahlen, namen, locale,
}: {
  kennzahlen: AssetKennzahl[]
  namen: Map<string, { name: string; symbol: string | null }>
  locale: string
}) {
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const menge = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })

  if (kennzahlen.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {kennzahlen.map(k => {
        const a = namen.get(k.assetId)
        const kursPos = k.kursEur >= 0
        const mengeAenderung = k.mengeEnde - k.mengeStart
        return (
          <div key={k.assetId} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-medium">
                {a?.name ?? '—'}
                {a?.symbol && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.symbol}</span>}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{k.anteil.toFixed(1)} %</span>
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{euro(k.wert)}</p>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[var(--chart-accent)]" style={{ width: `${Math.min(100, k.anteil)}%` }} />
            </div>

            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Kurs im Zeitraum</dt>
                <dd className={`tabular-nums font-medium ${kursPos ? 'text-success' : 'text-danger'}`}>
                  {vorzeichen(k.kursEur)}{euro(Math.abs(k.kursEur))}
                  {k.kursProzent !== null && ` (${vorzeichen(k.kursProzent)}${Math.abs(k.kursProzent).toFixed(1)} %)`}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Menge</dt>
                <dd className="tabular-nums text-muted-foreground">
                  {Math.abs(mengeAenderung) < 1e-9
                    ? 'unverändert'
                    : `${vorzeichen(mengeAenderung)}${menge.format(Math.abs(mengeAenderung))} (${vorzeichen(k.mengeEur)}${euro(Math.abs(k.mengeEur))})`}
                </dd>
              </div>
            </dl>
          </div>
        )
      })}
    </div>
  )
}
