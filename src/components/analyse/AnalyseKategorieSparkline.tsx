/**
 * Mini-Verlauf einer Kategorie ueber die letzten Monate, reines SVG ohne Recharts: in einer Zeile
 * der Kategorienliste stehen bis zu sieben davon, da waere ein Chart je Zeile Overhead (und
 * Messen der Breite) fuer eine Form, die nur die Richtung zeigen soll.
 *
 * Jede Linie hat ihre eigene Skala (0 bis eigener Hoechstwert): sie beantwortet „steigt oder
 * faellt diese Kategorie", nicht „welche ist groesser" — das sagt der Anteilsbalken. Der letzte
 * Punkt ist der laufende Monat; ist er noch nicht voll, wird er als hohler Ring gezeichnet und
 * die Linie dorthin gestrichelt, damit der Absturz am Monatsanfang nicht als Trend gelesen wird.
 *
 * Reiner Server-/Client-neutraler Baustein (keine Hooks), damit er in beiden Welten laeuft.
 */

const B = 64
const H = 22
const RAND = 3

export function AnalyseKategorieSparkline({
  werte, farbe, unvollstaendig, beschreibung, className = '',
}: {
  werte: number[]
  farbe: string
  /** Der letzte Wert (laufender Monat) ist noch nicht vollstaendig. */
  unvollstaendig: boolean
  /** Text fuer Screenreader, z. B. „Verlauf 12 Monate: zuletzt 120 Euro, Schnitt 98 Euro". */
  beschreibung: string
  className?: string
}) {
  const n = werte.length
  if (n < 2) return null
  const max = Math.max(...werte, 0)
  const x = (i: number) => RAND + (i / (n - 1)) * (B - 2 * RAND)
  // Ohne Ausschlag (alles 0) eine flache Linie unten statt Division durch 0.
  const y = (v: number) => (max > 0 ? H - RAND - (v / max) * (H - 2 * RAND) : H - RAND)
  const punkt = (i: number) => `${x(i).toFixed(1)},${y(werte[i]).toFixed(1)}`

  const vollEnde = unvollstaendig ? n - 1 : n // Anzahl Punkte der durchgezogenen Linie
  const durchgezogen = Array.from({ length: vollEnde }, (_, i) => punkt(i)).join(' ')
  const letzter = n - 1

  return (
    <svg
      viewBox={`0 0 ${B} ${H}`}
      role="img"
      aria-label={beschreibung}
      className={`shrink-0 overflow-visible ${className}`}
    >
      {vollEnde >= 2 && (
        <polyline
          points={durchgezogen}
          fill="none"
          stroke={farbe}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {unvollstaendig && (
        <line
          x1={x(letzter - 1)} y1={y(werte[letzter - 1])} x2={x(letzter)} y2={y(werte[letzter])}
          stroke={farbe} strokeWidth={1.5} strokeDasharray="2 2" strokeLinecap="round"
          vectorEffect="non-scaling-stroke" opacity={0.7}
        />
      )}
      <circle
        cx={x(letzter)} cy={y(werte[letzter])} r={2.4}
        fill={unvollstaendig ? 'var(--card)' : farbe} stroke={farbe} strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
