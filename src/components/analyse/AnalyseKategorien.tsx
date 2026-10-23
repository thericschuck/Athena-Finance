import { AnalyseKategorienAnzeige } from '@/components/analyse/AnalyseKategorienAnzeige'
import { baueAnalyseKategorien } from '@/lib/analyse/kategorien'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'

/**
 * Kategorien-Abschnitt der Analyse: Server-Huelle, die aus dem Seitenkern nur das Noetige
 * vorrechnet (Ansicht beider Modi, Farben, Trendreihen) und an die Client-Anzeige gibt. So
 * gehen weder alle `monatsZeilen` noch die Buchungen ueber die Leitung zum Browser.
 */
export function AnalyseKategorien({ daten }: AnalyseAbschnittProps) {
  const k = baueAnalyseKategorien({
    monatsZeilen: daten.monatsZeilen,
    categories: daten.categories,
    include: daten.include,
    heute: daten.heute,
    fenster: daten.fenster,
    vergleichsFenster: daten.vergleichsFenster,
    vergleich: daten.vergleich,
    fruehesterMonat: daten.fruehesterMonat,
    monat: daten.filter.monat,
    locale: daten.locale,
  })
  return <AnalyseKategorienAnzeige daten={k} />
}
