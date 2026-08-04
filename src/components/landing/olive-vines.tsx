/**
 * Olivenzweige (Athenas heiliger Baum) als Hintergrund-Ornament.
 *
 * Die Ranken zeichnen sich beim Laden selbst — Stängel über `stroke-dashoffset`,
 * Blätter entrollen sich versetzt entlang des Stängels, danach wiegt sich jeder
 * Zweig minimal. Alles über CSS-Keyframes statt Framer Motion: 70+ Blätter
 * per JS zu animieren würde den Main Thread beim Seitenstart blockieren, und
 * `prefers-reduced-motion` lässt sich in CSS sauber abfangen.
 *
 * Wichtig für Erweiterungen: animierte Elemente dürfen KEIN eigenes
 * `transform`-Attribut tragen — CSS-`transform` aus der Animation würde es
 * überschreiben und das Element auf den Ursprung zurückwerfen. Position und
 * Drehung gehören deshalb immer auf ein umgebendes <g>.
 */
import './vines.css'
import { C } from './landing-tokens'

// ── Bezier-Mathematik ─────────────────────────────────────────────────────────

type Pt = readonly [number, number]
type Cubic = { p0: Pt; p1: Pt; p2: Pt; p3: Pt }

function pointAt({ p0, p1, p2, p3 }: Cubic, t: number): Pt {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ]
}

/** Tangentenwinkel in Grad — bestimmt, wie ein Blatt am Stängel ansetzt. */
function angleAt({ p0, p1, p2, p3 }: Cubic, t: number): number {
  const mt = 1 - t
  const dx =
    3 * mt * mt * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0])
  const dy =
    3 * mt * mt * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

const cubicPath = ({ p0, p1, p2, p3 }: Cubic) =>
  `M ${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`

/** Lanzettliches Olivenblatt: Basis auf (0,0), Spitze auf (len,0). */
function leafPath(len: number): string {
  const w = len * 0.19
  return (
    `M 0 0 C ${len * 0.26} ${-w * 1.05}, ${len * 0.72} ${-w * 0.92}, ${len} 0 ` +
    `C ${len * 0.72} ${w * 0.8}, ${len * 0.26} ${w * 0.95}, 0 0 Z`
  )
}

/** Ranke: auslaufende Spirale am Zweigende. */
function tendrilPath([cx, cy]: Pt, r: number, turns: number, dir: 1 | -1, phase: number): string {
  const steps = 44
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const a = phase + f * turns * Math.PI * 2 * dir
    const rr = r * (1 - f * 0.82)
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M ${pts.join(' L ')}`
}

// ── Farbtöne ──────────────────────────────────────────────────────────────────

type Tone = { stem: string; leaf: string; leafAlt: string; drupe: string }

const TONES: Record<'light' | 'dark', Tone> = {
  // auf Parchment
  light: { stem: C.oliveDeep, leaf: C.olive, leafAlt: C.oliveLight, drupe: C.goldInk },
  // auf Onyx
  dark: { stem: C.olive, leaf: C.oliveLight, leafAlt: C.olive, drupe: C.gold },
}

// ── Zweig ─────────────────────────────────────────────────────────────────────

type BranchSpec = {
  cu: Cubic
  /** Anzahl Blätter */
  leaves: number
  /** Blattlänge an der Basis */
  leafLen: number
  /** Verjüngung zur Spitze (0 = keine, 0.5 = halb so groß) */
  taper?: number
  /** Abspreizwinkel vom Stängel in Grad */
  spread?: number
  /** Strichbreite des Stängels */
  width?: number
  /** t-Bereich, in dem Blätter sitzen */
  from?: number
  to?: number
  /** t-Positionen für Oliven */
  drupes?: number[]
  /** Ranke am Zweigende */
  tendril?: { r: number; turns: number; dir: 1 | -1 }
}

/**
 * Sekunden, die ein Stängel zum Wachsen braucht. Muss mit der
 * animation-duration von `.vine-stem` in vines.css übereinstimmen — daraus
 * werden hier die Blatt-Verzögerungen berechnet.
 */
const DRAW = 2.4

function mirror(b: BranchSpec, axis: number): BranchSpec {
  const flip = ([x, y]: Pt): Pt => [axis * 2 - x, y]
  return {
    ...b,
    cu: { p0: flip(b.cu.p0), p1: flip(b.cu.p1), p2: flip(b.cu.p2), p3: flip(b.cu.p3) },
    tendril: b.tendril && { ...b.tendril, dir: (b.tendril.dir * -1) as 1 | -1 },
  }
}

function VineBranch({ spec, delay, tone }: { spec: BranchSpec; delay: number; tone: Tone }) {
  const {
    cu,
    leaves,
    leafLen,
    taper = 0.45,
    spread = 32,
    width = 1.6,
    from = 0.1,
    to = 0.97,
    drupes = [],
    tendril,
  } = spec

  const [ax, ay] = cu.p0

  return (
    <g
      className="vine-branch"
      style={{
        transformBox: 'view-box',
        transformOrigin: `${ax}px ${ay}px`,
        animationDelay: `${(delay * 1.7).toFixed(2)}s`,
      }}
    >
      {/* Stängel */}
      <path
        className="vine-stem"
        d={cubicPath(cu)}
        pathLength={1}
        fill="none"
        stroke={tone.stem}
        strokeWidth={width}
        strokeLinecap="round"
        style={{ animationDelay: `${delay.toFixed(2)}s` }}
      />

      {/* Ranke am Ende */}
      {tendril && (
        <path
          className="vine-stem"
          d={tendrilPath(
            cu.p3,
            tendril.r,
            tendril.turns,
            tendril.dir,
            angleAt(cu, 1) * (Math.PI / 180),
          )}
          pathLength={1}
          fill="none"
          stroke={tone.stem}
          strokeWidth={width * 0.7}
          strokeLinecap="round"
          style={{
            animationDelay: `${(delay + DRAW * 0.72).toFixed(2)}s`,
            animationDuration: '1.2s',
          }}
        />
      )}

      {/* Blätter — entrollen sich in der Reihenfolge, in der der Stängel sie erreicht */}
      {Array.from({ length: leaves }, (_, i) => {
        const f = leaves === 1 ? 0 : i / (leaves - 1)
        const t = from + (to - from) * f
        const side = i % 2 === 0 ? -1 : 1
        const len = leafLen * (1 - taper * f)
        const [x, y] = pointAt(cu, t)
        // leichte Streuung, damit das Muster nicht mechanisch wirkt
        const jitter = ((i * 37) % 11) - 5
        const rot = angleAt(cu, t) + side * (spread + jitter)
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`}>
            <path
              className="vine-leaf"
              d={leafPath(len)}
              fill={i % 3 === 0 ? tone.leafAlt : tone.leaf}
              style={{ animationDelay: `${(delay + 0.18 + f * DRAW * 0.82).toFixed(2)}s` }}
            />
          </g>
        )
      })}

      {/* Oliven */}
      {drupes.map((t, i) => {
        const [x, y] = pointAt(cu, t)
        const rot = angleAt(cu, t) + 70
        return (
          <g
            key={i}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) translate(${(leafLen * 0.24).toFixed(1)} 0)`}
          >
            <ellipse
              className="vine-leaf"
              rx={leafLen * 0.13}
              ry={leafLen * 0.1}
              fill={tone.drupe}
              style={{ animationDelay: `${(delay + 0.4 + t * DRAW * 0.82).toFixed(2)}s` }}
            />
          </g>
        )
      })}
    </g>
  )
}

// ── Zweig-Sets ────────────────────────────────────────────────────────────────

const VB = { w: 520, h: 900 }

const LEFT: BranchSpec[] = [
  {
    cu: { p0: [-30, 118], p1: [156, 52], p2: [292, 248], p3: [402, 468] },
    leaves: 19,
    leafLen: 34,
    taper: 0.4,
    spread: 36,
    width: 1.8,
    drupes: [0.42, 0.68],
    tendril: { r: 20, turns: 1.35, dir: 1 },
  },
  {
    cu: { p0: [-22, 436], p1: [118, 502], p2: [236, 654], p3: [332, 862] },
    leaves: 16,
    leafLen: 30,
    taper: 0.4,
    spread: 33,
    width: 1.5,
    drupes: [0.55],
  },
  {
    cu: { p0: [88, -44], p1: [162, 92], p2: [178, 214], p3: [252, 352] },
    leaves: 13,
    leafLen: 25,
    taper: 0.4,
    spread: 31,
    width: 1.2,
    tendril: { r: 15, turns: 1.2, dir: -1 },
  },
]

const RIGHT = LEFT.map((b) => mirror(b, VB.w / 2))

/**
 * Zwei Ranken-Vorhänge an den Seiten. Getrennte SVGs statt eines
 * durchgehenden, damit auf schmalen Viewports die Zweigbasen am Rand
 * stehen bleiben (`slice`) statt zu Miniaturen zu schrumpfen.
 */
export function OliveVines({
  tone = 'light',
  opacity = 0.9,
  width = 'clamp(112px, 26vw, 450px)',
}: {
  tone?: 'light' | 'dark'
  opacity?: number
  width?: string
}) {
  const t = TONES[tone]
  const sides = [
    { key: 'l', branches: LEFT, par: 'xMinYMid slice', pos: { left: 0 } },
    { key: 'r', branches: RIGHT, par: 'xMaxYMid slice', pos: { right: 0 } },
  ] as const

  return (
    <div
      aria-hidden
      className="vine-layer"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}
    >
      {sides.map((side, si) => (
        <svg
          key={side.key}
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          preserveAspectRatio={side.par}
          style={{ position: 'absolute', top: 0, height: '100%', width, ...side.pos }}
        >
          {side.branches.map((b, i) => (
            <VineBranch key={i} spec={b} delay={0.15 + i * 0.22 + si * 0.11} tone={t} />
          ))}
        </svg>
      ))}
    </div>
  )
}

// ── Lorbeerkranz ──────────────────────────────────────────────────────────────

const WREATH_LEFT: BranchSpec = {
  cu: { p0: [100, 186], p1: [34, 176], p2: [6, 116], p3: [26, 42] },
  leaves: 12,
  leafLen: 26,
  taper: 0.38,
  spread: 26,
  width: 1.4,
  from: 0.06,
  to: 0.98,
  drupes: [0.52],
}

/** Kranz aus zwei Zweigen — Athenas Siegeszeichen, für die Abschluss-Sektion. */
export function LaurelWreath({
  size = 240,
  tone = 'dark',
  opacity = 0.85,
}: {
  size?: number
  tone?: 'light' | 'dark'
  opacity?: number
}) {
  const t = TONES[tone]
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{ display: 'block', opacity, overflow: 'visible' }}
    >
      <VineBranch spec={WREATH_LEFT} delay={0.1} tone={t} />
      <VineBranch spec={mirror(WREATH_LEFT, 100)} delay={0.26} tone={t} />
      {/* Knoten am Fuß */}
      <g transform="translate(100 191)">
        <path
          className="vine-leaf"
          d="M0 -7 L6 0 L0 7 L-6 0 Z"
          fill={t.drupe}
          style={{ animationDelay: '2.5s' }}
        />
      </g>
    </svg>
  )
}

// ── Mäander-Fries (griechischer Schlüssel) ────────────────────────────────────

/**
 * Laufender Mäander als Zierband. `id` muss pro Instanz eindeutig sein,
 * weil SVG-Pattern-IDs global im Dokument gelten.
 *
 * Die Kachel ist absichtlich 20×16 groß: unter etwa 16px Höhe verschwindet
 * die Spirale des Schlüssels und das Band wirkt nur noch wie eine Punktreihe.
 */
export function MeanderFrieze({
  id,
  color = C.ink,
  opacity = 0.24,
}: {
  id: string
  color?: string
  opacity?: number
}) {
  return (
    <svg aria-hidden width="100%" height={16} style={{ display: 'block' }}>
      <defs>
        <pattern id={id} width={20} height={16} patternUnits="userSpaceOnUse">
          <path
            d="M1.5 14 H16.5 V2.5 H6 V10 H11.5"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="square"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  )
}
