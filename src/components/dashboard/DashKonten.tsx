import Link from 'next/link'
import { fmtCurrency } from '@/lib/format'
import { kontotypLabel } from '@/lib/dashboard/anlagen'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'

/**
 * Konten als vertikale Listen-Karte unter der Monatskarte: sie fuellt die Restspalte
 * (`h-full flex flex-col`), die Zeilenliste scrollt intern (`flex-1 min-h-0 overflow-y-auto`),
 * wenn mehr Konten da sind als Platz ist. Jede Zeile (44 px) verlinkt auf das Konto; Konten ohne
 * jede Buchung zeigen "—" statt 0 EUR, negative Salden sind rot. Die Summenzeile am Ende ist die
 * Summe der angezeigten Salden (Konten ohne Buchung zaehlen 0).
 * Die Salden selbst kommen unveraendert aus dem Kern.
 */
export function DashKonten({ kern }: DashAbschnittProps) {
  const { konten, locale } = kern
  const euro = (n: number, waehrung = 'EUR') => fmtCurrency(n, waehrung, locale, { fractionDigits: 2 })
  const summe = konten.reduce((s, k) => s + (k.hatBuchungen ? k.saldo : 0), 0)

  return (
    <section aria-label="Konten" className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Konten
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">({konten.length})</span>
        </h2>
        <Link
          href="/finance/accounts"
          className="-my-2 flex min-h-10 items-center rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Alle
        </Link>
      </div>

      {konten.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground/70">Noch keine Konten</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
          {konten.map(k => {
            const imMinus = k.hatBuchungen && k.saldo < 0
            return (
              <li key={k.id}>
                <Link
                  href={`/finance/accounts/${k.id}`}
                  className="flex h-11 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                    style={k.color ? { backgroundColor: k.color } : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {k.name}
                    <span className="ml-1.5 text-[11px] text-muted-foreground/70">{kontotypLabel(k.type)}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${imMinus ? 'text-danger' : ''}`}>
                    {k.hatBuchungen ? euro(k.saldo, k.currency) : '—'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {konten.length > 0 && (
        <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Summe</span>
          <span className={`font-mono font-semibold tabular-nums ${summe < 0 ? 'text-danger' : ''}`}>{euro(summe)}</span>
        </div>
      )}
    </section>
  )
}
