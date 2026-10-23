import { Suspense } from 'react'
import { SkeletonChart } from '@/components/ui/skeleton'
import { AnalyseTempoChartLazy } from './AnalyseTempoChartLazy'
import { ladeTempoDaten } from './AnalyseTempoDaten'
import { MIN_VORMONATE } from '@/lib/analyse/tempo'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'

/**
 * „Tempo diesen Monat": laufender Monat gegen den Schnitt der letzten Monate.
 *
 * Die Buchungen der Vormonate stehen nicht in `daten.txns` (das deckt nur den gewaehlten Zeitraum,
 * bei 1W/1M also nichts davor); ladeTempoDaten holt sie selbst. Das ist eine eigene Abfrage, und
 * deshalb haengt dieser Abschnitt SELBST in einer Suspense-Grenze: die Seite muss ihn nicht
 * einhaengen, und der Rest der Seite wartet nicht darauf.
 *
 * Der Chart gilt immer fuer den laufenden Monat, unabhaengig vom gewaehlten Zeitraum (Konten und
 * der Schalter Anlage/Forderung wirken aber).
 */
export function AnalyseTempo(props: AnalyseAbschnittProps) {
  return (
    <Suspense fallback={<SkeletonChart variant="area" height={220} legend />}>
      <TempoInhalt {...props} />
    </Suspense>
  )
}

async function TempoInhalt({ daten }: AnalyseAbschnittProps) {
  const t = await ladeTempoDaten(daten)
  const monat = new Date(`${daten.heute}T12:00:00`).toLocaleDateString(daten.locale, { month: 'long', year: 'numeric' })

  return (
    <section aria-label="Tempo diesen Monat" className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Tempo diesen Monat <span className="font-normal normal-case tracking-normal">· {monat}</span>
      </p>
      {t && (t.ausgaben || t.einnahmen) ? (
        <AnalyseTempoChartLazy reihen={{ ausgaben: t.ausgaben, einnahmen: t.einnahmen }} locale={daten.locale} />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Für den Vergleich braucht es mindestens {MIN_VORMONATE} abgeschlossene Monate mit Buchungen.
        </p>
      )}
    </section>
  )
}
