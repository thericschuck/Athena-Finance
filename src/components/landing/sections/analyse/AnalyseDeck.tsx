'use client'

import { m } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, kicker } from '@/components/landing/landing-tokens'
import { ANALYSE_ITEMS, type AnalyseCard } from '@/components/landing/shared/analyse-config'

/** Gemeinsame Hülle: die feste Mindesthöhe verhindert, dass die Spalte beim
    Kartenwechsel springt, weil die vier Grafiken unterschiedlich hoch sind. */
function AnalyseCardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        backgroundColor: C.onyxWarm,
        // Helle Haarlinie statt der früheren dunklen: im Stapel liegen dunkle
        // Karten übereinander, eine dunkle Kante verschwände darin und der
        // Stapel sähe aus wie ein einziger grauer Block.
        border: `1px solid ${C.ruleOn}`,
        padding: 'clamp(22px, 3vw, 30px)',
        boxShadow: '0 30px 70px -28px rgba(26,26,26,.38)',
        minHeight: '330px',
        // Füllt im Stapel die feste Deck-Höhe (siehe .analyse-deck), damit
        // alle vier Karten exakt deckungsgleich übereinanderliegen; im
        // mobilen Fallback steht die Höhe auf auto und minHeight greift.
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <p style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: '0 0 22px' }}>{title}</p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

/*
 * Kartenstapel: nicht eine Karte, die gegen die nächste ausgetauscht wird,
 * sondern alle vier gleichzeitig im Bild — die aktive vorn, die folgenden
 * gestaffelt dahinter, die erledigten nach links weggeräumt. Man sieht
 * dadurch jederzeit, wie viel noch kommt, statt die Karten nur einzeln
 * aufblitzen zu sehen.
 *
 * Die zurückliegenden Karten bleiben mit sehr geringer Deckkraft stehen
 * (statt ganz zu verschwinden), damit der Stapel beim Zurückscrollen nicht
 * aus dem Nichts wieder auftaucht.
 */
function deckGeometry(d: number) {
  if (d === 0) return { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, z: 40 }
  if (d > 0) {
    return {
      x: 34 + (d - 1) * 26,
      y: -18 - (d - 1) * 13,
      scale: 1 - d * 0.05,
      rotate: 2 * Math.min(d, 3),
      opacity: Math.max(0.2, 0.66 - (d - 1) * 0.2),
      z: 40 - d,
    }
  }
  return { x: -38 + d * 10, y: 16, scale: 0.9, rotate: -2.6, opacity: 0.16, z: 40 + d }
}

export function AnalyseDeck({
  cards,
  active,
  onSelect,
  registerContainerRef,
  registerCardRef,
}: {
  cards: AnalyseCard[]
  active: number
  onSelect: (i: number) => void
  /**
   * Nur für die mobile Swipe-Fassung relevant (siehe .analyse-deck unter
   * 1024px in landing.css und der IntersectionObserver in AnalyseReveal) —
   * Zugriff auf das Karussell von außen: zum Scroll-zu-Karte per Listenklick
   * und zum Beobachten, welche Karte gerade zentriert im Bild steht. Am
   * Desktop ungenutzt (die Karten liegen dort übereinander, kein Karussell).
   */
  registerContainerRef?: (el: HTMLDivElement | null) => void
  registerCardRef?: (i: number, el: HTMLDivElement | null) => void
}) {
  const still = useReducedMotion()
  // Vor dem ersten Schritt liegt bereits Karte 01 vorn — der Stapel ist so
  // schon beim Heranscrollen als Vorschau lesbar.
  const front = Math.max(0, active)

  return (
    <div className="analyse-deck" ref={registerContainerRef}>
      {cards.map((card, i) => {
        const d = i - front
        const g = deckGeometry(d)
        const isFront = d === 0
        return (
          <m.div
            key={card.title}
            ref={(el: HTMLDivElement | null) => registerCardRef?.(i, el)}
            className="analyse-deck-card"
            animate={{ x: g.x, y: g.y, scale: g.scale, rotate: g.rotate, opacity: g.opacity }}
            transition={still ? { duration: 0 } : { type: 'spring', stiffness: 210, damping: 26, mass: 0.8 }}
            style={{ zIndex: g.z }}
          >
            {/*
              Die hinteren Karten sind selbst anklickbar (nicht nur der
              Listenpunkt links) — der sichtbare Rand einer Karte ist das
              naheliegendste Ziel, wenn man „die da" sehen will. Die vordere
              Karte ist kein Button: sie ist bereits das Ziel.
            */}
            {isFront ? (
              <AnalyseCardShell title={card.title}>{card.body}</AnalyseCardShell>
            ) : (
              <button
                type="button"
                className="analyse-deck-btn"
                onClick={() => onSelect(i)}
                aria-label={`Zu „${ANALYSE_ITEMS[i]}" springen`}
              >
                <AnalyseCardShell title={card.title}>{card.body}</AnalyseCardShell>
              </button>
            )}
          </m.div>
        )
      })}
    </div>
  )
}
