import { C, F, SPACE, kicker } from '@/components/landing/landing-tokens'
import { MeanderFrieze } from '@/components/landing/olive-vines'
import { SHELL } from '@/components/landing/shared/layout'
import { STATS } from '@/components/landing/shared/stats'

/**
 * Statisches Kennzahlen-Band — der Ersatz überall dort, wo die rotierende
 * Säule nicht läuft: bei reduzierter Bewegung und auf schmalen Displays.
 * Ohne diesen Ersatz gingen die vier Zahlen dort ersatzlos verloren, seit
 * das früher hier stehende gebogene Band entfallen ist.
 */
export function StatsBandFallback({ className }: { className?: string }) {
  return (
    <div className={className} style={{ backgroundColor: C.onyx }}>
      <MeanderFrieze id={`frieze-stats-${className ?? 'still'}-top`} color={C.cream} opacity={0.16} />
      <div style={{ ...SHELL, padding: `clamp(48px, 6vw, 76px) ${SPACE.gutter}` }}>
        <div className="g-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                textAlign: 'center',
                borderLeft: i === 0 ? 'none' : `1px solid ${C.ruleOnSoft}`,
                padding: '0 12px',
              }}
            >
              <p
                style={{
                  fontFamily: F.display,
                  fontWeight: 400,
                  fontSize: 'clamp(34px, 5vw, 58px)',
                  lineHeight: 1,
                  color: C.cream,
                  margin: '0 0 12px',
                  letterSpacing: '-0.02em',
                }}
              >
                {s.value}
              </p>
              <p className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: 0 }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
      <MeanderFrieze id={`frieze-stats-${className ?? 'still'}-bottom`} color={C.cream} opacity={0.16} />
    </div>
  )
}
