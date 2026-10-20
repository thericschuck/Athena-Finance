import './landing.css'
import { C, F } from '@/components/landing/landing-tokens'
import { OliveVines } from '@/components/landing/olive-vines'
import { CustomCursor } from '@/components/landing/islands/CustomCursor'
import { LandingProviders } from '@/components/landing/islands/LandingProviders'
import { SectionProgressBar } from '@/components/landing/islands/SectionProgressBar'
import { AnalyseSection } from '@/components/landing/sections/analyse/AnalyseSection'
import { ExtrasSection } from '@/components/landing/sections/ExtrasSection'
import { Hero } from '@/components/landing/sections/Hero'
import { InstrumentariumSection } from '@/components/landing/sections/InstrumentariumSection'
import { PedimentSection } from '@/components/landing/sections/pediment/PedimentSection'
import { PillarsSection } from '@/components/landing/sections/pillars/PillarsSection'
import { SiteFooter } from '@/components/landing/sections/SiteFooter'
import { SiteHeader } from '@/components/landing/sections/SiteHeader'
import { WaitlistSection } from '@/components/landing/sections/WaitlistSection'
import { WegSection } from '@/components/landing/sections/WegSection'

/**
 * Öffentliche Landingpage als Server-Komposition. Nur die scroll-/zustandsgetriebenen
 * Teile sind Client-Inseln (siehe `islands/` und die `*Reveal`-Dateien unter `sections/`);
 * alles andere wird auf dem Server gerendert und liefert kein eigenes Client-JS.
 */
export function LandingContent() {
  return (
    <LandingProviders>
      <div
        className="af-landing"
        style={{
          position: 'relative',
          backgroundColor: C.parchment,
          color: C.ink,
          minHeight: '100vh',
          fontFamily: F.sans,
          /*
           * `clip` statt `hidden`: hidden auf einer Achse rechnet die andere auf
           * `auto` hoch und macht dieses Div damit zum Scroll-Container — die
           * sticky Navigationsleiste klebt dann an ihm statt am Viewport und
           * scrollt mit weg. `clip` beschneidet ohne Scrollport.
           */
          overflowX: 'clip',
        }}
      >
        <CustomCursor />
        <SectionProgressBar />

        {/*
          Die Ranken liegen absichtlich AUSSERHALB des Hero und über der
          Navigationsleiste (z-index 60 gegen deren 50) — sie sollen die Leiste
          überwachsen. Läge die Schicht im Hero, würde dessen overflow:hidden sie
          an der Oberkante abschneiden.
        */}
        <div className="vine-layer-over" aria-hidden>
          <OliveVines tone="light" opacity={0.62} />
        </div>

        <SiteHeader />

        <Hero />

        <PedimentSection />

        <InstrumentariumSection />

        {/* ══ II · DIE SÄULEN (horizontaler Scroll-Schieber ab Desktop) ══ */}
        <PillarsSection />

        {/* ══ III · DIE ANALYSE (gepinnte Schritt-Erzählung ab Desktop) ══ */}
        <AnalyseSection />

        <WegSection />

        <ExtrasSection />

        <WaitlistSection />

        <SiteFooter />
      </div>
    </LandingProviders>
  )
}
