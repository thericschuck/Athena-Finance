import Link from 'next/link'
import { Target } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'

/** Mehr als so viele Ziele zeigt die Karte nicht; der Rest steht hinter "Alle ansehen". */
const MAX_SICHTBAR = 4

/**
 * Sparziele als schlanke Liste: je Ziel eine 56-px-Zeile (Beschreibung, Balken, "x von y" und
 * "noch z"). Erreichte Ziele haben einen gruenen Balken. Die Kopfzeile folgt der Typografie der
 * anderen Dashboard-Karten (text-sm semibold, Zaehler text-xs gedimmt). Der Leerzustand hat die
 * Hoehe der Fixkosten-Karte daneben (~220 px), damit das Raster nicht springt.
 * Die Betraege kommen unveraendert aus dem Kern.
 */
export function DashSparziele({ kern }: DashAbschnittProps) {
  const { sparziele, locale } = kern
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const sichtbar = sparziele.slice(0, MAX_SICHTBAR)
  const rest = sparziele.length - sichtbar.length

  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Sparziele
          {sparziele.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">({sparziele.length} aktiv)</span>
          )}
        </h2>
        <Link
          href="/finance/goals"
          className="-my-2 flex min-h-10 items-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {rest > 0 ? `Alle ansehen (+${rest})` : 'Alle'}
        </Link>
      </div>

      {sichtbar.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground/70">
          <Target className="size-6" aria-hidden />
          <p className="text-sm">Noch keine Sparziele</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sichtbar.map(z => {
            const erreicht = z.target > 0 && z.current >= z.target
            const prozent = z.target > 0 ? Math.min(100, Math.max(0, (z.current / z.target) * 100)) : 0
            const offen = Math.max(0, z.target - z.current)
            return (
              <li key={z.id}>
                <Link
                  href="/finance/goals"
                  className="flex h-14 flex-col justify-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate text-sm">{z.description}</span>
                  <span
                    role="progressbar"
                    aria-valuenow={Math.round(prozent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${z.description}: ${Math.round(prozent)} Prozent`}
                    className="block h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={`block h-full rounded-full ${erreicht ? 'bg-success' : 'bg-primary'}`}
                      style={{ width: `${prozent}%` }}
                    />
                  </span>
                  <span className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span className="truncate">{euro(z.current)} von {euro(z.target)}</span>
                    <span className={`shrink-0 ${erreicht ? 'font-medium text-success' : ''}`}>
                      {erreicht ? 'erreicht' : `noch ${euro(offen)}`}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
