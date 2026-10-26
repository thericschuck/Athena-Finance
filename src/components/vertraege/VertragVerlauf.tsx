import { AlertTriangle, Clock } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import { datumText } from '@/lib/vertraege/rechnen'
import type { VerlaufZeile } from '@/lib/vertraege/verlauf'

/**
 * Verlauf der tatsächlichen Abbuchungen eines Vertrags: kleine Balken (alt links, neu rechts) und
 * darunter jeder Termin mit gefundener Buchung. Fehlende Buchungen sind gestrichelt und in Warnfarbe.
 * Server-Komponente, nur CSS; die Balken teilen die Breite (`flex-1`), nichts wird breiter als der Bildschirm.
 */
export function VertragVerlauf({
  zeilen, currency, locale, dateFormat, vertragsBetrag,
}: { zeilen: VerlaufZeile[]; currency: string; locale: string; dateFormat: string; vertragsBetrag: number }) {
  const eur = (n: number) => fmtCurrency(n, currency, locale, { fractionDigits: 2 })
  const hoechster = Math.max(vertragsBetrag, ...zeilen.flatMap(z => (z.buchung ? [z.buchung.amount] : [])))
  const chronologisch = [...zeilen].reverse()

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`Abbuchungen der letzten ${zeilen.length} Termine: ${zeilen.filter(z => z.buchung).length} eingegangen`}
        className="flex h-16 items-end gap-1 rounded-lg border border-border bg-card px-3 pb-2 pt-3"
      >
        {chronologisch.map(z => (
          <div key={z.termin} className="flex h-full min-w-0 flex-1 items-end">
            {z.buchung ? (
              <div className="w-full rounded-sm bg-danger/70" style={{ height: `${Math.max(8, (z.buchung.amount / hoechster) * 100)}%` }} />
            ) : (
              <div
                className={`w-full rounded-sm border border-dashed ${z.status === 'offen' ? 'border-warning' : 'border-muted-foreground/40'}`}
                style={{ height: `${Math.max(8, (vertragsBetrag / hoechster) * 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {zeilen.map(z => (
          <li key={z.termin} className="flex items-baseline justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm tabular-nums">
                {datumText(z.buchung?.date ?? z.termin, dateFormat)}
                {z.buchung && z.buchung.date !== z.termin && (
                  <span className="ml-2 text-xs text-muted-foreground">Termin {datumText(z.termin, dateFormat)}</span>
                )}
              </p>
              {z.buchung ? (
                <p className="truncate text-xs text-muted-foreground">{z.buchung.text || 'Buchung'}</p>
              ) : (
                <p className={`flex items-center gap-1 text-xs ${z.status === 'offen' ? 'font-medium text-warning' : 'text-muted-foreground'}`}>
                  {z.status === 'offen' ? <AlertTriangle className="size-3 shrink-0" aria-hidden /> : <Clock className="size-3 shrink-0" aria-hidden />}
                  {z.status === 'offen' ? 'Keine passende Buchung auf dem Konto' : 'Noch nicht gebucht'}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              {z.buchung ? (
                <>
                  <p className="text-sm font-medium tabular-nums text-danger">−{eur(z.buchung.amount)}</p>
                  {z.abweichung !== null && Math.abs(z.abweichung) >= 0.005 && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {z.abweichung > 0 ? '+' : '−'}{eur(Math.abs(z.abweichung))} zum Vertrag
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm tabular-nums text-muted-foreground">({eur(vertragsBetrag)})</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
