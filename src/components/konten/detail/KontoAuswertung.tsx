import { AccountMonthChart, type MonthDatum } from '@/components/finance/account-month-chart'
import type { KategorieSumme } from '@/lib/konten/detail'
import { formatBetrag } from './format'

/**
 * Auswertung des Kontos: Monat für Monat (Klick auf eine Säule setzt `month` und wirkt auch auf die
 * Buchungen) und die größten Ausgaben nach Kategorie. Zeigt nur, was genug Material hat — ein
 * Bausparvertrag mit vier Buchungen bekäme sonst zwei leere Rahmen.
 *
 * Server-Komponente; der Chart ist Client und braucht den UrlFiltersProvider der Seite.
 */
export function KontoAuswertung({
  monate, topKategorien, kategorienMax, aktiverMonat, monatLabel, currency, locale,
}: {
  monate: MonthDatum[]
  topKategorien: KategorieSumme[]
  kategorienMax: number
  aktiverMonat: string | null
  monatLabel: string | null
  currency: string
  locale: string
}) {
  const zeigeMonate = monate.length >= 2
  const zeigeKategorien = topKategorien.length >= 2

  if (!zeigeMonate && !zeigeKategorien) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium text-foreground">Noch nicht genug Buchungen für eine Auswertung</p>
        <p className="mt-1 px-4 text-sm text-muted-foreground">
          Für den Monatsvergleich und die Kategorien braucht es mindestens zwei Monate bzw. zwei Ausgabenkategorien im Zeitraum.
        </p>
      </div>
    )
  }

  return (
    <div className={`grid min-w-0 gap-4 ${zeigeMonate && zeigeKategorien ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
      {zeigeMonate && (
        <div className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monat für Monat</p>
            <span className="text-right text-[11px] text-muted-foreground">Monat anklicken zum Eingrenzen</span>
          </div>
          <AccountMonthChart data={monate} currency={currency} selectedMonth={aktiverMonat} />
        </div>
      )}

      {zeigeKategorien && (
        <div className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Größte Ausgaben nach Kategorie
            </p>
            <span className="shrink-0 text-[11px] text-muted-foreground">{monatLabel ?? 'ohne Umbuchungen'}</span>
          </div>
          <div className="space-y-2.5">
            {topKategorien.map(c => (
              <div key={c.name} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate text-sm text-foreground">{c.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${kategorienMax ? Math.max(4, (c.total / kategorienMax) * 100) : 0}%`,
                      backgroundColor: c.color ?? 'var(--chart-expense)',
                      opacity: c.color ? 1 : 0.75,
                    }}
                  />
                </span>
                <span className="text-sm tabular-nums text-danger">−{formatBetrag(c.total, currency, locale)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
