'use client'

import { C, kicker } from '@/components/landing/landing-tokens'
import { NAV_ITEMS, requestSectionJump } from '@/components/landing/shared/nav-sections'

/**
 * Footer-Spalte mit allen Sektionen (Prolog, I–IV) — dieselbe Liste wie
 * NAV_ITEMS in der Sticky-Leiste und derselbe Sprung (siehe
 * requestSectionJump), damit sich ein Klick hier identisch anfühlt statt nur
 * simpel zur Anker-Position zu scrollen.
 */
export function FooterSections() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
      <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkFaint, marginBottom: '2px' }}>
        Sektionen
      </span>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.index}
          type="button"
          onClick={() => requestSectionJump(item.index)}
          className="foot-link"
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
        >
          <span className="af-quiet af-micro" style={{ ...kicker, fontSize: '11px', color: C.inkSubtle }}>
            {item.index === 'Prolog' ? 'Prolog' : `${item.index} · ${item.label}`}
          </span>
        </button>
      ))}
    </div>
  )
}
