import type { VerlaufPunkt } from '@/lib/schulden/berechnen'

/**
 * Kleiner Treppenverlauf der Restschuld (nur wenn Zahlungen vorhanden sind). Reines SVG ohne
 * Client-Code; die Farbe kommt über `currentColor` vom umgebenden Text.
 */
export function RestschuldVerlauf({ punkte, className }: { punkte: VerlaufPunkt[]; className?: string }) {
  if (punkte.length < 2) return null
  const B = 120
  const H = 28
  const t = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  const t0 = t(punkte[0].datum)
  const spanne = Math.max(1, t(punkte[punkte.length - 1].datum) - t0)
  const max = Math.max(...punkte.map(p => p.rest), 0.01)
  const x = (d: string) => ((t(d) - t0) / spanne) * (B - 2) + 1
  const y = (r: number) => H - 2 - (r / max) * (H - 4)

  // Treppe: bis zum Zahlungstag auf altem Stand bleiben, dann senkrecht auf den neuen.
  let pfad = `M${x(punkte[0].datum).toFixed(1)},${y(punkte[0].rest).toFixed(1)}`
  for (let i = 1; i < punkte.length; i++) {
    pfad += ` H${x(punkte[i].datum).toFixed(1)} V${y(punkte[i].rest).toFixed(1)}`
  }
  const flaeche = `${pfad} V${H} H${x(punkte[0].datum).toFixed(1)} Z`
  const von = Math.round(punkte[0].rest)
  const bis = Math.round(punkte[punkte.length - 1].rest)

  return (
    <svg
      viewBox={`0 0 ${B} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Restschuld sank von ${von} auf ${bis}`}
      className={className ?? 'h-7 w-full'}
    >
      <path d={flaeche} fill="currentColor" opacity={0.12} />
      <path d={pfad} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
