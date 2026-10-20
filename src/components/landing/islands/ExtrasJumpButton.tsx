'use client'

import { ChevronDown } from 'lucide-react'
import { kicker } from '@/components/landing/landing-tokens'
import { scrollToY } from '@/components/landing/scroll-control'

/** Ziel-ID: Anfang von „Weitere Eigenschaften" (siehe ExtrasSection). */
export const EXTRAS_ANCHOR_ID = 'weitere-eigenschaften'

/** Scroll-Knopf am Fuß von „IV · Der Weg". */
export function ExtrasJumpButton() {
  /*
   * Ziel des Scroll-Knopfs am Fuß von „IV · Der Weg": der Anfang von
   * „Weitere Eigenschaften". Bewusst über einen Ref auf das Element statt
   * über nachgerechnete vh-Beträge — die Sektion sitzt per negativem
   * margin-top an einer Stelle, die sich aus .overlap-scene-Höhe MINUS
   * 100vh ergibt (siehe landing.css); jede Änderung an einer der beiden
   * Zahlen würde eine nachgerechnete Formel hier still falsch machen.
   */
  const jumpToExtras = () => {
    const el = document.getElementById(EXTRAS_ANCHOR_ID)
    if (!el) return
    // Oberkante der überziehenden Sektion auf Viewport-Oberkante: exakt der
    // Moment, in dem der Vorhang zugezogen ist und das Pinning endet.
    scrollToY(el.getBoundingClientRect().top + window.scrollY)
  }

  return (
    <button type="button" className="overlap-cue" onClick={jumpToExtras} aria-label="Weiter">
      <span className="overlap-cue-label" style={{ ...kicker, fontSize: '10px' }}>Scroll</span>
      <ChevronDown size={16} strokeWidth={1.6} aria-hidden />
    </button>
  )
}
