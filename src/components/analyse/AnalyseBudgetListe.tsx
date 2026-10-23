'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import { fmtCurrency } from '@/lib/format'
import { statusFarbe, type BudgetZeile } from '@/lib/analyse/budget'

/**
 * Kleine Client-Insel: die Kategorie-Balken sind Buttons, die den URL-Filter `kat` setzen und zur
 * Buchungsliste scrollen. Alles andere am Abschnitt bleibt Server-Komponente. Karten statt Tabelle,
 * Balken volle Breite, jede Karte mindestens 44 px hoch (Tap-Ziel).
 */

export function AnalyseBudgetListe({ zeilen, locale }: { zeilen: BudgetZeile[]; locale: string }) {
  const filters = useUrlFilters()
  const aktiv = filters.get('kat')
  const eur = (n: number) => fmtCurrency(n, 'EUR', locale)

  function waehlen(kategorieId: string | null) {
    if (!kategorieId) return
    if (aktiv === kategorieId) {
      filters.set('kat', null)
      return
    }
    filters.set('kat', kategorieId)
    // Erst nach dem Rendern: die Buchungsliste ist dann (optimistisch) schon gefiltert.
    requestAnimationFrame(() => document.getElementById('buchungen')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <ul className="space-y-2">
      {zeilen.map(z => {
        const farbe = statusFarbe(z.status)
        const breite = z.auslastung == null ? (z.ist > 0 ? 100 : 0) : Math.min(z.auslastung, 1) * 100
        const ueber = z.rest < 0
        const gewaehlt = aktiv === z.kategorieId
        return (
          <li key={z.id}>
            <button
              type="button"
              onClick={() => waehlen(z.kategorieId)}
              aria-pressed={gewaehlt}
              aria-label={`${z.name}: ${eur(z.ist)} von ${eur(z.soll)}. Buchungen dieser Kategorie anzeigen`}
              className={`block min-h-11 w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                gewaehlt ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">
                  {z.icon ? <span className="mr-1.5">{z.icon}</span> : null}
                  {z.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {eur(z.ist)} / {eur(z.soll)}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${breite}%`, background: farbe }} />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs tabular-nums">
                <span style={{ color: farbe }} className="font-semibold">
                  {z.auslastung == null ? 'ohne Soll' : `${Math.round(z.auslastung * 100)} %`}
                </span>
                <span style={{ color: farbe }}>
                  {ueber ? `${eur(-z.rest)} drüber` : `${eur(z.rest)} übrig`}
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
