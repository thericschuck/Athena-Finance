/**
 * Winziger Verlaufsgraph für eine Tabellenzeile.
 *
 * Bewusst handgezeichnetes SVG statt Recharts: in der Kontenübersicht stehen bis zu einem
 * Dutzend davon nebeneinander, und jede Recharts-Instanz bringt einen ResponsiveContainer
 * mit ResizeObserver mit. Hier reicht ein `path` — kein Client-Bundle, keine Messung, und
 * das Ganze rendert auf dem Server mit.
 */

interface Props {
  /** Chronologisch sortierte Werte. Weniger als zwei Punkte ergeben keine Linie. */
  values: number[]
  width?: number
  height?: number
  /** Kontofarbe; ohne Angabe entscheidet die Richtung über die Farbe. */
  color?: string | null
  /**
   * Eindeutiger Schlüssel für die Gradient-ID (z. B. die Konto-ID). SVG-IDs gelten im
   * ganzen Dokument: zwei Sparklines mit derselben ID teilen sich denselben Verlauf, und
   * die zweite wird in der Farbe der ersten gefüllt.
   */
  uid?: string
  className?: string
}

export function AccountSparkline({ values, width = 96, height = 28, color, uid, className }: Props) {
  if (values.length < 2) {
    // Eine flache Linie wäre gelogen — sie sähe aus wie „Kontostand unverändert", obwohl in
    // Wahrheit gar keine Historie da ist. Also ein sichtbar leerer Platzhalter.
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-hidden="true"
      >
        <svg width={width} height={height} role="presentation">
          <line
            x1={0} y1={height / 2} x2={width} y2={height / 2}
            stroke="currentColor" strokeOpacity={0.15}
            strokeWidth={1} strokeDasharray="2 3"
          />
        </svg>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // Bei konstantem Verlauf wäre die Spanne 0 und jede Division ergäbe NaN — dann mittig zeichnen.
  const span = max - min || 1

  const pad = 2 // damit die Linie an den Rändern nicht abgeschnitten wird
  const stepX = width / (values.length - 1)
  const toY = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)

  const points = values.map((v, i) => `${(i * stepX).toFixed(2)},${toY(v).toFixed(2)}`)
  const line = `M ${points.join(' L ')}`
  // Fläche unter der Linie: Pfad bis zum letzten Punkt, dann an der Unterkante zurück.
  const area = `${line} L ${width},${height} L 0,${height} Z`

  const rising = values[values.length - 1] >= values[0]
  const stroke = color ?? (rising ? 'var(--success, currentColor)' : 'var(--destructive)')
  const gradientId = `spark-${uid ?? `${Math.round(min)}-${Math.round(max)}-${values.length}`}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Verlauf, ${rising ? 'steigend' : 'fallend'}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
