import { SectionHead } from '@/components/landing/shared/editorial'
import { CardCalendar, CardHeatmap, CardSankey } from './analyse-cards'
import { CardDiverging } from './CardDiverging'
import { AnalyseReveal } from './AnalyseReveal'

/**
 * III · Die Analyse. Server-Komposition: die statischen Karten (Heatmap,
 * Sankey, Kalender) und der Kopf werden hier gerendert und als fertige Slots
 * in die Client-Insel gereicht, die nur Scroll-/Schrittlogik trägt.
 */
export function AnalyseSection() {
  const cards = [
    { title: 'Ausgaben-Heatmap · GuV-Modus', body: <CardHeatmap /> },
    { title: 'Geldfluss · Sankey', body: <CardSankey /> },
    { title: 'Cashflow-Kalender', body: <CardCalendar /> },
    { title: 'Einnahmen & Ausgaben', body: <CardDiverging /> },
  ]
  return (
    <AnalyseReveal
      cards={cards}
      head={<SectionHead index="III" label="Die Analyse" title="Ausgaben in einem ganz neuen Licht." align="left" />}
    />
  )
}
