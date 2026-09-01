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

/**
 * Lanzettliches Olivenblatt: Basis auf (0,0), Spitze auf (len,0).
 * `wf` steuert die Schlankheit — 0.13 ergibt schmale Weidenblätter,
 * 0.24 breite, fleischige.
 */
function leafPath(len: number, wf = 0.19): string {
  const w = len * wf
  // gerundet ausgegeben: hält das Markup kurz und immun gegen Rundungsreste
  const n = (v: number) => v.toFixed(2)
  return (
    `M 0 0 C ${n(len * 0.26)} ${n(-w * 1.05)}, ${n(len * 0.72)} ${n(-w * 0.92)}, ${n(len)} 0 ` +
    `C ${n(len * 0.72)} ${n(w * 0.8)}, ${n(len * 0.26)} ${n(w * 0.95)}, 0 0 Z`
  )
}

/**
 * Deterministische Streuung aus Zweig- und Blattindex.
 *
 * Bewusst ein Integer-Hash (Math.imul, XOR, Shift) und NICHT der übliche
 * `fract(sin(x) * k)`: transzendente Funktionen sind in ECMAScript
 * ausdrücklich implementation-approximated — Node und Browser dürfen in den
 * letzten Bits abweichen. Das reicht für abweichende Pfad-Strings und damit
 * für einen Hydration-Mismatch. 32-Bit-Ganzzahlarithmetik ist dagegen exakt
 * spezifiziert und liefert überall dasselbe Bitmuster.
 */
function wobble(seed: number, spread: number) {
  let h = Math.imul(seed | 0, 0x27d4eb2d)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return (((h >>> 0) / 0xffffffff) * 2 - 1) * spread
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
  /** Blattbreite relativ zur Länge (0.13 schmal … 0.24 breit) */
  leafW?: number
  /** Streuung der Blattlänge in Prozent (0.2 = ±20%) */
  vary?: number
  /** Wiege-Variante a|b|c — unterschiedliche Dauer und Amplitude */
  sway?: 'a' | 'b' | 'c'
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

function VineBranch({
  spec,
  delay,
  tone,
  swaying = true,
}: {
  spec: BranchSpec
  delay: number
  tone: Tone
  /** Aus für dauerhaft gemountete, GEMASKTE Ranken (siehe OliveVines-Prop
      `swaying` unten) — die unendliche Wiege-Schleife läuft sonst für den
      Rest der Seitenlebensdauer weiter. */
  swaying?: boolean
}) {
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
    leafW = 0.19,
    vary = 0.16,
    sway = 'a',
  } = spec

  const [ax, ay] = cu.p0
  const seed = (ax * 31 + ay * 17) | 0 // ganzzahlig, siehe wobble()

  return (
    <g
      className={swaying ? `vine-branch vine-sway-${sway}` : 'vine-branch'}
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
        // Verjüngung zur Spitze plus Streuung, damit keine zwei Blätter gleich sind
        const len = leafLen * (1 - taper * f) * (1 + wobble(seed + i, vary))
        const [x, y] = pointAt(cu, t)
        const rot = angleAt(cu, t) + side * (spread + wobble(seed + i * 3, 9))
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`}>
            <path
              className="vine-leaf"
              d={leafPath(len, leafW * (1 + wobble(seed + i * 5, 0.12)))}
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

/*
 * Jeder Zweig ein eigener Typ: ein schwerer Hauptzweig mit breiten Blättern,
 * ein drahtiger mit vielen schmalen, ein sparriger mit weit abstehenden, ein
 * kurzer zarter Trieb. Dazu streut jedes einzelne Blatt in Länge, Breite und
 * Winkel (siehe `vary` und `wobble`).
 *
 * JEDER Zweig trägt ein `tendril` — die Spirale am Ende ist der einzige
 * Abschluss, den ein Zweig überhaupt bekommt (er läuft sonst als bloßer
 * Stängel aus, ohne Blatt oder Verjüngung). Ohne sie wirkt ein Zweigende wie
 * abgerissen statt wie ein natürliches Auslaufen.
 *
 * Die rechte Seite ist bewusst KEINE Spiegelung der linken — eigene Kurven,
 * eigene Blattzahlen. Gespiegelt wirkte das Blattwerk wie eine Tapete.
 */
const LEFT: BranchSpec[] = [
  // schwerer Hauptzweig, breite Blätter
  {
    cu: { p0: [-30, 118], p1: [156, 52], p2: [292, 248], p3: [402, 468] },
    leaves: 17,
    leafLen: 40,
    leafW: 0.23,
    taper: 0.42,
    spread: 38,
    width: 2.2,
    vary: 0.2,
    drupes: [0.42, 0.68],
    tendril: { r: 22, turns: 1.35, dir: 1 },
    sway: 'a',
  },
  // drahtig, viele schmale Blätter
  {
    cu: { p0: [-22, 436], p1: [118, 502], p2: [236, 654], p3: [332, 862] },
    leaves: 27,
    leafLen: 21,
    leafW: 0.13,
    taper: 0.28,
    spread: 25,
    width: 1.0,
    vary: 0.24,
    tendril: { r: 10, turns: 1.15, dir: -1 },
    sway: 'b',
  },
  // sparrig, weit abstehende Blätter
  {
    cu: { p0: [88, -44], p1: [162, 92], p2: [178, 214], p3: [252, 352] },
    leaves: 11,
    leafLen: 31,
    leafW: 0.2,
    taper: 0.5,
    spread: 46,
    width: 1.5,
    vary: 0.18,
    drupes: [0.6],
    tendril: { r: 14, turns: 1.2, dir: -1 },
    sway: 'c',
  },
]

const RIGHT: BranchSpec[] = [
  // mittelschwer, flacher Bogen
  {
    cu: { p0: [548, 92], p1: [372, 44], p2: [214, 236], p3: [128, 452] },
    leaves: 14,
    leafLen: 36,
    leafW: 0.21,
    taper: 0.38,
    spread: 33,
    width: 1.9,
    vary: 0.19,
    drupes: [0.36, 0.62],
    tendril: { r: 19, turns: 1.45, dir: -1 },
    sway: 'b',
  },
  // langer, dünner Trieb bis nach unten
  {
    cu: { p0: [544, 452], p1: [430, 546], p2: [318, 668], p3: [196, 884] },
    leaves: 23,
    leafLen: 24,
    leafW: 0.15,
    taper: 0.34,
    spread: 28,
    width: 1.2,
    vary: 0.22,
    tendril: { r: 12, turns: 1.25, dir: 1 },
    sway: 'c',
  },
  // kurzer zarter Trieb oben
  {
    cu: { p0: [428, -50], p1: [386, 78], p2: [352, 176], p3: [296, 296] },
    leaves: 9,
    leafLen: 19,
    leafW: 0.17,
    taper: 0.3,
    spread: 30,
    width: 0.9,
    vary: 0.2,
    tendril: { r: 11, turns: 1.1, dir: 1 },
    sway: 'a',
  },
  // breiter Seitenast in mittlerer Höhe
  {
    cu: { p0: [556, 268], p1: [470, 336], p2: [400, 424], p3: [318, 556] },
    leaves: 12,
    leafLen: 28,
    leafW: 0.22,
    taper: 0.44,
    spread: 42,
    width: 1.4,
    vary: 0.17,
    tendril: { r: 15, turns: 1.3, dir: -1 },
    sway: 'a',
  },
]

/** Statisch (referenziert nur LEFT/RIGHT, beide schon Modul-Konstanten) —
    Modul-Ebene statt Neuanlage bei jedem OliveVines-Render. */
const VINE_SIDES = [
  { key: 'l', branches: LEFT, par: 'xMinYMid slice', pos: { left: 0 } },
  { key: 'r', branches: RIGHT, par: 'xMaxYMid slice', pos: { right: 0 } },
] as const

/**
 * Zwei Ranken-Vorhänge an den Seiten. Getrennte SVGs statt eines
 * durchgehenden, damit auf schmalen Viewports die Zweigbasen am Rand
 * stehen bleiben (`slice`) statt zu Miniaturen zu schrumpfen.
 */
export function OliveVines({
  tone = 'light',
  opacity = 0.9,
  width = 'clamp(112px, 26vw, 450px)',
  swaying = true,
  static: staticVines = false,
  sides = ['l', 'r'],
  maxBranches,
}: {
  tone?: 'light' | 'dark'
  opacity?: number
  width?: string
  /** Nur einzelne Ranken-Vorhänge zeigen statt beider Seiten — für
      abwechslungsreichere Platzierungen außerhalb des Hero (siehe
      VINE_VARIANTS in app-shell.tsx), wo dieselbe beidseitige Vollkachel auf
      jeder Seite sonst wie Tapete wirken würde. */
  sides?: Array<'l' | 'r'>
  /** Nur die ersten N Zweige je Seite (aus LEFT/RIGHT, siehe oben) statt
      aller — für eine sparsamere Variante auf Seiten, die schon andere
      Schmuckelemente tragen. */
  maxBranches?: number
  /**
   * `false` unterdrückt die endlose Wiege-Animation (siehe vine-sway-* in
   * vines.css) — die einmalige Wachs-Animation (Stängel/Blätter) bleibt
   * erhalten. Nötig für dauerhaft gemountete Ranken HINTER einem CSS-
   * `mask-image` (siehe InstrumentariumVines in LandingClient): eine Maske
   * zwingt den Browser, ihren gesamten Inhalt bei JEDER Änderung eines
   * Nachfahren neu zu kompositieren — bei einer für immer laufenden
   * Rotations-Schleife (16–22s, aber ENDLOS) heißt das dauerhaftes
   * Neuzeichnen, weit über die eigentliche Wachs-Animation hinaus, und
   * genau das macht sich als andauerndes Ruckeln bemerkbar, sobald diese
   * Ranken einmal ins Bild gescrollt sind — unabhängig von der aktuellen
   * Scrollposition. Der Hero (unmaskiert, siehe Aufrufstelle) behält die
   * Wiege-Bewegung, dort kostet sie den Browser praktisch nichts.
   *
   * Wird von `static` (siehe unten) ohnehin überschrieben — dort läuft
   * gar keine Animation mehr, das Wiegen eingeschlossen.
   */
  swaying?: boolean
  /**
   * `true`: keine Animation überhaupt — weder das einmalige Aufzeichnen
   * (Stängel/Blätter) noch das endlose Wiegen. Die Ranken erscheinen sofort
   * fertig gewachsen, wie ein normales Hintergrundbild. Für Ranken, die
   * ohnehin nur Dekoration sind und deren Wachs-Moment keinen erzählerischen
   * Wert hat (siehe InstrumentariumVines): spart die Paint-Kosten der
   * Draw-Animation UND — bei gemaskten Ranken — der Wiege-Schleife, ohne
   * dafür zwei separate Flags pflegen zu müssen.
   */
  static?: boolean
}) {
  const t = TONES[tone]

  return (
    <div
      aria-hidden
      className={staticVines ? 'vine-layer vine-layer-static' : 'vine-layer'}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}
    >
      {VINE_SIDES.filter(side => sides.includes(side.key)).map((side, si) => (
        <svg
          key={side.key}
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          preserveAspectRatio={side.par}
          style={{ position: 'absolute', top: 0, height: '100%', width, ...side.pos }}
        >
          {(maxBranches ? side.branches.slice(0, maxBranches) : side.branches).map((b, i) => (
            <VineBranch key={i} spec={b} delay={0.15 + i * 0.22 + si * 0.11} tone={t} swaying={swaying} />
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
