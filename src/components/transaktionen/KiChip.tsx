import { Sparkles } from 'lucide-react'
import { AnalyseKennzahlInfo } from '@/components/analyse/AnalyseKennzahlInfo'
import type { KiBilanz } from '@/lib/fints/ai-bilanz'

/**
 * Kleiner Chip „KI 87 %“ mit Hover-Karte: Trefferquote der KI-Kategorisierung. Zählt nur, was du
 * entschieden hast; ungeprüft gesetzte Zuordnungen sind kein Treffer. Ohne Daten: kein Chip.
 */
export function KiChip({ bilanz }: { bilanz: KiBilanz }) {
  if (bilanz.stichprobe === 0 && bilanz.ungeprueft === 0 && bilanz.offeneVorschlaege === 0) return null

  return (
    <AnalyseKennzahlInfo
      className="inline-flex h-6 cursor-help items-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      titel="KI-Kategorisierung"
      zeilen={[
        ['Treffer (übernommen)', String(bilanz.bestaetigt)],
        ['Korrigiert', String(bilanz.korrigiert)],
        ['Ungeprüft', String(bilanz.ungeprueft)],
        ['Offene Vorschläge', String(bilanz.offeneVorschlaege)],
      ]}
      text="Treffer = du hast einen KI-Vorschlag übernommen. Korrigiert = du hast eine andere Kategorie gewählt. Ungeprüft = von der KI gesetzt, nicht angefasst (zählt nicht als Treffer). Die Quote ist der Anteil der Treffer an deinen Entscheidungen."
    >
      <Sparkles className="size-3" aria-hidden />
      <span>
        KI{' '}
        <span className="tabular-nums text-foreground">
          {bilanz.quote !== null ? `${bilanz.quote} %` : '–'}
        </span>
      </span>
    </AnalyseKennzahlInfo>
  )
}
