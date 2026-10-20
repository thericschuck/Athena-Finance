import { C } from '@/components/landing/landing-tokens'
import { MeanderFrieze } from '@/components/landing/olive-vines'
import { SectionHead } from '@/components/landing/shared/editorial'
import { PillarsReveal } from './PillarsReveal'

/** II · Die Säulen. Kopf und Fries werden auf dem Server gerendert (Slots). */
export function PillarsSection() {
  return (
    <PillarsReveal
      head={
        <SectionHead
          index="II"
          label="Die Säulen"
          title="Vier Grundsätze."
          emphasis="Ein Fundament."
          lead="Worauf das System steht — vier Prinzipien, die jede Ansicht und jede Berechnung tragen."
          tone="dark"
        />
      }
      frieze={<MeanderFrieze id="frieze-pillars" color={C.cream} opacity={0.3} />}
    />
  )
}
