'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DashboardMock } from './DashboardMock'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight,
  CandlestickChart, Wallet, Landmark, ShoppingCart,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { C, F, SPACE, kicker } from './landing-tokens'
import './landing.css'
import { OliveVines, LaurelWreath, MeanderFrieze } from './olive-vines'
import { SmoothScrollProvider } from './SmoothScrollProvider'

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger)

// ── Bewegung ──────────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Fade-up beim Scrollen ins Bild.
 *
 * `initial` und `whileInView` sind bewusst immer beide gesetzt: schaltet man
 * eines davon auf `undefined` (etwa für reduzierte Bewegung), bleibt das schon
 * gesetzte Inline-`opacity: 0` stehen und der Abschnitt wird nie sichtbar.
 * Bei reduzierter Bewegung entfällt deshalb nur der Versatz, nicht der Zustand.
 */
function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  style?: React.CSSProperties
}) {
  const still = useReducedMotion()

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: still ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-72px' }}
      transition={{ duration: still ? 0.15 : 0.7, delay: still ? 0 : delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// ── Editorial-Bausteine ───────────────────────────────────────────────────────

/** Gesperrte Kapitälchen, optional mit flankierenden Haarlinien. */
function Kicker({
  children,
  color = C.inkSubtle,
  rules = false,
  ruleColor = C.rule,
  center = false,
}: {
  children: React.ReactNode
  color?: string
  rules?: boolean
  ruleColor?: string
  center?: boolean
}) {
  const label = (
    <span className="af-kicker" style={{ ...kicker, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
  if (!rules) return label
  const rule = (
    <span
      className="af-kicker-rule"
      style={{ height: '1px', width: 'clamp(24px, 8vw, 72px)', backgroundColor: ruleColor, flexShrink: 0 }}
    />
  )
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      {center && rule}
      {label}
      {rule}
    </div>
  )
}

/** Doppellinie mit Raute — klassischer Absatztrenner. */
function Lozenge({ color = C.rule, mark = C.goldInk }: { color?: string; mark?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
      <span
        style={{
          width: '6px',
          height: '6px',
          backgroundColor: mark,
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
    </div>
  )
}

function SectionHead({
  index,
  label,
  title,
  emphasis,
  lead,
  tone = 'light',
  align = 'center',
}: {
  index?: string
  label: string
  title: string
  emphasis?: string
  lead?: string
  tone?: 'light' | 'dark'
  align?: 'center' | 'left'
}) {
  const dark = tone === 'dark'
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? '760px' : undefined,
        margin: align === 'center' ? '0 auto' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', marginBottom: '22px' }}>
        <Kicker
          rules
          center={align === 'center'}
          color={dark ? C.onSubtle : C.inkSubtle}
          ruleColor={dark ? C.ruleOn : C.rule}
        >
          {index ? `${index} · ${label}` : label}
        </Kicker>
      </div>
      <h2
        className="af-balance"
        style={{
          fontFamily: F.display,
          fontWeight: 400,
          fontSize: 'clamp(26px, 3.6vw, 44px)',
          lineHeight: 1.1,
          letterSpacing: '-0.015em',
          color: dark ? C.onCream : C.ink,
          margin: 0,
        }}
      >
        {title}
        {emphasis && (
          <>
            <br />
            <em style={{ fontStyle: 'italic', color: dark ? C.gold : C.goldInk }}>{emphasis}</em>
          </>
        )}
      </h2>
      {lead && (
        <p
          className="af-balance"
          style={{
            fontFamily: F.serif,
            fontSize: 'clamp(14px, 1.3vw, 16px)',
            lineHeight: 1.8,
            color: dark ? C.onBody : C.inkBody,
            marginTop: '20px',
            maxWidth: '600px',
            marginLeft: align === 'center' ? 'auto' : 0,
            marginRight: align === 'center' ? 'auto' : 0,
          }}
        >
          {lead}
        </p>
      )}
    </div>
  )
}

// ── Miniatur-Visualisierungen ─────────────────────────────────────────────────

/** Tonstufen für Ausgaben-Heatmaps — von Parchment zu Terrakotta. */
const CLAY = ['#EBE4D6', '#DFC9B8', '#D0A691', '#BE846C', '#B16A50', '#A9553C']
const HEAT = [0,1,2,3,2,1,1,3,4,5,3,2,0,2,5,4,3,1,1,3,5,4,2,1,0,1,3,4,2,0,1,2,3,4,3,2]

function MiniHeatmap({ cols = 6, cell = 12 }: { cols?: number; cell?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '3px' }}>
      {HEAT.map((v, i) => (
        <div key={i} style={{ height: `${cell}px`, backgroundColor: CLAY[v] }} />
      ))}
    </div>
  )
}

function MiniSparkline({ stroke = C.olive }: { stroke?: string }) {
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

function MiniDonut({ size = 76 }: { size?: number }) {
  const segs = [
    { color: C.gold, len: 62 },
    { color: C.olive, len: 40 },
    { color: C.graphite, len: 23 },
  ]
  let offset = 0
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <circle cx="40" cy="40" r="30" fill="none" stroke={C.creamDeep} strokeWidth="9" />
      {segs.map((s, i) => {
        const dash = `${s.len} 125`
        const el = (
          <circle
            key={i}
            cx="40"
            cy="40"
            r="30"
            fill="none"
            stroke={s.color}
            strokeWidth="9"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        )
        offset += s.len + 2
        return el
      })}
    </svg>
  )
}

function MiniStrategy() {
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

// ── Gebogenes Kennzahlen-Band ─────────────────────────────────────────────────

const STATS = [
  { value: '360°', label: 'Finanzüberblick' },
  { value: '8+', label: 'Analysetools' },
  { value: '∞', label: 'Transaktionen' },
  { value: '24/7', label: 'Echtzeitdaten' },
]

/*
 * Alle Kurven des Bandes teilen dieselbe x-Kubik und unterscheiden sich nur in
 * y — der vertikale Versatz genügt bei dieser flachen Biegung und hält Kanten,
 * Schriftlinien und Friese exakt parallel.
 *
 * Die Kurven laufen von x=-140 bis x=1580, also über den viewBox-Rand hinaus:
 * so werden die Bandenden links und rechts angeschnitten statt frei zu enden.
 */
const BX = [-140, 320, 1120, 1580] as const
const Y_TOP = [225, 15, 15, 225] as const
const Y_BOTTOM = [375, 165, 165, 375] as const
const Y_VALUE = [300, 90, 90, 300] as const
const Y_LABEL = [332, 122, 122, 332] as const
const Y_FRIEZE_TOP = [241, 31, 31, 241] as const
const Y_FRIEZE_BOTTOM = [359, 149, 149, 359] as const

type Cub = readonly [number, number, number, number]

const cub = (a: Cub, t: number) => {
  const m = 1 - t
  return m * m * m * a[0] + 3 * m * m * t * a[1] + 3 * m * t * t * a[2] + t * t * t * a[3]
}
const dcub = (a: Cub, t: number) => {
  const m = 1 - t
  return 3 * m * m * (a[1] - a[0]) + 6 * m * t * (a[2] - a[1]) + 3 * t * t * (a[3] - a[2])
}
const curveD = (ys: Cub) =>
  `M ${BX[0]} ${ys[0]} C ${BX[1]} ${ys[1]}, ${BX[2]} ${ys[2]}, ${BX[3]} ${ys[3]}`

/** t-Parameter zu einer x-Koordinate — die x-Kubik ist monoton, Bisektion genügt. */
function tAtX(x: number) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (cub(BX, mid) < x) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Ein Mäander-Schlüssel, um den Ursprung zentriert (Kachel 20×16), damit ihn
 * `rotate()` um seine Mitte dreht.
 */
const MEANDER_KEY = 'M -9 2.5 H 0.5 V -6.5 H -6 V -0.5 H -2.5'

/**
 * Setzt Mäander-Kacheln in gleichmäßigem Bogenlängen-Abstand entlang einer
 * Kurve und dreht jede in die Tangente.
 *
 * Ein SVG-<pattern> ginge hier nicht: dessen Kacheln stehen achsparallel im
 * Nutzerkoordinatensystem, würden also über die steigende Kurve hinweg
 * unterschiedlich angeschnitten. Einzeln gesetzte Kacheln folgen der Biegung.
 */
function meanderAlong(ys: Cub, step = 21) {
  const samples = 900
  const pts: { x: number; y: number; a: number }[] = []
  let acc = 0
  let next = step / 2
  let px = cub(BX, 0)
  let py = cub(ys, 0)
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const x = cub(BX, t)
    const y = cub(ys, t)
    // Math.sqrt ist per IEEE-754 exakt spezifiziert, Math.hypot nicht — und
    // die Summe entscheidet, wie viele Mäanderkacheln gesetzt werden.
    const dx = x - px
    const dy = y - py
    acc += Math.sqrt(dx * dx + dy * dy)
    if (acc >= next) {
      pts.push({
        x,
        y,
        a: (Math.atan2(dcub(ys, t), dcub(BX, t)) * 180) / Math.PI,
      })
      next += step
    }
    px = x
    py = y
  }
  return pts
}

const FRIEZE_TOP_KEYS = meanderAlong(Y_FRIEZE_TOP)
const FRIEZE_BOTTOM_KEYS = meanderAlong(Y_FRIEZE_BOTTOM)

/** Positionen der vier Kennzahlen als Anteil der Pfadlänge. */
const STAT_OFFSETS = ['22%', '40.7%', '59.3%', '78%']

/** Tragende Säulen: x-Position im viewBox, Höhe, Seitenverhältnis der Grafik. */
const PROP_COLUMNS = [150, 1290]
const PROP_H = 265
const PROP_W = PROP_H * (102 / 332) // Seitenverhältnis von column-tuscan.svg

/**
 * Das Kennzahlen-Band als gebogener Streifen, getragen von zwei Säulen —
 * Text und Mäanderfriese folgen der Kurve.
 *
 * Nur ab 1100px im Einsatz (CSS blendet um): das SVG skaliert als Ganzes mit
 * der Breite, die Schrift also mit. Darunter wird sie unleserlich, dort
 * übernimmt das flache Band.
 */
function CurvedStatsBand() {
  const warm = { filter: 'sepia(.42) saturate(.52) brightness(1.04) contrast(.96)' }

  return (
    <svg
      className="stats-arc"
      viewBox="0 0 1440 545"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="360 Grad Finanzüberblick, über 8 Analysetools, unbegrenzte Transaktionen, Echtzeitdaten rund um die Uhr"
    >
      <defs>
        <path id="af-stat-value" d={curveD(Y_VALUE)} />
        <path id="af-stat-label" d={curveD(Y_LABEL)} />
      </defs>

      {/* Säulen zuerst, damit das Band optisch auf ihnen aufliegt */}
      {PROP_COLUMNS.map((x) => {
        const yTop = cub(Y_BOTTOM, tAtX(x)) - 8
        return (
          <image
            key={x}
            href="/column-tuscan.svg"
            x={x - PROP_W / 2}
            y={yTop}
            width={PROP_W}
            height={PROP_H}
            style={warm}
          />
        )
      })}

      {/* Bandfläche: Oberkante hin, Unterkante zurück */}
      <path
        d={`${curveD(Y_TOP)} L ${BX[3]} ${Y_BOTTOM[3]} C ${BX[2]} ${Y_BOTTOM[2]}, ${BX[1]} ${Y_BOTTOM[1]}, ${BX[0]} ${Y_BOTTOM[0]} Z`}
        fill={C.onyx}
      />

      {/* Haarlinien auf beiden Kanten */}
      {[Y_TOP, Y_BOTTOM].map((ys, i) => (
        <path key={i} d={curveD(ys)} fill="none" stroke={C.cream} strokeWidth={1.5} opacity={0.28} />
      ))}

      {/* Mäanderfriese, der Biegung folgend */}
      <g fill="none" stroke={C.cream} strokeWidth={1.4} strokeLinecap="square" opacity={0.26}>
        {[...FRIEZE_TOP_KEYS, ...FRIEZE_BOTTOM_KEYS].map((p, i) => (
          <path
            key={i}
            d={MEANDER_KEY}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.a.toFixed(1)})`}
          />
        ))}
      </g>

      {STATS.map((s, i) => (
        <g key={s.label}>
          <text
            fill={C.cream}
            fontFamily={F.display}
            fontSize={36}
            letterSpacing="-0.02em"
            textAnchor="middle"
          >
            <textPath href="#af-stat-value" startOffset={STAT_OFFSETS[i]}>
              {s.value}
            </textPath>
          </text>
          <text
            fill={C.onSubtle}
            fontFamily={F.sans}
            fontSize={11.5}
            fontWeight={600}
            letterSpacing="0.2em"
            textAnchor="middle"
          >
            <textPath href="#af-stat-label" startOffset={STAT_OFFSETS[i]}>
              {s.label.toUpperCase()}
            </textPath>
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Giebel-Enthüllung ─────────────────────────────────────────────────────────

/** Scrollweg der Szene. 100vh davon sind Haltestrecke nach dem Öffnen. */
const SCENE_VH = 260
/** Anteil des Scrollwegs, über den sich der Giebel öffnet — der Rest hält. */
const OPEN_AT = 0.72
/**
 * Vorzieh-Überlappung in den Hero hinein: die Szene beginnt bereits, während
 * noch ein Rest des Hero sichtbar ist, statt erst nach dessen vollständigem
 * Verschwinden. Negativer margin-top auf die Szene zieht ihren Startpunkt um
 * diesen Betrag nach oben — sie überlappt den unteren Rand des Hero, ohne
 * dessen eigene Höhe oder Inhalte zu verändern.
 */
const PULL_INTO_HERO_VH = 42

/**
 * Ein Tempelgiebel wächst beim Scrollen aus der Bildschirmmitte und gibt das
 * Dashboard frei.
 *
 * Alle drei Eckpunkte laufen bei v=0 in einem einzigen Punkt in der
 * Bildschirmmitte (50%, 50%) zusammen — ein Dreieck der Größe null. Mit
 * wachsendem v spreizen sie sich symmetrisch um diesen Mittelpunkt: die
 * Spitze nach oben, die Basis nach unten und seitlich. So wächst die Form
 * sichtbar aus der Mitte, statt von der unteren Bildschirmkante aus
 * hochzuwachsen.
 *
 * Q=167 für Spitze, Basis-Höhe und Basis-Breite gleichermaßen: bei v=1 steht
 * die Spitze 117 Einheiten über der oberen Kante, die Basis ebenso weit
 * unter der unteren — nötig, weil ein Dreieck, dessen Ecken exakt auf den
 * Viewport-Ecken liegen, die Fläche NICHT abdeckt (die schrägen Kanten
 * schneiden die oberen Ecken weg).
 *
 * Der Wert 167 ist kein Zufallsgriff, sondern gegen die volle Bildbreite auf
 * Höhe der Viewport-Oberkante gelöst (dort ist die Deckung am spätesten
 * erreicht, weil die Spitze am weitesten von der sich verbreiternden Basis
 * entfernt ist). Ein erster Versuch mit größeren, ungleichen Werten deckte
 * den Bildschirm schon bei v≈0.33 komplett ab — das ließ die Wachstums-
 * Animation über den Rest des Scrollwegs wie eingefroren wirken, weil bis
 * v=1 optisch nichts mehr passierte. Mit Q=167 ist die Oberkante erst bei
 * v≈0.9 vollständig gedeckt: das Wachstum bleibt über fast den gesamten
 * Öffnungsweg sichtbar.
 */
const Q = 167

/**
 * Fries und Kranz sind FEST sichtbar, ohne jede Fade-in-Animation — auch
 * ganz am Anfang, bevor ScrollTrigger überhaupt zu zählen beginnt. Eine an
 * scrollYProgress/GSAP gekoppelte Einblendung hätte hier immer eine
 * Totzone: ScrollTrigger startet erst bei `start:'top top'`, also erst
 * PULL_INTO_HERO_VH Scroll-vh NACH Seitenanfang der Szene — bis dahin bliebe
 * die Fläche leer, obwohl beide Elemente längst gefahrlos sichtbar sein
 * könnten. Stattdessen positioniert sich die Gruppe per Layout knapp
 * UNTERHALB der Hero-Überlappung (siehe .pediment-intro-Style unten) — schon
 * bei Progress 0 außerhalb der Zone, die während der Überlappung transparent
 * bleiben muss.
 *
 * Blendet dann schnell aus (plus kleiner Lift nach oben), statt in der
 * gepinnten Fläche stehen zu bleiben, bis der wachsende Giebel sie einfach
 * unter sich begräbt: eine sticky-gepinnte Sektion hält den Viewport per
 * Definition fest, ein normales "wegscrollen" gibt es darin nicht.
 *
 * Ein GESTES Wegscrollen (nur Bewegung, keine Blende) würde hier nicht
 * reichen: der Giebel wächst aus der exakten Bildschirmmitte mit fester Rate
 * Q/OPEN_AT (siehe Kommentar dort) — seine Spitze rast beim Scrollen schneller
 * nach oben, als eine ruhig wirkende Bewegung der Gruppe je mitziehen könnte.
 * Jeder Versuch, „davonzulaufen“, sähe entweder abgehackt aus oder würde die
 * Gruppe ohnehin wieder einholen. Der Ausweg: VOR Progress ≈0,029 (dort
 * erreicht die Giebelspitze rechnerisch erstmals die Fries-Position) ist die
 * Gruppe schon unsichtbar — das Ausblenden gewinnt das Rennen gegen das
 * Wachstum, statt es zu verlieren.
 *
 * INTRO_EXIT_FOR bewusst klein genug gewählt, dass die Bewegungsrate unter
 * der Schließrate der Hero-Überlappungszone bleibt (1440 %-Einheiten je
 * Progress-Einheit) — sonst reißt die Gruppe kurz in die Zone hinein, die
 * währenddessen noch transparent bleiben muss (siehe FADE_IN_AT-Historie).
 */
const INTRO_EXIT_FOR = 0.025
const CUE_FADE_OUT_AT = 0.05
const CUE_FADE_OUT_FOR = 0.07

const clipPathAt = (v: number) =>
  `polygon(50% ${50 - Q * v}%, ${50 - Q * v}% ${50 + Q * v}%, ${50 + Q * v}% ${50 + Q * v}%)`

function PedimentReveal() {
  const still = useReducedMotion()
  const sceneRef = useRef<HTMLElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLDivElement>(null)

  // Zahlen und Balken erst starten, wenn der Giebel weit genug offen ist
  const [run, setRun] = useState(false)

  /*
   * Getrieben von GSAP ScrollTrigger statt Framer-Motion-Scroll-Hooks (siehe
   * scroll-storytelling-Skill, Muster „Pin-and-play“): die Kopplung an Lenis
   * (siehe SmoothScrollProvider) hält das Beschneiden exakt synchron zum
   * sichtbaren, gedämpften Scroll. `scrub: true` bindet den Fortschritt
   * direkt an die Scrollposition statt an einen einmaligen Trigger — beim
   * Zurückscrollen läuft alles exakt rückwärts.
   *
   * clip-path wird bewusst nicht direkt von GSAP getweent, sondern über eine
   * numerische Zwischengröße `state.v` plus manuellem `onUpdate`: die
   * String-Interpolation eines mehrteiligen polygon() ist kein Fall, den
   * GSAPs CSS-Plugin zuverlässig abdeckt, ein Zahlenwert schon.
   */
  useEffect(() => {
    if (still) return
    const scene = sceneRef.current
    const clip = clipRef.current
    if (!scene || !clip) return

    const state = { v: 0 }
    let hasRun = false

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: scene,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
      },
    })

    if (cueRef.current) {
      tl.to(cueRef.current, { opacity: 0, ease: 'none', duration: CUE_FADE_OUT_FOR }, CUE_FADE_OUT_AT)
    }
    // Blendet ab Progress 0 aus — siehe Kommentar oben, das Ausblenden muss
    // vor dem Giebelwachstum fertig sein, nicht danach ansetzen.
    if (introRef.current) {
      tl.to(introRef.current, { y: -30, opacity: 0, ease: 'none', duration: INTRO_EXIT_FOR }, 0)
    }
    tl.to(
      state,
      {
        v: 1,
        duration: OPEN_AT,
        ease: 'none',
        onUpdate: () => {
          clip.style.clipPath = clipPathAt(state.v)
          // früh auslösen: der Giebel gibt schon ab ~10 % Fläche frei, ein
          // noch totes Dashboard dahinter (Balken auf 0, Zahlen bei 0) sähe
          // leer aus
          if (!hasRun && state.v > 0.06) {
            hasRun = true
            setRun(true)
          }
        },
      },
      0,
    )
    // Halteweg: Füll-Tween ohne Wirkung, damit die Timeline-Gesamtdauer dem
    // vollen Scrollbereich entspricht statt nach OPEN_AT abzubrechen.
    tl.to({}, { duration: 1 - OPEN_AT })

    return () => {
      tl.scrollTrigger?.kill()
      tl.kill()
    }
  }, [still])

  /*
   * Bei reduzierter Bewegung entfällt die gesamte Pinning-Mechanik: kein
   * überlanger Abschnitt, kein Scroll-gesteuertes Beschneiden. Das Dashboard
   * steht einfach da. Scroll-Jacking ist für Betroffene besonders unangenehm,
   * weil es die erwartete Scrollstrecke verfälscht.
   */
  if (still) {
    return (
      <section style={{ height: '100svh', position: 'relative', backgroundColor: C.onyxWarm }}>
        <DashboardMock run />
      </section>
    )
  }

  return (
    <section
      ref={sceneRef}
      style={{
        height: `${SCENE_VH}vh`,
        position: 'relative',
        marginTop: `-${PULL_INTO_HERO_VH}vh`,
        /*
         * pointer-events:none auf einem Kind macht nur DIESES Kind und seine
         * eigenen Nachfahren für Klicks durchsichtig — die äußere <section>
         * selbst bleibt eine eigene, hit-testbare Box (260vh hoch, per
         * negativem margin-top über den Hero gezogen) und fängt Klicks in
         * der Überlappungszone weiterhin ab, obwohl visuell nichts davon zu
         * sehen ist. Muss deshalb HIER zusätzlich gesetzt werden, nicht nur
         * auf dem inneren Sticky-Wrapper (siehe elementFromPoint-Check: ohne
         * dies landete der Klick auf der leeren <section>, nie am Button).
         */
        pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'sticky', top: 0, height: '100svh', overflow: 'hidden' }}>
        {/*
          Zierfüllung für den Moment, bevor der Giebel genug Fläche freigibt —
          fest sichtbar von Anfang an, keine Fade-in-Logik (siehe Kommentar
          oben). `top` per Inline-Style statt CSS-Klasse: muss exakt an
          PULL_INTO_HERO_VH gekoppelt bleiben, damit die Gruppe nie in die
          Zone rutscht, die während der Hero-Überlappung transparent bleiben
          muss, egal wie diese Konstante später angepasst wird.
        */}
        <div
          ref={introRef}
          className="pediment-intro"
          style={{ top: `calc(${PULL_INTO_HERO_VH}vh + 12px)` }}
          aria-hidden
        >
          <MeanderFrieze id="frieze-pediment-top" color={C.ink} opacity={0.14} />
          <LaurelWreath size={230} tone="light" opacity={0.2} />
        </div>

        {/* Kleiner Scroll-Hinweis — liegt ebenfalls außerhalb der Überlappungszone */}
        <div ref={cueRef} className="pediment-cue" aria-hidden>
          <span className="pediment-cue-label" style={{ ...kicker, fontSize: '10px', color: C.inkSubtle }}>
            Scroll
          </span>
          <span className="pediment-cue-line" />
        </div>

        <div
          ref={clipRef}
          style={{ position: 'absolute', inset: 0, clipPath: clipPathAt(0), willChange: 'clip-path' }}
        >
          <DashboardMock run={run} />
          {/* weicher Auslauf nach unten ins Parchment — dieselbe Idee wie die
              Kuppel im Hero, damit die dunkle Fläche nicht hart abbricht */}
        </div>
      </div>
    </section>
  )
}

// ── Inhalt ────────────────────────────────────────────────────────────────────

type Feature = {
  title: string
  desc: string
  icon: React.ReactNode
  status?: string
  tags: string[]
  wide?: boolean
  visual?: React.ReactNode
}

/*
 * Reihenfolge erzeugt einen Zickzack: breit/schmal — schmal/breit — breit/schmal
 * — schmal/breit. Die breite Karte wechselt so von Reihe zu Reihe die Seite,
 * statt eine starre Spalte zu bilden. Bei `grid-auto-flow: row` ergibt sich das
 * allein aus der Sequenz, ohne explizite Spaltenzuweisung.
 *
 * Das Verhältnis muss aufgehen: vier `wide`-Karten (2 Spalten) plus vier
 * schmale sind genau 12 Zellen und damit im dreispaltigen Raster vier
 * lückenlose Reihen. Stimmt es nicht, bleibt eine Zelle leer und die
 * Rasterlinien zeigen ein Loch.
 */
const FEATURES: Feature[] = [
  {
    title: 'Ausgaben-Analyse',
    desc: 'Heatmap, GuV-Chart und Cashflow-Kalender — alle aus echten Transaktionsdaten berechnet.',
    icon: <BarChart2 size={17} strokeWidth={1.6} />,
    status: 'Live',
    tags: ['Heatmap', 'GuV', 'Kalender'],
    wide: true,
    visual: <MiniHeatmap cols={12} cell={14} />,
  },
  {
    title: 'Vertrags-Management',
    desc: 'Alle Abos und Daueraufträge im Blick. Wiederkehrende Zahlungen buchen sich selbst.',
    icon: <FileText size={17} strokeWidth={1.6} />,
    tags: ['Abos', 'Daueraufträge'],
  },
  {
    title: 'Sparziele & Pläne',
    desc: 'Ziele definieren, Fortschritt verfolgen, Sparpläne automatisieren.',
    icon: <Target size={17} strokeWidth={1.6} />,
    tags: ['Ziele', 'Sparpläne'],
  },
  {
    title: 'Portfolio-Tracking',
    desc: 'Depot und Crypto in einer Ansicht, mit Kurs-Updates und Rebalancing-Vorschlägen.',
    icon: <TrendingUp size={17} strokeWidth={1.6} />,
    status: 'Live',
    tags: ['Depot', 'Crypto', 'Kurse'],
    wide: true,
    visual: <MiniDonut />,
  },
  {
    title: 'Strategie & Backtesting',
    desc: 'TPI-Analyse, eigene Indikatoren und vollautomatisierte Backtests für fundierte Entscheidungen.',
    icon: <CandlestickChart size={17} strokeWidth={1.6} />,
    status: 'Beta',
    tags: ['TPI', 'Indikatoren', 'Backtest'],
    wide: true,
    visual: <MiniStrategy />,
  },
  {
    title: 'Multi-Währung',
    desc: 'EUR, USD, CHF — automatische Umrechnung mit Echtzeit-Kursen.',
    icon: <Globe size={17} strokeWidth={1.6} />,
    tags: ['EUR', 'USD', 'CHF'],
  },
  {
    title: 'Banking-Sync',
    desc: 'FinTS-Anbindung für den automatischen Kontoimport direkt aus der Bank.',
    icon: <Landmark size={17} strokeWidth={1.6} />,
    status: 'Live',
    tags: ['FinTS', 'HBCI'],
  },
  {
    title: 'Lebenshaltungskosten',
    desc: 'Berechnet das nötige Mindestgehalt auf Basis realer Lebenshaltungskosten.',
    icon: <ShoppingCart size={17} strokeWidth={1.6} />,
    tags: ['Budget', 'Kalkulation'],
    wide: true,
    visual: <MiniSparkline />,
  },
]

/**
 * Die vier Säulen — jede in einer eigenen klassischen Ordnung, von der
 * schlichtesten zur reichsten (toskanisch → dorisch → ionisch → korinthisch).
 * Die Bilddateien liegen in public/ und stammen aus dem Figma-Export.
 */
const PILLARS = [
  {
    num: 'I',
    src: '/column-tuscan.svg',
    w: 102,
    h: 332,
    title: 'Überblick',
    desc: 'Konten, Depots und Verträge stehen in einer Ansicht — kein Wechseln zwischen Portalen.',
  },
  {
    num: 'II',
    src: '/column-doric.svg',
    w: 95,
    h: 330,
    title: 'Präzision',
    desc: 'Jede Zahl stammt aus einer echten Buchung. Keine Schätzung, keine Hochrechnung.',
  },
  {
    num: 'III',
    src: '/column-ionic.svg',
    w: 115,
    h: 332,
    title: 'Regeln',
    desc: 'Wiederkehrendes bucht sich selbst, Strategien folgen definierten Indikatoren.',
  },
  {
    num: 'IV',
    src: '/column-corinthian.svg',
    w: 101,
    h: 330,
    title: 'Historie',
    desc: 'Jede Buchung bleibt erhalten — Vergleiche über Jahre statt Momentaufnahmen.',
  },
]

const STEPS = [
  {
    num: 'I',
    icon: <ShieldCheck size={20} strokeWidth={1.5} />,
    title: 'Anmelden',
    desc: 'Zugang mit E-Mail und Passwort. Jeder Datensatz bleibt an das eigene Konto gebunden.',
  },
  {
    num: 'II',
    icon: <Wallet size={20} strokeWidth={1.5} />,
    title: 'Daten einrichten',
    desc: 'Konten, Transaktionen, Verträge und Portfolios nach eigenem Bedarf konfigurieren.',
  },
  {
    num: 'III',
    icon: <TrendingUp size={20} strokeWidth={1.5} />,
    title: 'Überblick behalten',
    desc: 'Alle Finanzdaten in einem übersichtlichen Dashboard — jederzeit, von überall.',
  },
]

const EXTRAS = [
  { icon: <Repeat2 size={18} strokeWidth={1.5} />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
  { icon: <ShieldCheck size={18} strokeWidth={1.5} />, title: 'Datenschutz', desc: 'Deine Daten bleiben deine. Keine Weitergabe, kein Tracking.' },
  { icon: <Globe size={18} strokeWidth={1.5} />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — auf Desktop, Tablet und Mobil.' },
  { icon: <Zap size={18} strokeWidth={1.5} />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
]

const SHELL: React.CSSProperties = {
  maxWidth: '1160px',
  margin: '0 auto',
  padding: `0 ${SPACE.gutter}`,
}

// ── Seite ─────────────────────────────────────────────────────────────────────

export function LandingClient() {
  return (
    <SmoothScrollProvider>
    <div
      className="af-landing"
      style={{
        position: 'relative',
        backgroundColor: C.parchment,
        color: C.ink,
        minHeight: '100vh',
        fontFamily: F.sans,
        /*
         * `clip` statt `hidden`: hidden auf einer Achse rechnet die andere auf
         * `auto` hoch und macht dieses Div damit zum Scroll-Container — die
         * sticky Navigationsleiste klebt dann an ihm statt am Viewport und
         * scrollt mit weg. `clip` beschneidet ohne Scrollport.
         */
        overflowX: 'clip',
      }}
    >
      {/*
        Die Ranken liegen absichtlich AUSSERHALB des Hero und über der
        Navigationsleiste (z-index 60 gegen deren 50) — sie sollen die Leiste
        überwachsen. Läge die Schicht im Hero, würde dessen overflow:hidden sie
        an der Oberkante abschneiden.
      */}
      <div className="vine-layer-over" aria-hidden>
        <OliveVines tone="light" opacity={0.62} />
      </div>

      {/*
        ══ NAV ══
        Liegt `absolute` über dem Hero und scrollt normal mit weg — nicht
        mehr `fixed`. Dadurch reicht das Aquarell weiter bis an die
        Seitenoberkante, die Leiste bleibt aber dauerhaft transparent, weil
        sie nie über anderem Inhalt als dem Hero steht.
      */}
      <header className="site-header">
        <div
          style={{
            ...SHELL,
            height: '66px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/"
            className="nav-brand"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}
          >
            <Logo variant="dark" size={30} priority />
            <span
              className="nav-wordmark"
              style={{
                fontFamily: F.display,
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '0.005em',
                color: C.ink,
                whiteSpace: 'nowrap',
              }}
            >
              Athena Finance
            </span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 32px)' }}>
            <a
              href="#features"
              className="af-quiet nav-link"
              style={{ ...kicker, fontSize: '11px', color: C.inkSubtle, whiteSpace: 'nowrap' }}
            >
              Instrumentarium
            </a>
            <Link href="/login" className="af-btn hero-btn-primary nav-cta" style={{ padding: '11px 22px' }}>
              Anmelden
            </Link>
          </nav>
        </div>
        <div className="af-dentil" />
      </header>

      {/* ══ HERO ══ */}
      {/*
        Der Hero füllt bewusst den ganzen Viewport: die Dashboard-Vorschau
        soll erst beim Scrollen auftauchen. Die Leiste ist jetzt `fixed` statt
        `absolute` (siehe .site-header) und reserviert deshalb keinen Platz mehr
        im Fluss — der Hero beginnt an der echten Seitenoberkante, damit das
        Bild hinter der anfangs transparenten Leiste sichtbar ist. Der fehlende
        Abstand kommt hier über paddingTop zurück (Leistenhöhe + der alte
        Wert), die Überschrift steht dadurch optisch an derselben Stelle wie
        zuvor. Lead, Buttons und Zeile darunter rutschen als Gruppe an den
        unteren Rand (siehe .hero-foot).
      */}
      <section
        className="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          paddingTop: 'calc(var(--af-nav-h) + clamp(52px, 10vh, 132px))',
          paddingBottom: 'clamp(34px, 5vh, 60px)',
        }}
      >
        {/* Aquarell-Landschaft, vollflächig und unverändert (siehe .hero-photo) */}
        <div className="hero-photo" aria-hidden>
          <Image
            src="/hero-landscape.avif"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-photo-img"
          />
        </div>

        {/*
          Athena auf ionischem Kapitell, rechts im Hero. In Originalfarben wie
          das Aquarell. Unter 900px ausgeblendet — dort steht die Textspalte auf
          voller Breite und es bleibt kein Platz neben ihr.
        */}
        <Image
          src="/athena-statue.svg"
          alt=""
          aria-hidden
          width={95}
          height={142}
          unoptimized
          className="hero-athena"
        />

        {/* Weißer Halbkreis, der von der Unterkante aufsteigt — siehe .hero-dome */}
        <div className="hero-dome" aria-hidden>
          {/* Mäanderfries als Gesimslinie auf dem Trichter-Rand — dasselbe
              Zierelement wie das Gebälk in der Säulen-Sektion, hier auf dem
              „Podest" der Hero-Aktionen statt auf einem Onyx-Band. Sitzt
              exakt auf der oberen Kante des clip-path-Trichters (20% der
              Kuppelhöhe), der Rest der Kuppel bleibt schlicht. */}
          <span className="hero-dome-frieze">
            <MeanderFrieze id="frieze-hero-dome" color={C.ink} opacity={0.16} />
          </span>
        </div>

        <div className="hero-shell" style={{ ...SHELL, position: 'relative', textAlign: 'center' }}>
          <div
            className="af-rise"
            style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}
          >
            {/* dunkler als sonst: über dem Bild erreicht inkSubtle nur 2.9:1 */}
            <Kicker rules center color={C.ink} ruleColor="rgba(26,26,26,.35)">
              ΑTΗEΝΑ · Finanzen im Überblick
            </Kicker>
          </div>

          <h1
            className="af-balance af-rise"
            style={{
              animationDelay: '.1s',
              fontFamily: F.display,
              fontWeight: 400,
              fontSize: 'clamp(30px, 6.6vw, 80px)',
              lineHeight: 1.02,
              letterSpacing: '-0.022em',
              margin: '0 auto',
              maxWidth: '15ch',
              color: C.ink,
            }}
          >
            Finanzen im Griff.
            <br />
            <em style={{ fontStyle: 'italic', color: C.goldInkDeep }}>Vollständig überblickt.</em>
          </h1>

          {/* Aktionen und Trenner bilden eine Gruppe am unteren Rand */}
          <div className="hero-foot">
            <div
              className="af-rise cta-row"
              style={{
                animationDelay: '.22s',
                display: 'flex',
                gap: '14px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link href="/login" className="af-btn hero-btn-primary">
                Anmelden <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <a href="#features" className="af-btn hero-btn-outline">
                Das Instrumentarium
              </a>
            </div>

            <p
              className="af-rise af-micro"
              style={{
                ...kicker,
                animationDelay: '.34s',
                fontSize: '10px',
                /* inkSubtle statt inkFaint: bei 10px reicht inkFaint (3.4:1,
                   nur für ≥18px geeicht) nicht — die Zeile liegt jetzt auf der
                   weißen Kuppel (.hero-dome) und braucht 4.5:1 */
                color: C.inkSubtle,
                margin: 'clamp(22px, 3vw, 30px) 0 0',
              }}
            >
              Portfolio · Ausgaben · Verträge · Strategie
            </p>

            <div className="af-rise" style={{ animationDelay: '.46s', marginTop: 'clamp(26px, 4vh, 48px)' }}>
              <Lozenge />
            </div>
          </div>
        </div>
      </section>

      {/*
        ══ GIEBEL-ENTHÜLLUNG ══
        Ersetzt die frühere gerahmte Browserfenster-Vorschau: dasselbe
        Dashboard zweimal kurz hintereinander hätte die Wirkung des Effekts
        verpuffen lassen.

        Aufbau: die Szene ist SCENE_VH hoch, darin klebt ein Viewport-hoher
        Container. Beim Durchscrollen wächst ein Tempelgiebel (clip-path-
        Dreieck) über den Bildschirm und gibt das Dashboard frei. Der letzte
        Viertel des Scrollwegs ist bewusst Halteweg, damit das offene
        Dashboard einen Moment steht, bevor die Seite weiterläuft.
      */}
      <PedimentReveal />

      {/*
        ══ KENNZAHLEN (Onyx-Bogen) ══
        Kein Balken, sondern eine Kuppel über die volle Breite (siehe .arch).
        Der Mäanderfries lief vorher auch oben — eine gerade Borte kann der
        Wölbung nicht folgen, deshalb bleibt nur der untere. Die Bogenkante
        zeichnet stattdessen ein inset-Schatten nach.
      */}
      <section style={{ position: 'relative' }}>
        <CurvedStatsBand />

        {/* Flaches Band unter 960px — siehe Kommentar an CurvedStatsBand */}
        <div className="stats-flat" style={{ backgroundColor: C.onyx, position: 'relative' }}>
          <MeanderFrieze id="frieze-stats-top" color={C.cream} opacity={0.16} />
          <div style={{ ...SHELL, padding: `clamp(48px, 6vw, 76px) ${SPACE.gutter}` }}>
            <div className="g-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {STATS.map((s, i) => (
                <Reveal
                  key={s.label}
                  delay={i * 0.07}
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
                </Reveal>
              ))}
            </div>
          </div>
          <MeanderFrieze id="frieze-stats-bottom" color={C.cream} opacity={0.16} />
        </div>
      </section>

      {/* ══ I · INSTRUMENTARIUM ══ */}
      <section id="features" style={{ padding: `${SPACE.section} ${SPACE.gutter}` }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <Reveal>
            <SectionHead
              index="I"
              label="Das Instrumentarium"
              title="Jede Dimension deiner Finanzen."
              emphasis="Lückenlos erfasst."
              lead="Acht Module, die aus Rohdaten Entscheidungsgrundlagen machen — von der einzelnen Buchung bis zur Portfolio-Allokation."
            />
          </Reveal>

          <div
            className="g-feat"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '1px',
              backgroundColor: C.rule,
              border: `1px solid ${C.rule}`,
              marginTop: 'clamp(44px, 6vw, 72px)',
            }}
          >
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={(i % 3) * 0.06}
                className={f.wide ? 'feat-wide' : undefined}
                style={{ gridColumn: f.wide ? 'span 2' : undefined, backgroundColor: C.parchment }}
              >
                <article
                  className="af-card"
                  style={{
                    height: '100%',
                    padding: 'clamp(22px, 2.4vw, 30px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    border: '1px solid transparent',
                    backgroundColor: C.parchment,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <span
                      style={{
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1px solid ${C.rule}`,
                        color: C.goldInk,
                        flexShrink: 0,
                      }}
                    >
                      {f.icon}
                    </span>
                    {f.status && (
                      <span
                        className="feat-status af-micro"
                        style={{
                          ...kicker,
                          fontSize: '9px',
                          color: f.status === 'Live' ? C.oliveDeep : C.goldInk,
                          border: `1px solid ${f.status === 'Live' ? 'rgba(74,91,61,.3)' : 'rgba(138,106,47,.3)'}`,
                          padding: '4px 9px',
                        }}
                      >
                        {f.status}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3
                      style={{
                        fontFamily: F.display,
                        fontSize: '21px',
                        fontWeight: 500,
                        color: C.ink,
                        margin: '0 0 8px',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {f.title}
                    </h3>
                    <p
                      className="feat-desc"
                      style={{ fontFamily: F.serif, fontSize: '14px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}
                    >
                      {f.desc}
                    </p>
                  </div>

                  {f.visual && <div style={{ marginTop: 'auto', paddingTop: '10px' }}>{f.visual}</div>}

                  <div
                    style={{
                      marginTop: f.visual ? '4px' : 'auto',
                      paddingTop: '14px',
                      borderTop: `1px solid ${C.ruleSoft}`,
                      display: 'flex',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {f.tags.map((tag) => (
                      <span key={tag} className="feat-tag af-micro" style={{ ...kicker, fontSize: '9px', color: C.inkSubtle }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ II · DIE SÄULEN (Onyx-Band als Tempelfront) ══ */}
      <section style={{ backgroundColor: C.onyx, padding: `${SPACE.section} ${SPACE.gutter}` }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <Reveal>
            <SectionHead
              index="II"
              label="Die Säulen"
              title="Vier Grundsätze."
              emphasis="Ein Fundament."
              lead="Worauf das System steht — vier Prinzipien, die jede Ansicht und jede Berechnung tragen."
              tone="dark"
            />
          </Reveal>

          {/*
            Tempelfront: Gebälk über der Säulenreihe, darunter je Säule die
            Beschriftung. Säule und Text liegen bewusst im SELBEN Wrapper —
            lägen sie als zwei getrennte Rasterreihen vor, würden bei weniger
            Spalten erst alle Säulen und dann alle Texte stapeln.

            Der Stufenbau ist die untere Kante von .pillar-shaft: weil das
            Raster keinen column-gap hat und der Abstand aus dem Innenabstand
            kommt, wachsen die Kanten zu einer durchgehenden Stufe zusammen.
          */}
          <Reveal y={16} style={{ marginTop: 'clamp(44px, 6vw, 76px)' }}>
            <div className="entablature">
              <MeanderFrieze id="frieze-pillars" color={C.cream} opacity={0.3} />
              <span className="architrave" />
            </div>
          </Reveal>

          <div
            className="g-pillars"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
          >
            {PILLARS.map((p, i) => (
              <Reveal key={p.src} delay={0.08 + i * 0.1} y={20} className="pillar">
                <span className="pillar-shaft">
                  <Image
                    src={p.src}
                    alt=""
                    aria-hidden
                    width={p.w}
                    height={p.h}
                    unoptimized
                    className="pillar-img"
                  />
                </span>
                <span className="pillar-copy">
                  <span
                    style={{
                      display: 'block',
                      fontFamily: F.display,
                      fontSize: '15px',
                      letterSpacing: '0.14em',
                      color: C.gold,
                      marginBottom: '10px',
                    }}
                  >
                    {p.num}
                  </span>
                  <h3
                    style={{
                      fontFamily: F.display,
                      fontSize: 'clamp(19px, 2vw, 23px)',
                      fontWeight: 500,
                      color: C.onCream,
                      margin: '0 0 10px',
                    }}
                  >
                    {p.title}
                  </h3>
                  <span
                    className="af-balance"
                    style={{
                      display: 'block',
                      fontFamily: F.serif,
                      fontSize: '14px',
                      lineHeight: 1.75,
                      color: C.onBody,
                    }}
                  >
                    {p.desc}
                  </span>
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ III · DIE ANALYSE ══ */}
      <section style={{ padding: `${SPACE.section} ${SPACE.gutter}` }}>
        <div
          className="g-split"
          style={{
            maxWidth: '1080px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(40px, 6vw, 80px)',
            alignItems: 'center',
          }}
        >
          <Reveal>
            <SectionHead
              index="III"
              label="Die Analyse"
              title="Ausgaben in einem ganz neuen Licht."
              align="left"
            />
            <p
              style={{
                fontFamily: F.serif,
                fontSize: '16px',
                lineHeight: 1.85,
                color: C.inkBody,
                margin: '22px 0 28px',
              }}
            >
              Der Analyse-Tab verwandelt rohe Transaktionsdaten in aussagekräftige Bilder.
              Saisonale Muster werden sichtbar, Geldflüsse nachvollziehbar — und damit die
              Frage beantwortbar, wohin das Geld wirklich geht.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderTop: `1px solid ${C.ruleSoft}` }}>
              {[
                'Ausgaben-Heatmap im GitHub-Stil, mit GuV-Modus',
                'Sankey-Diagramm für die vollständige Geldfluss-Visualisierung',
                'Interaktiver Cashflow-Kalender — Popup direkt am Tag',
                'Divergierende Balken für Einnahmen und Ausgaben',
              ].map((item, i) => (
                <li
                  key={item}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'baseline',
                    padding: '14px 0',
                    borderBottom: `1px solid ${C.ruleSoft}`,
                  }}
                >
                  <span style={{ fontFamily: F.mono, fontSize: '11px', color: C.goldInk, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontFamily: F.serif, fontSize: '14px', lineHeight: 1.7, color: C.inkBody }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="split-card">
            <div
              aria-hidden
              style={{
                backgroundColor: C.onyxWarm,
                border: `1px solid rgba(26,26,26,.16)`,
                padding: 'clamp(22px, 3vw, 30px)',
                boxShadow: '0 30px 70px -28px rgba(26,26,26,.38)',
              }}
            >
              <p style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: '0 0 22px' }}>
                Ausgaben nach Kategorie
              </p>
              {[
                { cat: 'Wohnen', val: 1200, max: 1200, income: false },
                { cat: 'Lebensmittel', val: 480, max: 1200, income: false },
                { cat: 'Transport', val: 320, max: 1200, income: false },
                { cat: 'Gehalt', val: 3800, max: 3800, income: true },
                { cat: 'Freelance', val: 950, max: 3800, income: true },
                { cat: 'Freizeit', val: 180, max: 1200, income: false },
              ].map((item, i) => {
                const color = item.income ? C.oliveLight : C.terracotta
                return (
                  <div key={item.cat} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '11px' }}>
                    <span style={{ fontSize: '11px', color: C.onSubtle, width: '86px', textAlign: 'right', flexShrink: 0 }}>
                      {item.cat}
                    </span>
                    <div style={{ flex: 1, height: '14px', backgroundColor: 'rgba(232,224,208,.06)' }}>
                      <motion.div
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.85, delay: 0.06 * i, ease: EASE }}
                        style={{
                          height: '100%',
                          width: `${(item.val / item.max) * 100}%`,
                          backgroundColor: color,
                          opacity: 0.85,
                          transformOrigin: 'left center',
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: F.mono, fontSize: '11px', color, width: '58px', textAlign: 'right' }}>
                      {item.income ? '+' : '−'}
                      {item.val.toLocaleString('de-DE')}
                    </span>
                  </div>
                )
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ IV · DER WEG ══ */}
      <section
        style={{
          padding: `${SPACE.section} ${SPACE.gutter}`,
          borderTop: `1px solid ${C.rule}`,
          backgroundColor: 'rgba(232,224,208,.24)',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <Reveal>
            <SectionHead
              index="IV"
              label="Der Weg"
              title="In drei Schritten zum"
              emphasis="vollen Überblick."
            />
          </Reveal>

          <div
            className="g-steps"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'clamp(28px, 4vw, 48px)',
              marginTop: 'clamp(48px, 6vw, 76px)',
              position: 'relative',
            }}
          >
            <div
              className="g-steps-line"
              aria-hidden
              style={{
                position: 'absolute',
                top: '27px',
                left: '18%',
                right: '18%',
                height: '1px',
                background: `linear-gradient(90deg, transparent, ${C.rule} 12%, ${C.olive} 50%, ${C.rule} 88%, transparent)`,
                opacity: 0.6,
              }}
            />
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.1} style={{ textAlign: 'center', position: 'relative' }}>
                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    margin: '0 auto 22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: C.parchment,
                    border: `1px solid ${C.rule}`,
                    color: C.goldInk,
                  }}
                >
                  {step.icon}
                </div>
                <p
                  style={{
                    fontFamily: F.display,
                    fontSize: '22px',
                    lineHeight: 1,
                    color: C.goldInk,
                    margin: '0 0 12px',
                  }}
                >
                  {step.num}
                </p>
                <h3 style={{ fontFamily: F.display, fontSize: '22px', fontWeight: 500, color: C.ink, margin: '0 0 10px' }}>
                  {step.title}
                </h3>
                <p
                  className="af-balance"
                  style={{ fontFamily: F.serif, fontSize: '14px', lineHeight: 1.75, color: C.inkBody, margin: '0 auto', maxWidth: '30ch' }}
                >
                  {step.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ WEITERE EIGENSCHAFTEN ══ */}
      <section style={{ padding: `clamp(56px, 7vw, 88px) ${SPACE.gutter}`, borderTop: `1px solid ${C.rule}` }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div
            className="g-extras"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(24px, 3vw, 40px)' }}
          >
            {EXTRAS.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.06}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <span style={{ color: C.oliveDeep }}>{f.icon}</span>
                  <div style={{ height: '1px', backgroundColor: C.rule }} />
                  <h4 style={{ fontFamily: F.display, fontSize: '17px', fontWeight: 500, color: C.ink, margin: 0 }}>
                    {f.title}
                  </h4>
                  <p style={{ fontFamily: F.serif, fontSize: '13px', lineHeight: 1.75, color: C.inkBody, margin: 0 }}>
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ABSCHLUSS ══ */}
      <section style={{ padding: `0 ${SPACE.gutter} ${SPACE.section}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <Reveal y={30}>
            <div
              className="portal"
              style={{
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: C.onyx,
                padding: 'clamp(52px, 7vw, 88px) clamp(24px, 5vw, 64px)',
                textAlign: 'center',
              }}
            >
              {/*
                Zwei gleiche Säulen flankieren den Block wie ein Portal — ein
                Portal trägt beidseitig dieselbe Ordnung. Bewusst nicht
                gespiegelt: die Grafik hat eine gerichtete Lichtkante, gespiegelt
                käme das Licht von zwei Seiten.
                Rein dekorativ, unter 900px ausgeblendet (dort fehlt die Breite).
              */}
              {(['left', 'right'] as const).map((side) => (
                <Image
                  key={side}
                  src="/column-slim.svg"
                  alt=""
                  aria-hidden
                  width={76}
                  height={329}
                  unoptimized
                  className={`portal-column portal-${side}`}
                />
              ))}

              <div style={{ position: 'relative' }}>
                {/* Kranz als Wappen über dem Kicker — als Wasserzeichen hinter
                    dem Text kollidieren die Blätter mit den Zeilen. */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '22px' }}>
                  <LaurelWreath size={78} tone="dark" opacity={0.9} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <Kicker rules center color={C.onSubtle} ruleColor={C.ruleOn}>
                    Der Anfang
                  </Kicker>
                </div>
                <h2
                  className="af-balance"
                  style={{
                    fontFamily: F.display,
                    fontWeight: 400,
                    fontSize: 'clamp(27px, 4.2vw, 46px)',
                    lineHeight: 1.08,
                    letterSpacing: '-0.02em',
                    color: C.onCream,
                    margin: 0,
                  }}
                >
                  Klarheit über alles,
                  <br />
                  <em style={{ fontStyle: 'italic', color: C.gold }}>was dir gehört.</em>
                </h2>
                <p
                  className="af-balance"
                  style={{
                    fontFamily: F.serif,
                    fontSize: 'clamp(14px, 1.3vw, 16px)',
                    lineHeight: 1.85,
                    color: C.onBody,
                    maxWidth: '480px',
                    margin: '26px auto 38px',
                  }}
                >
                  Athena Finance bündelt Konten, Depots, Verträge und Strategien in einer
                  einzigen Oberfläche — damit jede Entscheidung auf vollständigen Daten beruht.
                </p>
                <Link href="/login" className="af-btn af-btn-cream">
                  Anmelden <ArrowRight size={15} strokeWidth={2} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: `1px solid ${C.rule}` }}>
        <MeanderFrieze id="frieze-footer" color={C.ink} opacity={0.14} />
        <div
          className="footer-row"
          style={{
            ...SHELL,
            padding: `28px ${SPACE.gutter}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '18px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Logo variant="dark" size={24} />
            <span style={{ fontFamily: F.display, fontSize: '15px', color: C.ink }}>Athena Finance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 28px)', flexWrap: 'wrap' }}>
            <span className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.inkSubtle }}>
              © 2025 Athena Finance
            </span>
            <Link
              href="/login"
              className="af-quiet foot-link af-micro"
              style={{ ...kicker, fontSize: '10px', color: C.inkSubtle }}
            >
              Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
    </SmoothScrollProvider>
  )
}
