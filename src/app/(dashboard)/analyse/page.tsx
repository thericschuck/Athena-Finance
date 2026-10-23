import { Suspense } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { ladeAnalyse, heuteBerlin, type AnalyseParams } from '@/lib/data/analyse-seite'
import {
  buildHeatmap, buildMonthSeries, buildMonthlyComparison, buildSankey, currentMonthTotals,
} from '@/lib/analyse/aufbereiten'
import { monthlySeries } from '@/lib/finance/flow-calc'
import { monthsForPeriod } from '@/lib/period'
import { AnalysePeriodSelector } from '@/components/analyse/AnalysePeriodSelector'
import { AnalyseAccountSelector } from '@/components/analyse/AnalyseAccountSelector'
import { AnalyseVergleichWahl } from '@/components/analyse/AnalyseVergleichWahl'
import { AnalyseFilterChips } from '@/components/analyse/AnalyseFilterChips'
import { AnalyseKennzahlen } from '@/components/analyse/AnalyseKennzahlen'
import { AnalyseInsights } from '@/components/analyse/AnalyseInsights'
import { AnalyseTempo } from '@/components/analyse/AnalyseTempo'
import { AnalyseBudget } from '@/components/analyse/AnalyseBudget'
import { AnalyseKategorien } from '@/components/analyse/AnalyseKategorien'
import { AnalyseGegenparteien } from '@/components/analyse/AnalyseGegenparteien'
import { AnalyseBuchungen } from '@/components/analyse/AnalyseBuchungen'
import { AnalyseKalender } from '@/components/analyse/AnalyseKalender'
import { AusgabenHeatmap, type Mode as HeatmapMode } from '@/components/analyse/AusgabenHeatmap'
import { GeldflussChartUrl } from '@/components/analyse/GeldflussChartUrl'
import { MonatsVergleich } from '@/components/analyse/MonatsVergleich'
import { MonatsVerteilung } from '@/components/analyse/MonatsVerteilung'
import { FlowKindToggle } from '@/components/finance/flow-kind-toggle'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { SkeletonChart } from '@/components/ui/skeleton'

const HEATMAP_MODES: HeatmapMode[] = ['ausgaben', 'einnahmen', 'guv']

/**
 * Analyse — die Übersicht über Einnahmen und Ausgaben aus ALLEN Quellen (Bank und manuell).
 *
 * Alle Zahlen kommen aus `lib/data/flows` (Views monthly_flows und unified_transactions): was als
 * Einnahme/Ausgabe zählt, entscheidet die Datenbank; die Seite wählt nur, ob Anlagen und
 * Forderungen mitgerechnet werden (Schalter `anlage`). Umbuchungen zwischen eigenen Konten
 * fehlen immer.
 *
 * Aufbau: erst die Antwort (Kennzahlen, Auffälligkeiten, Tempo und Budget), dann die Charts, am
 * Ende die Buchungen dazu. Jeder Chart ist anklickbar und setzt einen Filter in der URL (Kategorie,
 * Monat, Tag, Gegenpartei); die Buchungsliste unten zeigt dann genau diese Auswahl.
 *
 * Der Kern wird einmal geladen (lib/data/analyse-seite.ts). Der Kalender braucht die ganze Historie
 * und lädt sich selbst hinter <Suspense>, damit der Rest nicht auf die größte Abfrage wartet.
 */

export default async function AnalysePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const roh = await searchParams
  // Doppelte Parameter liefern ein Array: der erste Wert gilt.
  const params = Object.fromEntries(
    Object.entries(roh).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as AnalyseParams

  const { supabase, user } = await getAuthUser()
  if (!user) return null
  const settings = await getSettings(user.id)

  const daten = await ladeAnalyse(supabase, user.id, params, settings, heuteBerlin())
  const props = { daten }

  // Heatmap-Ansicht: gleiche Rueckfallkette wie der Zeitraum, startet nur den Zustand der Komponente.
  const heatmapModus = HEATMAP_MODES.includes(settings.analyse_default_heatmap_mode as HeatmapMode)
    ? (settings.analyse_default_heatmap_mode as HeatmapMode)
    : 'ausgaben'

  const aktuellerMonat = daten.heute.slice(0, 7)
  const serie = monthlySeries(daten.monatsZeilen, daten.include)

  return (
    // Zeitraum-, Konten- und Monatswahl schreiben in die URL und lösen ein Server-Rendering aus. Der
    // Provider markiert den Klick sofort in der Leiste (optimistisch) und blendet über
    // <FilterPending> die Charts ab, solange die neuen Zahlen unterwegs sind. Kategorie, Tag und
    // Gegenpartei (`localKeys`) filtern nur die Buchungsliste im Browser: sie setzen die URL ohne
    // Server-Rendering, ein Klick lädt also nichts neu.
    <UrlFiltersProvider replace localKeys="kat,tag,partei">
      <div className="space-y-6 p-4 sm:p-8">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analyse</h1>
          {/* Auf dem Handy waagerecht scrollbar statt dreizeilig umgebrochen. */}
          <div className="-mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            <FlowKindToggle />
            <AnalyseAccountSelector accounts={daten.konten} selected={daten.kontoIds} />
            <AnalysePeriodSelector current={daten.periode} />
            <AnalyseVergleichWahl {...props} />
          </div>
        </div>

        {daten.include.anlage && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Anlagen (Krypto, Depot, Bauspar) und Forderungen sind in Einnahmen und Ausgaben
            eingerechnet. Die Sparquote rechnet weiterhin ohne sie.
          </p>
        )}

        <FilterPending className="space-y-6">
          <div className="space-y-6">
            <AnalyseKennzahlen {...props} />
            <AnalyseInsights {...props} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <AnalyseTempo {...props} />
              <Suspense fallback={<SkeletonChart variant="bars" height={220} />}>
                <AnalyseBudget {...props} />
              </Suspense>
            </div>

            <AusgabenHeatmap data={buildHeatmap(daten.txns)} initialMode={heatmapModus} />

            {/* Der Geldfluss bekommt eine volle Zeile: in einer halben Spalte ist die Karte
                schmaler als 600 px und zeigte dann auch am Desktop die Liste statt des Sankeys. */}
            <GeldflussChartUrl data={buildSankey(daten.txns)} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Suspense fallback={<SkeletonChart variant="bars" height={320} />}>
                <AnalyseKalender {...props} />
              </Suspense>
              <MonatsVergleich data={buildMonthlyComparison(serie, aktuellerMonat, monthsForPeriod(daten.periode))} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <AnalyseKategorien {...props} />
              <AnalyseGegenparteien {...props} />
            </div>

            {/* Verteilung — eigene, kategorieunabhängige Sicht auf die Monatssummen, deshalb
                immer über den vollen 24-Monats-Horizont statt der `period`-Auswahl (der
                Konten-Filter greift dagegen schon). */}
            <MonatsVerteilung history={buildMonthSeries(serie, aktuellerMonat)} current={currentMonthTotals(serie, aktuellerMonat)} />

            <section id="buchungen" className="scroll-mt-4 space-y-3">
              <AnalyseFilterChips kategorien={daten.categories.map(c => ({ id: c.id, name: c.name }))} locale={daten.locale} />
              <AnalyseBuchungen {...props} />
            </section>
          </div>
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
