'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  LayoutDashboard, TrendingUp, CircleDollarSign, Target, ShoppingCart,
  Briefcase, BarChart2, History, Settings, ArrowUpRight, ArrowDownRight, Dot,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { AU, F, kicker } from './landing-tokens'

/**
 * Illustratives Dashboard für die Vollbild-Enthüllung.
 *
 * Sidebar-Struktur, Navigation und Aurum-Grundpalette bleiben wiedererkennbar,
 * Kartenform und Layout pro Szene sind freie Illustration für die Landing
 * Page — aber die CHARTS selbst (Gridlines, Tooltips, Donut mit
 * Center-Label, Composed Bar+Line, Filter-Pills/Chips) übernehmen bewusst
 * exakt die visuelle Sprache der echten Chart-Komponenten (siehe
 * src/components/dashboard/net-worth-chart.tsx, finance-analytics.tsx,
 * portfolio-donut.tsx), nur auf Aurum-Tokens statt Tailwind-Theme-Klassen
 * übertragen. Jede der vier Szenen (siehe MOCK_VIEWS) hat ihr eigenes Layout
 * statt nur getauschter Karten im selben Raster.
 *
 * Alle Zahlen sind Beispieldaten. Der gesamte Block ist `aria-hidden`: ein
 * Screenreader würde sonst erfundene Kontostände als echte Finanzdaten
 * vorlesen.
 */

/**
 * Reihenfolge und Icons wie in der echten Sidebar. `children` nur bei den
 * beiden Einträgen, die im Mockup tatsächlich aktiv werden (Finance, Crypto)
 * — exakt dieselben Unterpunkte wie in sidebar.tsx.
 */
const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: TrendingUp, label: 'Finance', children: ['Konten', 'Transaktionen', 'Kategorien', 'Schulden', 'Verträge', 'Sparziele'] },
  { icon: CircleDollarSign, label: 'Crypto', children: ['Portfolio', 'Rebalancing', 'Assets'] },
  { icon: Target, label: 'Strategy' },
  { icon: ShoppingCart, label: 'Lebenshaltungskosten' },
  { icon: Briefcase, label: 'Depot' },
  { icon: BarChart2, label: 'Analyse' },
  { icon: History, label: 'Historie' },
  { icon: Settings, label: 'Einstellungen' },
]

/**
 * Die vier Szenen, die beim Scrollen durchlaufen werden — je eine pro
 * Kennzahl auf der Säule (siehe STATS in LandingClient). `nav` bestimmt,
 * welcher Sidebar-Eintrag dabei aktiv leuchtet (und ggf. seine Unterpunkte
 * aufklappt, siehe NAV oben).
 *
 * Nicht exportiert (mehr): wird nur innerhalb dieser Datei gelesen (siehe
 * `active` in DashboardMock unten) — ein Re-Export neben der Komponente
 * DashboardMock würde die Fast-Refresh-Grenze der Datei aufweichen.
 */
const MOCK_VIEWS = [
  { nav: 'Dashboard' },
  { nav: 'Analyse' },
  { nav: 'Finance' },
  { nav: 'Crypto' },
] as const

/** Vermögens-Kennzahl für den Header von NetWorthCard. War früher ein Array
    mit drei weiteren Einträgen (Einnahmen/Monat, Ausgaben/Monat, Sparquote)
    als eigene Mini-Karten — die doppelten sich mit der rotierenden Säule
    daneben (siehe MOCK_VIEWS-Kommentar oben) und sind raus. */
const NET_WORTH_STAT = { label: 'Vermögen', value: 84320, suffix: ' €', delta: '+12,4 %', up: true }

const MONTHS = [
  { m: 'Apr', ein: 4200, aus: 2600 },
  { m: 'Mai', ein: 4800, aus: 2900 },
  { m: 'Jun', ein: 3900, aus: 2400 },
  { m: 'Jul', ein: 5400, aus: 3100 },
  { m: 'Aug', ein: 4500, aus: 2500 },
  { m: 'Sep', ein: 4850, aus: 2190 },
]
const MONTH_MAX = 5400

/** Portfolio-Mix — Beträge statt fixer Prozente, damit Anteil UND
    Gesamtsumme wie im echten PortfolioDonut aus denselben Zahlen entstehen.
    Labels bewusst wie die Sidebar-Sektionen (siehe NAV: „Depot", „Crypto")
    statt eigener Begriffe — dieselben Namen taucht auch in ASSET_TABS
    wieder auf (siehe NetWorthCard). */
const MIX = [
  { label: 'Depot', amount: 42200, color: AU.gold },
  { label: 'Crypto', amount: 25300, color: AU.positive },
  { label: 'Cash', amount: 16820, color: AU.secondaryFg },
]

/** Nicht wirklich filternde Asset-Tabs für den Gesamtvermögen-Chart (siehe
    NetWorthCard) — reine Chrome, soll aber zeigen: hier ließen sich später
    einzelne Verläufe je Anlageklasse abrufen statt nur die Summe. */
const ASSET_TABS = ['Gesamt', ...MIX.map((m) => m.label)]

const BOOKINGS = [
  { day: '01.09.', label: 'Miete', cat: 'Wohnen', amount: -1200 },
  { day: '30.08.', label: 'Gehalt', cat: 'Einkommen', amount: 3800 },
  { day: '29.08.', label: 'Sparplan MSCI World', cat: 'Depot', amount: -500 },
  { day: '28.08.', label: 'Freelance-Projekt', cat: 'Einkommen', amount: 950 },
  { day: '27.08.', label: 'Wocheneinkauf', cat: 'Lebensmittel', amount: -68.4 },
  { day: '26.08.', label: 'Netflix', cat: 'Abos', amount: -17.99 },
  { day: '25.08.', label: 'Tanken', cat: 'Transport', amount: -82.5 },
  { day: '24.08.', label: 'Dividende Allianz', cat: 'Depot', amount: 124.6 },
]

/** Top-Ausgabenkategorien für die Analyse-Szene. Farben wie CAT_COLORS im
    echten CategoryChart — dieselben Kategorien tauchen dort als Filter-Chips
    auf (siehe CategoryChips unten). */
const CATEGORIES = [
  { label: 'Wohnen', amount: '1.200 €', pct: 100, color: AU.gold },
  { label: 'Lebensmittel', amount: '480 €', pct: 40, color: AU.accentTeal },
  { label: 'Transport', amount: '310 €', pct: 26, color: AU.accentBlue },
  { label: 'Abos', amount: '95 €', pct: 8, color: AU.positive },
]

/** Kontostand-Verlauf für die Finance-Szene — neutraler Verlauf, deshalb der
    kühle Blau-Akzent statt Gold/Grün/Rot (siehe AU.accentBlue). */
const BALANCE_HISTORY = [
  { label: 'Feb', value: 18200 },
  { label: 'Mär', value: 19100 },
  { label: 'Apr', value: 18700 },
  { label: 'Mai', value: 20400 },
  { label: 'Jun', value: 21800 },
  { label: 'Jul', value: 22600 },
  { label: 'Aug', value: 23100 },
  { label: 'Sep', value: 24700 },
]

/** Gesamtvermögen-Verlauf für die Dashboard-Szene — Cash, Depot und Krypto
    zusammen (siehe MIX). Letzter Wert deckungsgleich mit NET_WORTH_STAT.value,
    damit Header-Zahl und Chart in NetWorthCard dieselbe Geschichte erzählen.
    Bewusst mit echten Rückgängen statt einer glatten Aufwärtskurve (ein Depot-/Krypto-Mix
    schwankt real) — sonst sähe der Chart neben Kontostand/Portfolio-Wert
    (beide mit sichtbaren Dellen) unmotiviert linear aus. Gold statt Blau/
    Teal: anders als die beiden ist das hier die zentrale Vermögenskennzahl,
    kein neutraler Einzel-Verlauf. */
const NET_WORTH_HISTORY = [
  { label: 'Nov', value: 58400 },
  { label: 'Dez', value: 61100 },
  { label: 'Jan', value: 59200 },
  { label: 'Feb', value: 63800 },
  { label: 'Mär', value: 68400 },
  { label: 'Apr', value: 65100 },
  { label: 'Mai', value: 71900 },
  { label: 'Jun', value: 76200 },
  { label: 'Jul', value: 73800 },
  { label: 'Aug', value: 79600 },
  { label: 'Sep', value: 84320 },
]

/** Portfolio-Wert für die Crypto-Szene — volatiler als der Kontostand,
    deshalb sichtbar unruhigerer Verlauf. */
const PORTFOLIO_HISTORY = [
  { label: 'Feb', value: 8200 },
  { label: 'Mär', value: 7600 },
  { label: 'Apr', value: 9100 },
  { label: 'Mai', value: 8800 },
  { label: 'Jun', value: 10200 },
  { label: 'Jul', value: 11400 },
  { label: 'Aug', value: 10800 },
  { label: 'Sep', value: 12600 },
]

/** Ausgaben-Heatmap — eine Zelle je Tag, Farbtiefe nach Ausgabenhöhe. 21
    Spalten statt 14: in der Analyse-Szene läuft sie über die volle Breite
    und soll wie ein dichtes Kalenderband wirken, nicht wie ein Quadrat. */
const HEAT = [
  0,1,2,3,2,1,1,3,4,5,3,2,0,2,5,4,3,1,1,3,5,
  4,2,1,0,1,3,4,2,0,1,2,3,4,3,2,1,0,2,4,5,3,
]
const HEAT_TONES = ['#1E1500', '#3A2A05', '#6B4E0C', '#9A7211', '#C08F15', '#D4A017']

/** Basiswerte für die „24/7 Echtzeitdaten"-Szene — Live-Jitter siehe useLiveTicker. */
const TICKER_BASE = [
  { sym: 'BTC', price: 61480, deltaPct: 2.4 },
  { sym: 'ETH', price: 2914, deltaPct: 1.8 },
  { sym: 'MSCI World', price: 112.4, deltaPct: -0.3 },
  { sym: 'Allianz', price: 289.6, deltaPct: 0.9 },
]

const euro = (n: number) =>
  `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const fmtPrice = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 })

/**
 * Zählt eine Zahl hoch, sobald `run` true wird.
 *
 * `useRef` für den Startzeitpunkt statt State: sonst würde jeder Frame ein
 * Re-Render des Eltern-Hooks auslösen und die Animation gegen sich selbst
 * laufen.
 */
function useCountUp(target: number, run: boolean, decimals = 0) {
  const [value, setValue] = useState(0)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!run) return
    let frame = 0
    const DURATION = 1400

    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now
      const t = Math.min((now - startedAt.current) / DURATION, 1)
      // easeOutExpo — schnell anlaufen, weich einrasten
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setValue(target * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [run, target])

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return run ? fmt(value) : fmt(0)
}

/**
 * Lässt Kurse alle ~2,2s minimal driften — NUR, während `active` (siehe
 * Aufrufstelle in CryptoView). War früher ungated in der Annahme, das
 * Intervall stürbe implizit mit der Karte, sobald die Crypto-Szene beim
 * Szenenwechsel ab-/wieder angemontiert wird (`key={view}` in DashboardMock)
 * — stimmt aber nicht: `view` erreicht am Ende der Säulen-Rotation genau den
 * Crypto-Index und bleibt dort für den Rest der Seite stehen (die Rotation
 * läuft nur innerhalb des Pediment-Scroll-Bereichs, danach ändert sich
 * `view` nie wieder). Ohne Gate tickte dieses Intervall dadurch alle 2,2s
 * UNBEGRENZT weiter — auch nachdem die Karte längst aus dem Viewport
 * gescrollt ist —, inklusive vier Re-Renders (PulseValue/DeltaChip) pro
 * Tick. `active` kommt aus einem IntersectionObserver auf die Karte (siehe
 * useVisible), das Intervall pausiert also, sobald sie den Viewport verlässt.
 */
function useLiveTicker(base: typeof TICKER_BASE, active: boolean) {
  const [rows, setRows] = useState(base)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setRows((prev) =>
        prev.map((r) => {
          const jitter = (Math.random() - 0.5) * 0.006 // ±0,3 %
          return { ...r, price: r.price * (1 + jitter), deltaPct: r.deltaPct + jitter * 100 }
        }),
      )
    }, 2200)
    return () => clearInterval(id)
  }, [active])
  return rows
}

/** Ob `ref` (irgendein Teil davon) aktuell im Viewport sichtbar ist — für
    Hintergrund-Arbeit, die pausieren soll, sobald ihre Karte weggescrollt
    ist (siehe useLiveTicker). Ein schlankes IntersectionObserver statt
    framer-motions `useInView`: DashboardMock hat sonst keine Abhängigkeit
    zu framer-motion, eine für einen einzigen Verbraucher wäre unnötig. */
function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

/** Merkt sich die Richtung der letzten Wertänderung für ~0,5s — Grundlage
    für den grün/rot aufblitzenden „Live-Tick" (siehe PulseValue). */
function usePulseDirection(value: number) {
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  // Vergleich WÄHREND des Renders statt in einem Effekt, der auf `value`
  // reagiert (React-Pattern „Adjusting state when a prop changes" — siehe
  // https://react.dev/learn/you-might-not-need-an-effect): ein Effekt liefe
  // hier einen Frame zu spät, dieser Zweig löst den Folge-Render sofort aus,
  // noch vor dem Paint. Konvergiert nach genau einem zusätzlichen Render,
  // weil `value === prevValue` danach gilt.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setDir(value > prevValue ? 'up' : 'down')
    setPrevValue(value)
  }

  useEffect(() => {
    if (!dir) return
    const t = setTimeout(() => setDir(null), 550)
    return () => clearTimeout(t)
  }, [dir])

  return dir
}

/**
 * Glanzlicht für Karten: ein Glanzpunkt folgt der Maus über CSS-Variablen
 * (siehe .mock-tilt-card in landing.css). Kein 3D-Tilt (Rotation) mehr — der
 * kippte die Karten beim Hovern zu stark. Direkte DOM-Mutation statt
 * React-State — bei Mausbewegung hochfrequent genug, dass ein Re-Render pro
 * Event spürbar wäre; dieselbe Begründung wie bei den GSAP-Scroll-Updates in
 * LandingClient.
 */
/** Kein Zutun mehr nötig, seit der 3D-Tilt raus ist (siehe useTilt) — als
    einzelne Modul-Konstante statt einer Closure pro TiltCard-Instanz: keine
    lokale Bindung erfasst, jedes `useTilt()` legte sonst pro Render eine
    eigene, aber identische No-op-Funktion neu an. */
const noopMouseLeave = () => {}

function useTilt() {
  const ref = useRef<HTMLDivElement>(null)
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
  }
  return { ref, onMouseMove, onMouseLeave: noopMouseLeave }
}

const cardStyle: React.CSSProperties = {
  backgroundColor: AU.card,
  border: `1px solid ${AU.border}`,
  borderRadius: '10px',
  padding: 'clamp(14px, 1.6vw, 22px)',
}

/** Gemeinsame Karten-Hülle: Aurum-Fläche plus Cursor-Tilt/Glanzlicht (siehe
    useTilt). Ersetzt die früher pro Karte einzeln notierte cardStyle-Hülle. */
function TiltCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  const { ref, onMouseMove, onMouseLeave } = useTilt()
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`mock-tilt-card${className ? ` ${className}` : ''}`}
      style={{ ...cardStyle, ...style }}
    >
      {children}
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mock-label"
      style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: AU.mutedFg, position: 'relative' }}
    >
      {children}
    </span>
  )
}

function DeltaChip({ up, delta, big = false }: { up: boolean; delta: string; big?: boolean }) {
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: F.mono,
        fontSize: big ? 'clamp(12px, 1vw, 14px)' : 'clamp(10px, .8vw, 12px)',
        color: up ? AU.positive : AU.destructive,
      }}
    >
      <Arrow size={big ? 14 : 12} strokeWidth={2} />
      {delta}
    </span>
  )
}

/** Blitzt bei jeder Wertänderung kurz grün/rot auf und poppt minimal —
    „Live-Tick"-Effekt für Kurse (siehe usePulseDirection). */
function PulseValue({
  value,
  baseColor,
  children,
}: {
  value: number
  baseColor: string
  children: React.ReactNode
}) {
  const dir = usePulseDirection(value)
  return (
    <span
      className={dir ? 'mock-pulse' : undefined}
      style={{
        display: 'inline-block',
        color: dir === 'up' ? AU.positive : dir === 'down' ? AU.destructive : baseColor,
        transition: 'color .5s ease',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

/** Quadratische Kurve durch alle Punkte, Kontrollpunkt jeweils der Punkt
    selbst, Zielpunkt der Mittelpunkt zum nächsten — ergibt eine durchgehend
    glatte Linie ohne Ecken an den Datenpunkten. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i]
    const next = points[i + 1]
    d += ` Q ${cur.x} ${cur.y} ${(cur.x + next.x) / 2} ${(cur.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/**
 * Tooltip-Karte im Stil der echten Chart-Tooltips (siehe ChartTooltip in
 * net-worth-chart.tsx / finance-analytics.tsx: `rounded-lg border bg-popover
 * shadow p-3 text-xs`, fetter Titel, darunter Zeilen mit Farbpunkt + Wert).
 * `left`/`top` in Prozent der Eltern-Box, damit sie sowohl über einem
 * `<svg>`-Chart (LiveChart/BarsChart) als auch über Flex-Balken positioniert
 * werden kann.
 */
function ChartTooltipCard({
  left,
  top = 0,
  title,
  rows,
}: {
  left: number
  top?: number
  title: string
  rows: { label: string; value: string; color: string }[]
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
        backgroundColor: AU.card,
        border: `1px solid ${AU.border}`,
        borderRadius: '8px',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,.5)',
        padding: '10px 12px',
        minWidth: '140px',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 600, color: AU.cardFg }}>{title}</p>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginTop: '3px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: AU.mutedFg }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: r.color, flexShrink: 0 }} />
            {r.label}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: '11px', fontWeight: 500, color: AU.cardFg, fontVariantNumeric: 'tabular-nums' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Gestrichelte horizontale Gridlines wie `CartesianGrid strokeDasharray="3 3"
 * vertical={false}` im echten Dashboard — nur horizontal, keine Achsenlinie,
 * kein Tick. `rows` Linien gleichmäßig über die Höhe verteilt.
 */
function ChartGrid({ W, H, rows = 3 }: { W: number; H: number; rows?: number }) {
  return (
    <g aria-hidden>
      {Array.from({ length: rows }, (_, i) => {
        const y = (H / rows) * (i + 1)
        return <line key={i} x1={0} y1={y} x2={W} y2={y} stroke={AU.border} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      })}
    </g>
  )
}

/** Rechteck mit nur oben abgerundeten Ecken — SVG-`rect` rundet immer alle
    vier, für die Balkenoptik (flach an der Grundlinie) muss es ein Pfad sein. */
function roundedTopRectPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return `M ${x} ${y + h} L ${x + w} ${y + h} Z`
  const rr = Math.min(r, w / 2, h)
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`
}

/**
 * Verlaufs-Chart (Linie + Fläche) mit Crosshair, das der Maus stetig folgt
 * — Basis für Kontostand-Verlauf (Finance) und Portfolio-Wert (Crypto).
 *
 * Der Wert unter dem Cursor wird zwischen den beiden nächsten Datenpunkten
 * interpoliert statt auf den nächsten Punkt einzurasten: das liest sich wie
 * ein echtes „Fahre über den Verlauf" statt wie diskrete Hover-Zonen.
 *
 * Enthüllung per `clip-path` von links nach rechts statt stroke-dashoffset:
 * dafür bräuchte es die exakte Pfadlänge (per getTotalLength, erst nach dem
 * ersten Render bekannt) — ein Rechteck-Ausschnitt braucht das nicht.
 */
function LiveChart({
  title,
  points,
  color,
  run,
  showHeader = true,
}: {
  title: string
  points: { label: string; value: number }[]
  color: string
  run: boolean
  /** Aus, wenn ein Elternteil (z. B. NetWorthCard) Titel/Wert schon selbst
      groß darstellt — verhindert die Zahl doppelt zu zeigen. */
  showHeader?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const W = 300
  const H = 140
  const PAD = 6
  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const range = max - min || 1
  const coords = points.map((p, i) => ({
    x: PAD + (i / (points.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (p.value - min) / range) * (H - PAD * 2),
  }))
  const linePath = smoothPath(coords)
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`
  const gradientId = `mock-grad-${title.replace(/[^a-z0-9]/gi, '')}`
  const last = points[points.length - 1]

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    setHoverX(Math.max(PAD, Math.min(W - PAD, relX)))
  }

  let hover: { x: number; y: number; value: number; label: string } | null = null
  if (hoverX !== null) {
    let i = 0
    while (i < coords.length - 2 && coords[i + 1].x < hoverX) i++
    const a = coords[i]
    const b = coords[i + 1] ?? coords[i]
    const t = b.x === a.x ? 0 : Math.max(0, Math.min(1, (hoverX - a.x) / (b.x - a.x)))
    const y = a.y + (b.y - a.y) * t
    const va = points[i].value
    const vb = points[Math.min(i + 1, points.length - 1)].value
    const label = t < 0.5 ? points[i].label : points[Math.min(i + 1, points.length - 1)].label
    hover = { x: hoverX, y, value: va + (vb - va) * t, label }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <CardLabel>{title}</CardLabel>
          <span style={{ position: 'relative', fontFamily: F.mono, fontSize: 'clamp(15px, 1.5vw, 20px)', color: AU.cardFg, fontVariantNumeric: 'tabular-nums' }}>
            {last.value.toLocaleString('de-DE')} €
          </span>
        </div>
      )}
      <div
        ref={wrapRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverX(null)}
        style={{ position: 'relative', flex: 1, marginTop: showHeader ? '12px' : 0, minHeight: 0 }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <ChartGrid W={W} H={H} />
          <g style={{ clipPath: run ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)', transition: 'clip-path 1.1s cubic-bezier(.16,1,.3,1)' }}>
            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {hover && (
            <>
              <line x1={hover.x} y1={0} x2={hover.x} y2={H} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
              <circle cx={hover.x} cy={hover.y} r={4} fill={color} stroke={AU.card} strokeWidth="2" />
            </>
          )}
        </svg>
        {hover && (
          <ChartTooltipCard
            left={(hover.x / W) * 100}
            top={(hover.y / H) * 100}
            title={hover.label}
            rows={[{ label: title, value: `${Math.round(hover.value).toLocaleString('de-DE')} €`, color }]}
          />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        {points.map((p) => (
          <span key={p.label} style={{ fontFamily: F.mono, fontSize: 'clamp(8px, .65vw, 10px)', color: AU.mutedFg, opacity: .7 }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Balken + Linie auf einer gemeinsamen Achse — Dashboard-Szene, dieselbe
    Bauart wie IncomeExpenseChart im echten Dashboard (ComposedChart: zwei
    Bar-Serien plus eine Netto-Line auf derselben Y-Skala). */
function BarsChart({ run }: { run: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 300
  const H = 140
  const TOP_PAD = 12
  const groupW = W / MONTHS.length
  const barW = groupW * 0.26
  const gap = 3

  const bars = MONTHS.map((b, i) => {
    const cx = groupW * (i + 0.5)
    const einH = (b.ein / MONTH_MAX) * (H - TOP_PAD)
    const ausH = (b.aus / MONTH_MAX) * (H - TOP_PAD)
    const netto = b.ein - b.aus
    return { ...b, cx, einX: cx - barW - gap / 2, ausX: cx + gap / 2, einH, ausH, netto, nettoY: H - (netto / MONTH_MAX) * (H - TOP_PAD) }
  })
  const nettoPath = smoothPath(bars.map((b) => ({ x: b.cx, y: b.nettoY })))
  const active = hover !== null ? bars[hover] : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <CardLabel>Einnahmen und Ausgaben</CardLabel>
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
          {([['Einnahmen', AU.positive], ['Ausgaben', AU.destructive], ['Netto', AU.accentBlue]] as const).map(([lbl, c]) => (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'clamp(9px, .75vw, 10px)', color: AU.mutedFg }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c, flexShrink: 0 }} />
              {lbl}
            </span>
          ))}
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, marginTop: '14px', minHeight: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <ChartGrid W={W} H={H} />
          {bars.map((b, i) => (
            <g key={b.m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={groupW * i} y={0} width={groupW} height={H} fill="transparent" />
              <g
                style={{
                  clipPath: run ? 'inset(0% 0 0 0)' : 'inset(100% 0 0 0)',
                  transition: 'clip-path .9s cubic-bezier(.16,1,.3,1)',
                  transitionDelay: `${i * 0.05}s`,
                }}
              >
                <path d={roundedTopRectPath(b.einX, H - b.einH, barW, b.einH, 2)} fill={AU.positive} style={{ opacity: hover === null || hover === i ? 0.85 : 0.3, transition: 'opacity .2s ease' }} />
                <path d={roundedTopRectPath(b.ausX, H - b.ausH, barW, b.ausH, 2)} fill={AU.destructive} style={{ opacity: hover === null || hover === i ? 0.85 : 0.3, transition: 'opacity .2s ease' }} />
              </g>
            </g>
          ))}
          <g style={{ clipPath: run ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)', transition: 'clip-path 1s cubic-bezier(.16,1,.3,1)', transitionDelay: '.25s' }}>
            <path d={nettoPath} fill="none" stroke={AU.accentBlue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {bars.map((b) => <circle key={b.m} cx={b.cx} cy={b.nettoY} r={2.5} fill={AU.accentBlue} />)}
          </g>
        </svg>
        {active && (
          <ChartTooltipCard
            left={(active.cx / W) * 100}
            top={(Math.min(H - active.einH, H - active.ausH, active.nettoY) / H) * 100}
            title={active.m}
            rows={[
              { label: 'Einnahmen', value: `+${active.ein.toLocaleString('de-DE')} €`, color: AU.positive },
              { label: 'Ausgaben', value: `−${active.aus.toLocaleString('de-DE')} €`, color: AU.destructive },
              { label: 'Netto', value: `${active.netto >= 0 ? '+' : '−'}${Math.abs(active.netto).toLocaleString('de-DE')} €`, color: AU.accentBlue },
            ]}
          />
        )}
      </div>
      <div style={{ display: 'flex', marginTop: '4px' }}>
        {MONTHS.map((b) => (
          <span key={b.m} style={{ flex: 1, textAlign: 'center', fontFamily: F.mono, fontSize: 'clamp(9px, .7vw, 11px)', color: AU.mutedFg, opacity: .7 }}>
            {b.m}
          </span>
        ))}
      </div>
    </>
  )
}

/** Portfolio-Mix als schmaler Streifen über dem Gesamtvermögen-Chart (siehe
    NetWorthCard) — Ring plus einzeilige Legende statt einer eigenen Karte
    mit großem Ring und vertikaler Liste: die Zusammensetzung ist hier nur
    der Kontext für den Chart darunter, kein gleichrangiger zweiter Fokus. */
function PortfolioMixRow({ run }: { run: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = MIX.reduce((s, m) => s + m.amount, 0)
  // Segmente als gestrichelter Kreis, Umfang 2πr bei r=42. Offsets vorab
  // kumulieren statt im map() mitzuzählen — eine Variable während des
  // Renderns fortzuschreiben ist in React nicht zulässig und liefert bei
  // unterbrochenem Rendering falsche Werte.
  const R = 42
  const CIRC = 2 * Math.PI * R
  const GAP = CIRC * 0.018 // Lücke zwischen Segmenten, wie paddingAngle im echten Donut
  const SEGMENTS = MIX.reduce<{ seg: (typeof MIX)[number]; pct: number; offset: number }[]>((list, seg) => {
    const prev = list[list.length - 1]
    const pct = (seg.amount / total) * 100
    const offset = prev ? prev.offset + (prev.pct / 100) * CIRC : 0
    return [...list, { seg, pct, offset }]
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.6vw, 20px)', flexWrap: 'wrap' }}>
      <CardLabel>Portfolio-Mix</CardLabel>
      <div style={{ position: 'relative', width: 'clamp(40px, 3.6vw, 52px)', flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={R} fill="none" stroke={AU.secondary} strokeWidth="16" />
          {SEGMENTS.map(({ seg, pct, offset }, i) => (
            <circle
              key={seg.label}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={hover === i ? 19 : 16}
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, (pct / 100) * CIRC - GAP) * (run ? 1 : 0)} ${CIRC}`}
              strokeDashoffset={-(offset + GAP / 2) * (run ? 1 : 0)}
              opacity={hover === null || hover === i ? 1 : 0.4}
              style={{ transition: 'stroke-dasharray 1s cubic-bezier(.16,1,.3,1), stroke-dashoffset 1s cubic-bezier(.16,1,.3,1), stroke-width .2s ease, opacity .2s ease' }}
            />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(10px, 1.4vw, 18px)' }}>
        {SEGMENTS.map(({ seg, pct }, i) => (
          <span
            key={seg.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'clamp(10px, .85vw, 12px)',
              color: AU.secondaryFg,
              opacity: hover === null || hover === i ? 1 : 0.45,
              transition: 'opacity .2s ease',
              cursor: 'default',
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: seg.color, flexShrink: 0 }} />
            {seg.label}
            <span style={{ fontFamily: F.mono, color: AU.mutedFg }}>{Math.round(pct)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function HeatmapGrid({ run }: { run: boolean }) {
  return (
    <div
      style={{
        marginTop: '14px',
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(21, 1fr)',
        gridAutoRows: '1fr',
        gap: '5px',
        minHeight: 0,
      }}
    >
      {HEAT.map((v, i) => (
        <span
          key={i}
          style={{
            backgroundColor: HEAT_TONES[v],
            borderRadius: '3px',
            opacity: run ? 1 : 0,
            transform: run ? 'scale(1)' : 'scale(.4)',
            transition: 'opacity .5s ease, transform .5s cubic-bezier(.34,1.56,.64,1)',
            transitionDelay: `${i * 0.008}s`,
          }}
        />
      ))}
    </div>
  )
}

/** Sparziel-Fortschritt — Analyse-Szene. */
const GOALS = [
  { label: 'Notgroschen', pct: 82 },
  { label: 'Eigenkapital', pct: 46 },
  { label: 'Urlaub 2026', pct: 63 },
]

function GoalsList({ run }: { run: boolean }) {
  return (
    <>
      <CardLabel>Sparziele</CardLabel>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1.4vw, 16px)', flex: 1, justifyContent: 'center' }}>
        {GOALS.map((g, i) => (
          <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.secondaryFg }}>{g.label}</span>
              <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: AU.gold }}>{g.pct} %</span>
            </div>
            <span style={{ height: '6px', borderRadius: '3px', backgroundColor: AU.secondary, overflow: 'hidden', display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: run ? `${g.pct}%` : '0%',
                  borderRadius: '3px',
                  backgroundColor: AU.gold,
                  transition: 'width 1s cubic-bezier(.16,1,.3,1)',
                  transitionDelay: `${0.1 + i * 0.1}s`,
                }}
              />
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function CategoryList({ run }: { run: boolean }) {
  return (
    <>
      <CardLabel>Top-Kategorien</CardLabel>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, justifyContent: 'center' }}>
        {CATEGORIES.map((c, i) => (
          <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'clamp(10px, .85vw, 12px)', color: AU.secondaryFg }}>{c.label}</span>
              <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: AU.cardFg }}>{c.amount}</span>
            </div>
            <span style={{ height: '5px', borderRadius: '3px', backgroundColor: AU.secondary, overflow: 'hidden', display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: run ? `${c.pct}%` : '0%',
                  borderRadius: '3px',
                  backgroundColor: AU.gold,
                  transition: 'width 1s cubic-bezier(.16,1,.3,1)',
                  transitionDelay: `${i * 0.08}s`,
                }}
              />
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Kategorie-Filter-Chips wie im echten CategoryChart: farbiger Rand + Punkt,
    inaktive Chips auf 25% Opacity. Hier zusätzlich ECHT klickbar (siehe
    CATEGORIES für die zugrunde liegenden Beträge) — reine Chrome, filtert
    nichts, aber verhält sich wie das Original statt es nur zu zeigen. */
function CategoryChips() {
  // Lazy Initializer statt eines direkten `new Set(...)`-Arguments: sonst
  // baut React bei JEDEM Render ein neues Set auf und verwirft es sofort
  // wieder — der Initializer läuft nur beim allerersten Mount.
  const [active, setActive] = useState<Set<string>>(() => new Set(CATEGORIES.map((c) => c.label)))
  const toggle = (label: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {CATEGORIES.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => toggle(c.label)}
          className="mock-chip"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '999px',
            padding: '4px 10px',
            fontSize: 'clamp(9px, .8vw, 11px)',
            fontWeight: 500,
            border: `1px solid ${c.color}`,
            color: c.color,
            backgroundColor: 'transparent',
            opacity: active.has(c.label) ? 1 : 0.25,
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c.color, flexShrink: 0 }} />
          {c.label}
        </button>
      ))}
    </div>
  )
}

function AvgSpendCard({ run }: { run: boolean }) {
  const shown = useCountUp(73.2, run, 2)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', height: '100%' }}>
      <CardLabel>Ø Ausgabe / Tag</CardLabel>
      <span style={{ fontFamily: F.display, fontSize: 'clamp(24px, 2.6vw, 36px)', color: AU.cardFg, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
        {shown} €
      </span>
      <DeltaChip up={false} delta="−4,1 % ggü. Vormonat" />
    </div>
  )
}

function BookingsList({ title, bookings }: { title: string; bookings: typeof BOOKINGS }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <>
      <CardLabel>{title}</CardLabel>
      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {bookings.map((b, i) => (
          <div
            key={b.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
              alignItems: 'center',
              gap: 'clamp(10px, 1.6vw, 26px)',
              padding: 'clamp(7px, .9vw, 12px) 8px',
              margin: '0 -8px',
              borderRadius: '6px',
              borderBottom: `1px solid ${AU.border}`,
              backgroundColor: hover === i ? AU.secondary : 'transparent',
              transition: 'background-color .18s ease',
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: AU.mutedFg }}>{b.day}</span>
            <span style={{ fontSize: 'clamp(12px, 1vw, 14px)', color: AU.cardFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
            <span className="booking-cat" style={{ ...kicker, fontSize: 'clamp(8px, .7vw, 10px)', color: AU.mutedFg }}>
              {b.cat}
            </span>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 'clamp(11px, .95vw, 14px)',
                color: b.amount > 0 ? AU.positive : AU.destructive,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                minWidth: 'clamp(80px, 7vw, 110px)',
              }}
            >
              {euro(b.amount)}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

type TickerRow = { sym: string; price: number; deltaPct: number }

/** Große Kurszeile oben in der Crypto-Szene — der „Held" dieser Ansicht. */
function TickerBanner({ row }: { row: TickerRow }) {
  const up = row.deltaPct >= 0
  return (
    <TiltCard
      className="mock-hero-card"
      style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(16px, 2vw, 28px)', flexWrap: 'wrap' }}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CardLabel>{row.sym} · Live</CardLabel>
          <Dot size={20} strokeWidth={4} color={AU.positive} className="mock-live-dot" />
        </div>
        <PulseValue value={row.price} baseColor={AU.cardFg}>
          <span style={{ fontFamily: F.display, fontSize: 'clamp(32px, 4.2vw, 58px)', lineHeight: 1, color: AU.cardFg }}>
            {fmtPrice(row.price)} €
          </span>
        </PulseValue>
      </div>
      <DeltaChip up={up} delta={`${up ? '+' : '−'}${Math.abs(row.deltaPct).toFixed(1)} %`} big />
    </TiltCard>
  )
}

/** Kleine Kurskarte — Crypto-Szene, unterhalb des großen Charts. */
function MiniTicker({ row }: { row: TickerRow }) {
  const up = row.deltaPct >= 0
  return (
    <TiltCard style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
      <CardLabel>{row.sym}</CardLabel>
      <PulseValue value={row.price} baseColor={AU.cardFg}>
        <span style={{ fontFamily: F.mono, fontSize: 'clamp(14px, 1.3vw, 18px)' }}>{fmtPrice(row.price)} €</span>
      </PulseValue>
      <DeltaChip up={up} delta={`${up ? '+' : '−'}${Math.abs(row.deltaPct).toFixed(1)} %`} />
    </TiltCard>
  )
}

/** Reiter-Leiste, gemeinsame Bauart für Zeitraum- UND Asset-Filter (siehe
    PeriodTabs/AssetTabs): aktiv = gefüllte Pille mit leichtem Scale, inaktiv
    = Ghost-Text mit Hover. Echt umschaltbar (eigener State je Instanz), aber
    ohne Wirkung auf die Charts darunter — reine Chrome, die zeigen soll,
    dass sich der Verlauf theoretisch nach Zeitraum und Anlageklasse
    aufschlüsseln ließe (siehe NetWorthCard). */
function TabPills({ options, active, onChange }: { options: string[]; active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {options.map((p) => {
        const isActive = p === active
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`mock-pill${isActive ? ' active' : ''}`}
            style={{
              fontFamily: F.mono,
              fontSize: '11px',
              fontWeight: 500,
              padding: '5px 11px',
              borderRadius: '6px',
              border: 'none',
              whiteSpace: 'nowrap',
              backgroundColor: isActive ? AU.cardFg : 'transparent',
              color: isActive ? AU.bg : AU.mutedFg,
              transform: isActive ? 'scale(1.05)' : 'none',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

function PeriodTabs() {
  const [active, setActive] = useState('1J')
  return <TabPills options={['3M', '6M', '1J', 'Alle']} active={active} onChange={setActive} />
}

/** Anlageklassen-Filter neben den Zeitraum-Tabs — Labels wie ASSET_TABS
    (Gesamt + dieselben Namen wie in MIX/der Sidebar), damit klar wird: hier
    könnte statt der Summe auch nur Depot oder Crypto allein angezeigt
    werden. */
function AssetTabs() {
  const [active, setActive] = useState('Gesamt')
  return <TabPills options={ASSET_TABS} active={active} onChange={setActive} />
}

/** Großer, zusammengesetzter „Gesamtvermögen"-Aufmacher der Dashboard-Szene:
    Zahl + Delta, darunter Zeitraum-/Asset-Tabs (siehe TabPills — ohne echte
    Wirkung), dann Portfolio-Mix als Kontext-Streifen ÜBER dem Chart (siehe
    PortfolioMixRow) und der Verlauf selbst. Ersetzt die frühere Kennzahlen-
    Reihe (Vermögen/Einnahmen/Ausgaben/Sparquote): die drei Nebenkennzahlen
    doppelten sich mit der rotierenden Säule daneben (siehe PedimentReveal/
    STATS) — hier bleibt nur, was die Säule NICHT schon zeigt: Verlauf und
    Zusammensetzung des Vermögens. */
function NetWorthCard({ run }: { run: boolean }) {
  const stat = NET_WORTH_STAT
  const shown = useCountUp(stat.value, run, 0)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'clamp(12px, 1.6vw, 20px)' }}>
        <div>
          <CardLabel>{stat.label}</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: F.display, fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1, color: AU.cardFg }}>
              {shown}{stat.suffix}
            </span>
            <DeltaChip up={stat.up} delta={stat.delta} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <PeriodTabs />
          <AssetTabs />
        </div>
      </div>

      <div style={{ marginTop: 'clamp(14px, 1.8vw, 22px)' }}>
        <PortfolioMixRow run={run} />
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: 'clamp(12px, 1.4vw, 18px)' }}>
        <LiveChart title="Gesamtvermögen" points={NET_WORTH_HISTORY} color={AU.gold} run={run} showHeader={false} />
      </div>
    </>
  )
}

// ── Die vier Szenen — jede mit eigenem Layout statt getauschter Karten im
//    selben Raster ───────────────────────────────────────────────────────────

function DashboardView({ run }: { run: boolean }) {
  return (
    <>
      <TiltCard style={{ flex: '2 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(18px, 2vw, 26px)' }}>
        <NetWorthCard run={run} />
      </TiltCard>
      <TiltCard style={{ height: 'clamp(160px, 22vh, 210px)', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <BarsChart run={run} />
      </TiltCard>
      <TiltCard className="mock-bookings" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BookingsList title="Letzte Buchungen" bookings={BOOKINGS.slice(0, 5)} />
      </TiltCard>
    </>
  )
}

function AnalyseView({ run }: { run: boolean }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <span style={{ fontFamily: F.display, fontSize: 'clamp(18px, 1.8vw, 24px)', color: AU.cardFg }}>Ausgaben-Analyse</span>
        <PeriodTabs />
      </div>
      <TiltCard style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          <CardLabel>Ausgaben-Heatmap</CardLabel>
          <CategoryChips />
        </div>
        <HeatmapGrid run={run} />
      </TiltCard>
      <div className="mock-charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', height: 'clamp(160px, 22vh, 210px)', flexShrink: 0 }}>
        <TiltCard style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}><GoalsList run={run} /></TiltCard>
        <TiltCard style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}><CategoryList run={run} /></TiltCard>
        <TiltCard><AvgSpendCard run={run} /></TiltCard>
      </div>
    </>
  )
}

function FinanceView({ run }: { run: boolean }) {
  return (
    <>
      <TiltCard style={{ flex: '1 1 auto', minHeight: 0, padding: 'clamp(18px, 2vw, 26px)' }}>
        <LiveChart title="Kontostand-Verlauf" points={BALANCE_HISTORY} color={AU.accentBlue} run={run} />
      </TiltCard>
      <TiltCard className="mock-bookings" style={{ height: 'clamp(190px, 26vh, 250px)', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BookingsList title="Alle Transaktionen" bookings={BOOKINGS} />
      </TiltCard>
    </>
  )
}

function CryptoView({ run, visible }: { run: boolean; visible: boolean }) {
  const rows = useLiveTicker(TICKER_BASE, visible)
  const [banner, ...minis] = rows
  return (
    <>
      <TickerBanner row={banner} />
      <TiltCard style={{ flex: '1 1 auto', minHeight: 0, padding: 'clamp(18px, 2vw, 26px)' }}>
        <LiveChart title="Portfolio-Wert" points={PORTFOLIO_HISTORY} color={AU.accentTeal} run={run} />
      </TiltCard>
      <div className="mock-charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'clamp(10px, 1.2vw, 16px)', height: 'clamp(100px, 15vh, 130px)', flexShrink: 0 }}>
        {minis.map((t) => <MiniTicker key={t.sym} row={t} />)}
      </div>
    </>
  )
}

export function DashboardMock({
  run,
  view = 0,
  /**
   * Hält rechts Platz für die Kennzahlen-Säule frei. Ohne das lägen Beträge,
   * Prozentwerte und Kurse — also genau die rechtsbündigen Zahlen — unter der
   * Säule und wären angeschnitten.
   */
  reserveRight = false,
}: {
  run: boolean
  view?: number
  reserveRight?: boolean
}) {
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  // -1 = Säule noch leer (siehe PedimentReveal, phi startet bei
  // COLUMN_START_DEG) — zeigt trotzdem schon die volle Dashboard-Szene
  // (kein Skeleton-Zwischenschritt mehr), Math.max fängt nur den Index ab.
  const active = MOCK_VIEWS[Math.max(view, 0)]?.nav ?? 'Dashboard'
  // Gate für Hintergrund-Arbeit, die pausieren soll, sobald das Mockup aus
  // dem Viewport gescrollt ist (siehe useLiveTicker/CryptoView) — `view`
  // bleibt nach der Säulen-Rotation dauerhaft auf dem letzten Stand stehen
  // (siehe Kommentar an useLiveTicker), ohne dieses Gate liefe die
  // Crypto-Szene sonst für den Rest der Seite im Hintergrund weiter.
  const rootRef = useRef<HTMLDivElement>(null)
  const visible = useVisible(rootRef)

  return (
    <div
      ref={rootRef}
      aria-hidden
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: AU.bg,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 224px) minmax(0, 1fr)',
        overflow: 'hidden',
        /*
         * Die umschließende <section> in PedimentReveal setzt bewusst
         * pointer-events: none (sie ist mehrere Viewport-Höhen groß und läge
         * sonst über echten Inhalten davor/danach, siehe Kommentar dort).
         * Für die Tilt-/Crosshair-/Puls-Effekte hier muss das gezielt wieder
         * aufgehoben werden — erst ab `run`, also erst wenn der Giebel schon
         * sichtbar offen ist, sonst wäre schon der winzige Dreieck-Spalt zu
         * Beginn über dem Hero-Button klickbar.
         */
        pointerEvents: run ? 'auto' : 'none',
      }}
      className="mock-root"
    >
      {/* ── Sidebar ── */}
      <aside
        className="mock-side"
        style={{
          backgroundColor: AU.sidebar,
          borderRight: `1px solid ${AU.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* Kopf mit Logo — im echten Dashboard durch eine Linie abgesetzt */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '0 16px',
            height: '56px',
            flexShrink: 0,
            borderBottom: `1px solid ${AU.sidebarBorder}`,
          }}
        >
          <Logo variant="transparent" size={22} />
          <span style={{ fontFamily: F.display, fontSize: '15px', color: AU.sidebarAccentFg, whiteSpace: 'nowrap' }}>
            Athena Finance
          </span>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0, overflow: 'hidden' }}>
          {NAV.map(({ icon: Icon, label, children }) => {
            const isActive = label === active
            const isHovered = hoveredNav === label
            return (
              <div key={label}>
                <div
                  className="mock-nav-item"
                  onMouseEnter={() => setHoveredNav(label)}
                  onMouseLeave={() => setHoveredNav(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontSize: 'clamp(11px, .92vw, 13px)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: isActive ? AU.sidebarAccentFg : AU.sidebarFg,
                    backgroundColor: isActive ? AU.sidebarAccent : isHovered ? 'rgba(212,160,23,.07)' : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background-color .35s ease, color .35s ease',
                  }}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    style={{ flexShrink: 0, color: isActive ? AU.gold : 'currentColor', transition: 'color .35s ease' }}
                  />
                  {label}
                </div>

                {/*
                  Immer gemountet (nicht nur bei isActive) — nur so kann die
                  CSS-Grid-Höhe beim Auf- UND Zuklappen animieren, dieselbe
                  Technik wie .subnav-container in der echten Sidebar (siehe
                  globals.css), hier unter eigenem Namen, damit sich Landing-
                  und App-Stylesheet nicht überschneiden.
                */}
                {children && (
                  <div className={`mock-subnav-container${isActive ? ' open' : ''}`}>
                    <div className="mock-subnav-inner">
                      {children.map((child, ci) => (
                        <div
                          key={child}
                          className="mock-subnav-item"
                          style={{
                            color: ci === 0 ? AU.sidebarAccentFg : AU.mutedFg,
                            backgroundColor: ci === 0 ? AU.sidebarAccent : 'transparent',
                            fontWeight: ci === 0 ? 500 : 400,
                          }}
                        >
                          {child}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Fußbereich: Konto → Einstellungen, wie im echten Dashboard */}
        <div style={{ borderTop: `1px solid ${AU.sidebarBorder}`, padding: '10px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px' }}>
            <Image
              src="/avatar.webp"
              alt=""
              width={28}
              height={28}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: `1px solid ${AU.sidebarBorder}`,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: AU.sidebarAccentFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Eric Schuck
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: AU.mutedFg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                eric@athena-finance.de
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Inhalt ── */}
      <div
        className={reserveRight ? 'mock-content mock-content-inset' : 'mock-content'}
        style={{
          padding: 'clamp(18px, 2.2vw, 34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 1.4vw, 20px)',
          minWidth: 0,
        }}
      >
        {/*
          `key={view}` erzwingt einen Remount bei jedem Szenenwechsel und
          triggert damit die mock-view-fade-Animation (siehe landing.css) —
          ohne das würden die Szenen hart umschalten statt weich einzublenden.
          Jede Szene rendert hier ihr KOMPLETTES eigenes Layout, nicht nur
          getauschte Karten in einem gemeinsamen Raster.
        */}
        <div key={view} className="mock-view-fade" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1.4vw, 20px)', flex: 1, minHeight: 0 }}>
          {/* -1 (Säule noch leer) fällt bewusst auf die Dashboard-Szene durch
              — kein Skeleton-Zwischenschritt mehr, siehe Kommentar bei `active`. */}
          {view === 1 ? <AnalyseView run={run} />
            : view === 2 ? <FinanceView run={run} />
            : view === 3 ? <CryptoView run={run} visible={visible} />
            : <DashboardView run={run} />}
        </div>
      </div>
    </div>
  )
}
