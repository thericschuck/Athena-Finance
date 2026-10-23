import { sparklinePfad } from '@/lib/verlauf/konten'

/**
 * Mini-Verlauf eines Kontos als reiner SVG-Pfad. Bewusst ohne Recharts: sechs Karten wuerden
 * sonst die Chart-Bibliothek in jeden Aufruf des Tabs ziehen, und die Linie braucht weder
 * Achsen noch Tooltip. Server Component — es geht nur der fertige Pfad ans HTML.
 */
const B = 120
const H = 36

export function KontenSparkline({ werte, farbe }: { werte: number[]; farbe: string }) {
  const d = sparklinePfad(werte, B, H)
  if (!d) return <div className="h-9 w-full" aria-hidden />
  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      <path d={d} fill="none" stroke={farbe} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
