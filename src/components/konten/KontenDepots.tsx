import Link from 'next/link'
import { fmtCurrency } from '@/lib/format'
import type { DepotWithSummary } from '@/app/actions/depot'

/** Depots als kompakte Zeilen im selben Rahmen-Stil wie die Konten-Gruppen. Server-Komponente. */
export function KontenDepots({ depots, locale }: { depots: DepotWithSummary[]; locale: string }) {
  if (depots.length === 0) return null
  return (
    <section aria-label="Depots">
      <h2 className="mb-1.5 px-1 text-sm font-semibold">
        Depots
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{depots.length}</span>
      </h2>
      <ul className="rounded-lg border border-border bg-card">
        {depots.map((d, i) => (
          <li key={d.id} className="border-t border-border first:border-t-0">
            <Link
              href="/depot"
              className={`flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/30 ${i === 0 ? 'rounded-t-lg' : ''} ${i === depots.length - 1 ? 'rounded-b-lg' : ''}`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--chart-cat-1)' }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{d.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{d.isin}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums">
                  {d.depotValue !== null ? fmtCurrency(d.depotValue, 'EUR', locale, { fractionDigits: 2 }) : '–'}
                </span>
                {d.returnPct !== null && (
                  <span className={`block text-xs tabular-nums ${d.returnPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    {d.returnPct >= 0 ? '+' : '−'}{Math.abs(d.returnPct).toFixed(2)} %
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
