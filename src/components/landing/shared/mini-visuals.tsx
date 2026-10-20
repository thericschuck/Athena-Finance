import { C } from '@/components/landing/landing-tokens'

// ── Miniatur-Visualisierungen ─────────────────────────────────────────────────

/** Tonstufen für Ausgaben-Heatmaps — von Parchment zu Terrakotta. */
const CLAY = ['#EBE4D6', '#DFC9B8', '#D0A691', '#BE846C', '#B16A50', '#A9553C']
const HEAT = [0,1,2,3,2,1,1,3,4,5,3,2,0,2,5,4,3,1,1,3,5,4,2,1,0,1,3,4,2,0,1,2,3,4,3,2]

export function MiniHeatmap({ cols = 6, cell = 12 }: { cols?: number; cell?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '3px' }}>
      {HEAT.map((v, i) => (
        <div key={i} style={{ height: `${cell}px`, backgroundColor: CLAY[v] }} />
      ))}
    </div>
  )
}

export function MiniSparkline({ stroke = C.olive }: { stroke?: string }) {
  return (
    <svg width="100%" height="46" viewBox="0 0 160 46" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,42 C20,38 35,33 50,27 C65,21 80,19 95,13 C110,7 130,9 160,4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,42 C20,38 35,33 50,27 C65,21 80,19 95,13 C110,7 130,9 160,4 L160,46 L0,46Z"
        fill={stroke}
        opacity="0.1"
      />
    </svg>
  )
}

/** Statisch, keine Prop-/State-Abhängigkeit — Modul-Ebene statt Neuanlage
    bei jedem MiniDonut-Render (siehe MiniDonut unten). Offset gleich mit
    vorberechnet (statt als `let`-Zähler während des JSX-`.map()` fortgeführt
    zu werden): eine während des Renderns mutierte Closure-Variable ist unter
    React-Compiler-Regeln unzulässig (react-hooks/immutability) — Concurrent
    Rendering garantiert nicht, dass eine Render-Durchführung genau einmal
    "durchläuft". */
const MINI_DONUT_SEGMENTS = (() => {
  let offset = 0
  return [
    { color: C.gold, len: 62 },
    { color: C.olive, len: 40 },
    { color: C.graphite, len: 23 },
  ].map((s) => {
    const seg = { ...s, offset }
    offset += s.len + 2
    return seg
  })
})()

export function MiniDonut({ size = 76 }: { size?: number }) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <circle cx="40" cy="40" r="30" fill="none" stroke={C.creamDeep} strokeWidth="9" />
      {MINI_DONUT_SEGMENTS.map((s) => (
        <circle
          key={s.color}
          cx="40"
          cy="40"
          r="30"
          fill="none"
          stroke={s.color}
          strokeWidth="9"
          strokeDasharray={`${s.len} 125`}
          strokeDashoffset={-s.offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      ))}
    </svg>
  )
}

export function MiniStrategy() {
  return (
    <svg width="100%" height="46" viewBox="0 0 320 46" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0,40 L40,31 L80,35 L110,23 L140,27 L170,17 L200,21 L230,12 L260,16 L290,6 L320,10"
        fill="none"
        stroke={C.terracotta}
        strokeWidth="1.4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0,40 L40,31 L80,35 L110,23 L140,27 L170,17 L200,21 L230,12 L260,16 L290,6 L320,10 L320,46 L0,46Z"
        fill={C.terracotta}
        opacity="0.08"
      />
    </svg>
  )
}
