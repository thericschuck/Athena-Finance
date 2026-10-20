'use client'

import { m } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, F } from '@/components/landing/landing-tokens'
import { EASE } from '@/components/landing/shared/motion'

/* 04 — Divergierende Balken: Ausgaben nach links, Einnahmen nach rechts, um
   eine gemeinsame Nulllinie.
 *
 * Die Nulllinie sitzt NICHT mittig, sondern teilt die Balkenfläche im
 * Verhältnis der beiden Maxima (1.200 zu 3.800). Dadurch gilt links wie
 * rechts derselbe Maßstab — ein Euro ist auf beiden Seiten gleich breit —
 * und trotzdem füllt jede Seite ihre Hälfte aus. Bei starr mittiger Achse
 * müsste sich die Ausgabenseite denselben Maßstab mit dem viermal größeren
 * Gehalt teilen und bliebe als kaum sichtbarer Stummel übrig.
 */
const DIVERGING_NEG_MAX = 1200
const DIVERGING_POS_MAX = 3800
const DIVERGING = [
  { cat: 'Gehalt', val: 3800 },
  { cat: 'Freelance', val: 950 },
  { cat: 'Wohnen', val: -1200 },
  { cat: 'Lebensmittel', val: -480 },
  { cat: 'Mobilität', val: -320 },
  { cat: 'Freizeit', val: -180 },
]

export function CardDiverging() {
  const still = useReducedMotion()
  return (
    <div>
      {DIVERGING.map((d, i) => {
        const income = d.val > 0
        const pct = (Math.abs(d.val) / (income ? DIVERGING_POS_MAX : DIVERGING_NEG_MAX)) * 100
        const color = income ? C.oliveLight : C.terracotta
        const bar = (
          <m.div
            initial={still ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: still ? 0 : 0.7, delay: still ? 0 : 0.05 * i, ease: EASE }}
            style={{
              height: '100%',
              width: `${pct}%`,
              backgroundColor: color,
              opacity: 0.85,
              transformOrigin: income ? 'left center' : 'right center',
            }}
          />
        )
        return (
          <div key={d.cat} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: C.onSubtle, width: '76px', textAlign: 'right', flexShrink: 0 }}>
              {d.cat}
            </span>
            <div style={{ flex: 1, display: 'flex', height: '13px' }}>
              <div style={{ flexGrow: DIVERGING_NEG_MAX, flexBasis: 0, display: 'flex', justifyContent: 'flex-end' }}>
                {!income && bar}
              </div>
              <span style={{ width: '1px', backgroundColor: C.ruleOn, flexShrink: 0 }} />
              <div style={{ flexGrow: DIVERGING_POS_MAX, flexBasis: 0 }}>{income && bar}</div>
            </div>
            <span style={{ fontFamily: F.mono, fontSize: '11px', color, width: '58px', textAlign: 'right' }}>
              {income ? '+' : '−'}
              {Math.abs(d.val).toLocaleString('de-DE')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
