'use client'

import { useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import { kdeDensityAt, computePercentileRank } from '@/lib/kde'
import type { AnalyseMode, MonthSeries, MonthTotals } from '@/lib/analyseData'
import { ModeSwitch, ANALYSE_MODE_OPTIONS } from './ModeSwitch'

/** Unter dieser Monatszahl ist eine Verteilung nicht verlässlich genug — lieber
    ehrlich „noch nicht genug Historie" als ein Histogramm aus drei Werten. */
const MIN_MONTHS = 12

/** Echtes Minuszeichen (U+2212) statt Bindestrich. Auf der Achse standen vorher
    Klassenbereiche wie „-787--51", in denen Vorzeichen und Bis-Strich identisch
    aussahen. Die Achse zeigt jetzt Einzelbeträge (s. u.); das Minus bleibt
    trotzdem das typografisch richtige — es ist so breit wie eine Ziffer und
    fällt damit nicht mehr mit einem Bindestrich zusammen. */
const MINUS = '−'

const TITLE: Record<AnalyseMode, string> = {
  ausgaben:  'Ausgabenverteilung',
  einnahmen: 'Einnahmenverteilung',
  guv:       'GuV-Verteilung',
}
const NOUN: Record<AnalyseMode, string> = {
  ausgaben:  'Gesamtausgaben',
  einnahmen: 'Gesamteinnahmen',
  guv:       'Einnahmen minus Ausgaben',
}
const COLOR: Record<AnalyseMode, string> = {
  ausgaben:  'var(--chart-expense)',
  einnahmen: 'var(--chart-income)',
  guv:       'var(--chart-accent)',
}

interface Props {
  history: MonthSeries
  /** `null`, solange im laufenden Monat nichts gebucht ist. */
  current: MonthTotals | null
}

interface Bin {
  label:     string
  from:      number
  to:        number
  count:     number
  isCurrent: boolean
}

/** Stützpunkt der Dichtekurve: Betrag → erwartete Monate. */
interface KurvePunkt {
  x: number
  y: number
}

/**
 * Wie fein die Dichtekurve abgetastet wird.
 *
 * Sie hing vorher an den Klassenmitten, also an 6–12 Punkten, und lief nur von der ersten
 * bis zur letzten Mitte. Beides hat sie flachgedrückt: das Maximum der Dichte liegt fast
 * nie genau auf einer Klassenmitte (der Scheitel wurde also gekappt und die Kurve bekam
 * einen breiten Rücken statt eines Extrempunkts), und die abgeschnittenen Ausläufer links
 * und rechts fehlten, an denen man eine Verteilung überhaupt als Glocke erkennt.
 */
const KURVE_PUNKTE = 121

interface Verteilung {
  bins:  Bin[]
  kurve: KurvePunkt[]
  /** Betragsachse: Außenkanten der ersten und der letzten Klasse. */
  min:   number
  max:   number
  width: number
  /** KDE-Bandbreite — wird für den Marker des laufenden Monats erneut gebraucht. */
  h:     number
  ticks: number[]
}

/** 2.340 → „2,3k", 340 → „340", −1.200 → „−1,2k" */
function compact(v: number): string {
  const abs = Math.abs(v)
  const s = abs < 1000
    ? v.toLocaleString('de-DE', { maximumFractionDigits: 0 })
    : (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: abs >= 10000 ? 0 : 1 }) + 'k'
  return s.replace('-', MINUS)
}

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return quantile(s, 0.5)
}

/**
 * Arithmetisches Mittel — bewusst als eigene Linie neben dem Median, nicht als Ersatz: beide
 * beantworten verschiedene Fragen und fallen nur bei einer symmetrischen Verteilung zusammen.
 * Der Median ist robust gegen Ausreißer (die Hälfte der Monate liegt darüber, die Hälfte
 * darunter); der Mittelwert wird von genau den Ausreißer-Monaten verzogen, die Erics Daten
 * ausmachen (ein Dezember mit 3.874 € Ausgaben gegen einen Sockel um 2.000 €, s.o.
 * binCountFor) — deshalb liegt er meist NICHT am Scheitel der Dichtekurve.
 *
 * Der Scheitel selbst ist auch keins von beiden: er ist der Modus der geschätzten Verteilung
 * (die wahrscheinlichste Betragsklasse), und bei einer rechtsschiefen Verteilung — dem
 * Normalfall bei Ausgaben/Einnahmen, wenige teure Monate ziehen die Kurve nach rechts — gilt
 * typischerweise Modus < Median < Mittelwert. Dass hier keine der beiden Linien exakt auf dem
 * Scheitel sitzt, ist deshalb kein Rechenfehler, sondern zeigt genau diese Schiefe.
 */
function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Modus, als höchster Punkt der bereits gezeichneten Dichtekurve (x UND y) — nicht separat aus
 * den Rohwerten geschätzt, weil "der Scheitel der Kurve" ohnehin die Definition ist, die im
 * Chart zu sehen ist; ein zweites, unabhängig berechnetes Maximum könnte an einer anderen
 * Stelle liegen als die goldene Linie selbst und wäre dann falsch anschaulich. Die y-Koordinate
 * wird gleich mitgeliefert, weil genau die den Punkt-Marker auf der Kurve positioniert.
 */
function modeFromKurve(kurve: KurvePunkt[]): KurvePunkt {
  return kurve.reduce((best, p) => (p.y > best.y ? p : best), kurve[0])
}

/**
 * Stichproben-Standardabweichung (n−1, Bessel-Korrektur) — die Monate hier sind eine Stichprobe
 * aus dem, was künftige Monate bringen, nicht die ganze Grundgesamtheit. `avg` wird übergeben
 * statt neu berechnet, weil der Aufrufer ihn für die Mittelwert-Linie ohnehin schon hat.
 */
function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** "+1,3" / "−0,7" — Vorzeichen immer sichtbar (auch bei Plus) und das echte Minuszeichen
    (siehe MINUS oben), sonst sieht "-0.7" bei tabular-nums wie ein Bindestrich-Präfix aus. */
function fmtZ(z: number): string {
  const s = Math.abs(z).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (z < 0 ? MINUS : '+') + s
}

/**
 * Referenz-Klassenzahl nach Freedman-Diaconis (Klassenbreite = 2·IQR/n^⅓) — NICHT mehr für
 * die angezeigten Balken (die zeigen jetzt jeden Monat einzeln, siehe `displayBinCountFor`),
 * sondern für die Bandbreite der Dichtekurve in `buildVerteilung`. Eine feste Zahl war dafür
 * zu grob: Eric hat einzelne Ausreißermonate (ein Dezember mit 3.874 € Ausgaben gegen einen
 * Sockel um 2.000 €), die den Wertebereich aufspannen. FD orientiert die Breite am
 * Interquartilsabstand, also an der Mitte der Daten statt an den Rändern, und bleibt damit
 * auch als reine Glättungs-Referenz robust gegen genau solche Ausreißer.
 */
function binCountFor(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const iqr   = quantile(s, 0.75) - quantile(s, 0.25)
  const range = s[s.length - 1] - s[0]
  if (iqr <= 0 || range <= 0) return 6
  return Math.min(12, Math.max(6, Math.round(range / (2 * iqr / Math.cbrt(values.length)))))
}

/**
 * Klassenzahl für die ANGEZEIGTEN Balken: eine Klasse je Monat.
 *
 * Vorher liefen alle Monate durch dieselbe 6–12er-Einteilung wie oben, mehrere Monate
 * teilten sich also eine breite Klasse (als gestapelte Einheiten unterscheidbar gemacht,
 * aber eben nebeneinander in EINER Spalte). Mit einer Klasse pro Monat rückt jeder Monat in
 * eine eigene, schmalere Spalte — nebeneinander statt übereinander gestapelt. Teilt sich
 * ausnahmsweise doch mal eine Klasse zwei exakt gleich gerundete Monate, greift dort
 * weiterhin die Stapel-Darstellung aus `monthStackShape`.
 */
function displayBinCountFor(values: number[]): number {
  return Math.max(6, values.length)
}

/**
 * Achsenmarken auf runden Beträgen innerhalb von [min, max].
 *
 * Bewusst selbst gerechnet statt recharts überlassen: eine number-Achse rundet
 * dort ihre Domain auf glatte Werte auf. Die Klassen hängen aber an min/max der
 * Daten, nicht an runden Zahlen — mit gerundeter Domain läge das Pixelraster der
 * Betragsachse neben dem der Balken, und genau darauf setzt der Marker des
 * laufenden Monats auf. Also: Domain fest, nur die Marken werden gerundet.
 */
function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min
  if (!(span > 0)) return [min]
  const raw  = span / target
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const out: number[] = []
  // Toleranz gegen Fließkomma-Drift beim Aufaddieren (3000,0000000000005 > 3000).
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) {
    out.push(Math.round(t * 1e6) / 1e6)
  }
  return out.length >= 2 ? out : [min, max]
}

/**
 * Klassiert die Monatswerte und tastet die KDE über denselben Wertebereich ab.
 *
 * `kurve.y` ist Dichte × Monate × Klassenbreite, also die Anzahl Monate, die man in einer
 * Klasse dieser Breite an dieser Stelle ERWARTEN würde. Damit stehen Balken und Kurve auf
 * derselben Y-Achse („Monate") — eine reine Dichteachse war der Grund, warum die Y-Achse
 * vorher ausgeblendet werden musste und die Karte nicht wie ein Diagramm aussah.
 */
function buildVerteilung(values: number[], binCount: number, currentValue: number | null): Verteilung {
  const min   = Math.min(...values)
  const span  = (Math.max(...values) - min) || Math.abs(min) || 1
  const max   = min + span
  const width = span / binCount
  // Bandbreite bewusst NICHT an die (jetzt sehr feine, ein Monat pro Klasse) Anzeige-
  // Klassenbreite gekoppelt — das hätte die Kurve bei bis zu 24 schmalen Klassen selbst
  // löchrig und spitz gemacht, sie soll aber die geglättete Form zeigen, nicht jeden Monat
  // einzeln nachzeichnen. Referenz ist stattdessen die grobe FD-Klassenzahl von
  // `binCountFor` (6–12), unabhängig davon, wie fein die Balken tatsächlich gezeichnet
  // werden. NICHT nach Silverman: Silverman optimiert die Dichteschätzung für sich, hier
  // muss die Kurve aber zu den Balken daneben passen — gemessen an Erics Ausreißer-
  // Datensatz erreichte die Silverman-Kurve nur 42 % der Balkenspitze und sah wie ein
  // Rechenfehler aus. Mit 0,8 × (grober) Klassenbreite sind es 66-79 %: erkennbar dieselbe
  // Verteilung, nur geglättet.
  const smoothWidth = span / binCountFor(values)
  const h     = smoothWidth * 0.8

  // Liegt der laufende Monat außerhalb der Historie (neuer Höchst- oder
  // Tiefstwert), fällt er auf die Randklasse — das Perzentil im Kopf sagt mit
  // 0 bzw. 100 ohnehin deutlicher, dass er aus dem Rahmen fällt.
  const currentIdx = currentValue == null
    ? -1
    : Math.min(binCount - 1, Math.max(0, Math.floor((currentValue - min) / width)))

  const bins = Array.from({ length: binCount }, (_, i) => {
    const last = i === binCount - 1
    const from = min + i * width
    // Die letzte Klasse endet exakt auf dem Maximum statt auf `from + width`:
    // bei 11 Klassen über 2.240 € liefert die Summe der Breiten durch
    // Fließkomma-Rundung 4.019,999… statt 4.020 — der teuerste Monat fiel
    // dadurch komplett aus dem Histogramm (17 von 18 Monaten gezählt).
    const to = last ? max : from + width
    return {
      // Nur noch Tooltip-Schlüssel und React-key — beschriftet wird die Achse
      // mit Beträgen, nicht mehr mit Klassenbereichen.
      label: compact(from) + ' bis ' + compact(to),
      from,
      to,
      // Die letzte Klasse schließt oben ein, sonst fiele das Maximum durchs Raster.
      count: values.filter(v => v >= from && (last ? v <= to : v < to)).length,
      isCurrent: i === currentIdx,
    }
  })

  const kurve = Array.from({ length: KURVE_PUNKTE }, (_, i) => {
    const x = min + (span * i) / (KURVE_PUNKTE - 1)
    return { x, y: kdeDensityAt(values, x, h) * values.length * width }
  })

  return { bins, kurve, min, max, width, h, ticks: niceTicks(min, max) }
}

/**
 * Muss außerhalb von MonatsVerteilung stehen (react-hooks/static-components):
 * eine im Render definierte Komponente wird bei jedem Durchlauf neu erzeugt und
 * verliert ihren State. `active`/`payload` schiebt recharts beim Klonen hinein,
 * `fmt` übergeben wir selbst.
 */
function BinTooltip({ active, payload, fmt }: {
  active?: boolean
  payload?: { payload?: object }[]
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  // Gezielt die Klassenzeile suchen, nicht payload[0] nehmen: die Dichtekurve hat ihren
  // eigenen Datensatz (feineres Raster als die Klassen) und landet ebenfalls im payload.
  const b = payload.find(p => p?.payload && 'from' in p.payload)?.payload as Bin | undefined
  if (!b) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-lg text-xs">
      {/* „bis" ausgeschrieben statt Gedankenstrich: bei negativen Klassen stand
          hier „−787 – −51", und Bis-Strich und Vorzeichen waren nicht mehr
          auseinanderzuhalten. */}
      <p className="text-popover-foreground font-medium tabular-nums">
        {fmt(b.from)}
        <span className="font-normal text-muted-foreground"> bis </span>
        {fmt(b.to)}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {b.count} {b.count === 1 ? 'Monat' : 'Monate'}
        {b.isCurrent && ' · dieser Monat liegt hier'}
      </p>
    </div>
  )
}

/**
 * Ein Punkt auf der Dichtekurve — für den laufenden Monat UND für Median/Mittelwert/Modus,
 * die vorher nur als vertikale Linie ohne Fixpunkt auf der Kurve zu sehen waren.
 *
 * Eigene Komponente statt einer im Render definierten Funktion (react-hooks/static-
 * components): sie braucht eigenen Hover-State, der bei jedem Neu-Erzeugen verloren ginge.
 * Der Betrag stand vorher permanent über dem Chart — dort kollidierte er mit der
 * Median-Beschriftung und dem Scheitel der Dichtekurve und wurde deshalb bei Kollision
 * ausgeblendet (ganz ohne Wert). Jetzt zeigt der Punkt den Betrag erst beim Hover/Fokus
 * direkt an sich selbst — „auf der Linie anfokussieren", nicht dauerhaft im Weg.
 */
function MarkerDot({ cx, cy, color, fmt, value, align, label, variant = 'current' }: {
  cx?: number
  cy?: number
  color: string
  fmt: (n: number) => string
  value: number
  /** Ausrichtung der Wertblase relativ zum Punkt, damit sie am Rand der Zeichenfläche
      nicht abgeschnitten wird — grob aus der Position des Punkts im Wertebereich abgeleitet. */
  align: 'start' | 'middle' | 'end'
  /** Beschriftung vor dem Betrag in der Hover-Blase, z.B. "Median" — ohne beim laufenden
      Monat, der hat schon eine eigene Legendenzeile "Dieser Monat" ohne Namenspräfix im Wert. */
  label?: string
  /** 'stat' zeichnet Median/Mittelwert/Modus kleiner und in Grau statt in der Modus-Farbe,
      damit sie neben dem (größeren, farbigen) Punkt des laufenden Monats erkennbar als
      Lagemaße und nicht als zweiter "aktueller Monat" wirken. */
  variant?: 'current' | 'stat'
}) {
  const [hover, setHover] = useState(false)
  if (cx == null || cy == null) return null

  const text = label ? `${label} ${fmt(value)}` : fmt(value)
  const boxW = Math.max(46, text.length * 6.5 + 16)
  const boxX = align === 'start' ? cx : align === 'end' ? cx - boxW : cx - boxW / 2
  // Sitzt der Punkt hoch (z. B. am Kurvenscheitel), fehlt über ihm der Platz für die
  // Blase — dann erscheint sie unter dem Punkt statt darüber.
  const above = cy > 40
  const boxY  = above ? cy - 34 : cy + 12
  const textY = above ? cy - 19 : cy + 27
  const baseR  = variant === 'current' ? 5   : 3.5
  const hoverR = variant === 'current' ? 6.5 : 5

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Unsichtbarer, großzügiger Hit-Bereich — der sichtbare Punkt allein ist zu klein,
          um ihn zuverlässig zu treffen. */}
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      <circle cx={cx} cy={cy} r={hover ? hoverR : baseR} fill={color} stroke="var(--card)" strokeWidth={2} />
      {hover && (
        <g>
          <rect
            x={boxX} y={boxY} width={boxW} height={22} rx={5}
            fill="var(--popover)" stroke="var(--border)"
          />
          <text
            x={boxX + boxW / 2} y={textY}
            textAnchor="middle" fontSize={11} fontWeight={600}
            fill="var(--popover-foreground)"
          >
            {text}
          </text>
        </g>
      )}
    </g>
  )
}

export function MonatsVerteilung({ history, current }: Props) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  // GuV als Vorgabe: „habe ich diesen Monat mehr eingenommen als ausgegeben" ist
  // die Frage, die die Karte beantworten soll — Ausgaben und Einnahmen einzeln
  // sind der Blick dahinter.
  const [mode, setMode] = useState<AnalyseMode>('guv')
  const values       = history[mode]
  const currentValue = current?.[mode] ?? null
  const color        = COLOR[mode]

  const binCount = useMemo(
    () => (values.length >= MIN_MONTHS ? displayBinCountFor(values) : 6),
    [values],
  )

  const vert = useMemo(
    () => (values.length >= MIN_MONTHS ? buildVerteilung(values, binCount, currentValue) : null),
    [values, binCount, currentValue],
  )

  if (!vert) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h2 className="text-sm font-medium text-foreground">{TITLE[mode]}</h2>
          <ModeSwitch value={mode} options={ANALYSE_MODE_OPTIONS} onChange={setMode} />
        </div>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Noch nicht genug Datenhistorie für eine verlässliche Verteilung
          {values.length > 0 && ` — ${values.length} von ${MIN_MONTHS} Monaten vorhanden`}.
        </p>
      </div>
    )
  }

  const { bins, kurve, min, max, width, h, ticks } = vert
  const med        = median(values)
  const avg        = mean(values)
  const modusPunkt = modeFromKurve(kurve)
  const modus      = modusPunkt.x
  const sd         = stddev(values, avg)
  const percentile = currentValue != null ? computePercentileRank(values, currentValue) : null
  const countBelow = currentValue != null ? values.filter(v => v < currentValue).length : null
  const zScore     = currentValue != null && sd > 0 ? (currentValue - avg) / sd : null
  // Auffällig heißt „liegt am Rand der eigenen Historie" — in beide Richtungen
  // und ohne Wertung: ein einnahmenstarker Monat ist so auffällig wie ein
  // ausgabenstarker. Als Farbe die des Modus, nicht --destructive: das ist in
  // jedem Theme byte-identisch mit --chart-expense und wäre von der Verteilung
  // selbst nicht zu unterscheiden.
  const striking = percentile != null && (percentile >= 75 || percentile <= 25)

  // Ausrichtung der Wertblase relativ zum Punkt, damit sie am Rand der Zeichenfläche nicht
  // abgeschnitten wird — für alle vier Marker (laufender Monat, Median, Mittelwert, Modus)
  // dieselbe Regel, grob aus der Position im Wertebereich abgeleitet.
  const alignFor = (x: number): 'start' | 'middle' | 'end' =>
    x < min + (max - min) * 0.25 ? 'start'
    : x > max - (max - min) * 0.25 ? 'end'
    : 'middle'

  // Der Marker sitzt auf dem exakten Betrag des laufenden Monats, nicht mehr auf der
  // Klassenmitte — dafür die zweite Achse „betrag" unten. Geklemmt wird nur auf den
  // Rand der Achse: ein Monat jenseits der Historie hat kein Stück Kurve, auf dem er
  // sitzen könnte, das Perzentil im Kopf sagt dazu ohnehin 0 bzw. 100.
  const dotX = currentValue == null ? null : Math.min(max, Math.max(min, currentValue))
  const dotY = dotX == null ? null : kdeDensityAt(values, dotX, h) * values.length * width
  const dotAlign = dotX == null ? 'middle' : alignFor(dotX)

  // Median/Mittelwert liegen wie der laufende Monat auf der Kurve, nicht auf einer eigenen
  // Höhe — sonst schwebten die Punkte sichtbar über oder unter der Kurve statt auf ihr zu
  // sitzen. Der Modus-Punkt braucht das nicht: seine Höhe IST der Kurvenscheitel (modusPunkt.y).
  const medY = kdeDensityAt(values, med, h) * values.length * width
  const avgY = kdeDensityAt(values, avg, h) * values.length * width

  // Zeichnet eine Klasse als Stapel einzelner, durch schmale Lücken getrennter Einheiten
  // statt eines durchgehenden Balkens — eine Einheit pro Monat in dieser Klasse. Keine
  // eigene Komponente nötig (kein Hook, kein State): recharts ruft das bei jedem Render neu
  // auf, `mode`/`color` kommen aus dem Closure.
  function monthStackShape(props: { x?: number; y?: number; width?: number; height?: number; payload?: Bin }) {
    const { x = 0, y = 0, width: w = 0, height: hgt = 0, payload } = props
    const b = payload
    if (!b || b.count === 0) return <g />

    const fill = mode === 'guv'
      ? (b.to <= 0 ? 'var(--chart-expense)' : 'var(--chart-income)')
      : color
    const gap   = Math.min(2, hgt / b.count / 4)
    const unitH = Math.max(1, (hgt - gap * (b.count - 1)) / b.count)

    return (
      <g>
        {Array.from({ length: b.count }, (_, i) => (
          <rect
            key={i}
            x={x}
            // Von unten nach oben stapeln, damit die Klasse wie ein Balken vom Nullpunkt
            // aus wächst statt von oben herunterzuhängen.
            y={y + hgt - (i + 1) * unitH - i * gap}
            width={w}
            height={unitH}
            rx={Math.min(2, unitH / 2)}
            fill={fill}
            fillOpacity={0.75}
            // Der laufende Monat wird umrandet, nicht umgefärbt — sonst wäre in der
            // GuV-Ansicht seine Vorzeichenfarbe überschrieben.
            stroke={b.isCurrent ? 'var(--foreground)' : undefined}
            strokeWidth={b.isCurrent ? 1 : 0}
          />
        ))}
      </g>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-medium text-foreground">{TITLE[mode]}</h2>
        <ModeSwitch value={mode} options={ANALYSE_MODE_OPTIONS} onChange={setMode} />
      </div>

      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="text-xs text-muted-foreground">
          Monate je Betragsklasse · monatliche {NOUN[mode]}, letzte {values.length} abgeschlossene Monate
        </p>
        {percentile != null && countBelow != null && (
          <p
            className="text-xs font-semibold tabular-nums"
            style={{ color: striking ? color : 'var(--muted-foreground)' }}
          >
            Dieser Monat {fmt(currentValue!)} · {percentile}. Perzentil
            <span className="font-normal"> — höher als in {countBelow} von {values.length} Monaten</span>
            {/* z-Score direkt neben dem Perzentil statt unten in der Legende: er ist wie das
                Perzentil eine Aussage über DIESEN Monat (wie viele Standardabweichungen vom
                Mittelwert entfernt), σ selbst (die Streuung der ganzen Verteilung) steht
                unten bei Median/Mittelwert/Modus. */}
            {zScore != null && <span className="font-normal"> · z {fmtZ(zScore)}</span>}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={215}>
        {/* right: 8 reichte nicht für den Hover-Punkt des laufenden Monats — liegt der
            Monat außerhalb der bisherigen Spanne (neuer Höchst-/Tiefstwert), klemmt
            `dotX` exakt auf `max`, also an den rechten Rand der Zeichenfläche. Dort blieb
            dem Punkt (Hit-Kreis r=14) kaum Luft, er wurde vom SVG-Rand angeschnitten —
            das sah aus wie eine durchgezogene goldene Linie, war aber der halb
            abgeschnittene Punkt.
            top: 46 statt 30 — die Y-Domain bekommt zwar unten eine Einheit Puffer über der
            höchsten Klasse (siehe YAxis), aber Domain-Puffer ist relativ zur Datenspanne:
            je höher der höchste Stapel (mehr Monate mit demselben gerundeten Betrag, seit
            jeder Monat seine eigene, feine Klasse hat), desto mehr Einheiten teilen sich
            dieselbe Zeichenfläche und desto WENIGER Pixel bleiben pro Einheit übrig — eine
            feste Domain-Einheit Puffer schrumpft also in echten Pixeln, je höher der Stapel
            wird. Ab ~5 Bausteinen reichte das nicht mehr, der oberste wirkte angeschnitten.
            Der Rand hier ist dagegen ein fester Pixelwert, unabhängig von der Stapelhöhe. */}
        <ComposedChart data={bins} margin={{ top: 46, right: 32, left: -22, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          {/* Zwei X-Achsen über derselben Zeichenfläche:
              • die kategoriale trägt die Balken, ist aber ausgeblendet — sie war
                mit den Klassenbereichen beschriftet („−787 bis −51"), und bis zu
                zwölf davon nebeneinander waren nicht mehr zu lesen;
              • die Betragsachse zeigt stattdessen runde Beträge und trägt alles,
                was an einer exakten Stelle sitzen muss: Kurve, Median, Marker.
              Beide rastern identisch: die Domain [min, max] sind genau die
              Außenkanten der Klassen, also bildet Klasse i in der Band-Skala
              (Breite/Klassenzahl) und in der Betragsskala auf dieselben Pixel ab. */}
          <XAxis dataKey="label" hide />
          <XAxis
            xAxisId="betrag"
            type="number"
            // Positionsschlüssel für die Dichtekurve, die auf dieser Achse liegt.
            dataKey="x"
            domain={[min, max]}
            // Pflicht, nicht Deko: ohne allowDataOverflow verwirft recharts eine
            // feste Domain, sobald die Achse keine eigene Serie hat (siehe
            // parseNumericalUserDomain — dataDomain == null ⇒ undefined), und
            // rechnet sich eine eigene aus. Damit wäre das Raster wieder verschoben.
            allowDataOverflow
            ticks={ticks}
            tickFormatter={compact}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)', className: 'tabular-nums' }}
            axisLine={false}
            tickLine={false}
          />
          {/* Ganze Monate, keine Zwischenschritte — die Achse zählt Monate. Domain mit einer
              Einheit Luft nach oben statt recharts' Default [0, dataMax]: sonst reicht die
              höchste Klasse exakt bis an den oberen Rand der Zeichenfläche, und ihre
              abgerundeten Ecken bzw. der Punkt des laufenden Monats (falls er dort sitzt)
              werden vom Rand abgeschnitten. */}
          <YAxis
            allowDecimals={false}
            domain={[0, (max: number) => Math.ceil(max) + 1]}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<BinTooltip fmt={fmt} />} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
          {/* Ein durchgehender Balken zeigte 7 Monate als einen einzigen Klotz — nicht zu
              unterscheiden von einem einzelnen Monat mit siebenfacher Ausprägung. Die Klasse
              stapelt sich jetzt aus einzelnen, durch schmale Lücken getrennten Einheiten,
              eine je Monat: derselbe Gesamteindruck der Verteilung, aber „7 Monate" ist jetzt
              auch optisch 7 Dinge, nicht eine Größe. */}
          <Bar dataKey="count" isAnimationActive={false} shape={monthStackShape} />
          {/* Die KDE liegt als gestrichelte Linie über den Balken: die Balken
              sind die gezählten Monate, die Kurve die geschätzte Form dahinter
              — gestrichelt, damit die beiden nicht verwechselt werden.
              Kräftiger als vorher (2 px, "3 3", kein Fill): über den Balken in
              derselben Farbe war die feine Strichlinie kaum auszumachen. Der
              lange Strich und die auslaufende Fläche darunter machen sie als
              Kurve lesbar, ohne die Balken zu übermalen — daher nur 14 % Deckung
              am Kurvenrand und der Verlauf gegen 0 nach unten. */}
          <defs>
            <linearGradient id={`kde-fill-${mode}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Eigener, feiner Datensatz auf der Betragsachse statt der Klassenzeilen: nur
              so hat die Kurve ihren echten Scheitel und ihre Ausläufer (s. KURVE_PUNKTE).
              tooltipType="none", weil der Tooltip die Klasse erklärt, nicht die Dichte. */}
          <Area
            xAxisId="betrag"
            data={kurve}
            dataKey="y"
            type="monotone"
            tooltipType="none"
            stroke={color}
            strokeWidth={2.5}
            strokeDasharray="7 4"
            fill={`url(#kde-fill-${mode})`}
            dot={false}
            activeDot={false}
          />
          {/* Der laufende Monat als Punkt AUF der Kurve, nicht nur als umrandeter
              Balken: die Umrandung ging in derselben Farbe wie die Füllung unter,
              vor allem bei nur einem Monat in der Klasse. Der Ring in --card hebt
              ihn von Balken und Kurve ab. Der Betrag steht nicht mehr permanent
              daneben (siehe MarkerDot) — erst beim Hover, direkt am Punkt. */}
          {dotX != null && dotY != null && (
            <ReferenceDot
              xAxisId="betrag"
              x={dotX}
              y={dotY}
              shape={(props: { cx?: number; cy?: number }) => (
                <MarkerDot
                  cx={props.cx}
                  cy={props.cy}
                  color={color}
                  fmt={fmt}
                  value={currentValue!}
                  align={dotAlign}
                />
              )}
            />
          )}
          {/* Median/Mittelwert/Modus zusätzlich als Punkte AUF der Kurve, nicht nur als
              vertikale Linie — sonst war auf einen Blick nicht zu erkennen, WO auf der Kurve
              sie liegen, nur dass es irgendwo eine graue Linie gibt. Kleiner und grau statt
              in der Modus-Farbe, damit der (größere, farbige) Punkt des laufenden Monats
              weiterhin der auffälligste bleibt. */}
          <ReferenceDot
            xAxisId="betrag"
            x={med}
            y={medY}
            shape={(props: { cx?: number; cy?: number }) => (
              <MarkerDot
                cx={props.cx} cy={props.cy}
                color="var(--muted-foreground)" fmt={fmt} value={med}
                align={alignFor(med)} label="Median" variant="stat"
              />
            )}
          />
          <ReferenceDot
            xAxisId="betrag"
            x={avg}
            y={avgY}
            shape={(props: { cx?: number; cy?: number }) => (
              <MarkerDot
                cx={props.cx} cy={props.cy}
                color="var(--muted-foreground)" fmt={fmt} value={avg}
                align={alignFor(avg)} label="Mittelwert" variant="stat"
              />
            )}
          />
          <ReferenceDot
            xAxisId="betrag"
            x={modusPunkt.x}
            y={modusPunkt.y}
            shape={(props: { cx?: number; cy?: number }) => (
              <MarkerDot
                cx={props.cx} cy={props.cy}
                color="var(--muted-foreground)" fmt={fmt} value={modus}
                align={alignFor(modus)} label="Modus" variant="stat"
              />
            )}
          />
          {/* Median auf dem exakten Betrag, nicht mehr auf der Klassenmitte. Ohne
              Beschriftung oben: die stand direkt im Scheitel der (goldenen) Dichtekurve
              und wirkte dadurch wie ein Teil davon, obwohl beide nichts miteinander zu tun
              haben — die Linie hier ist grau, nicht golden. Der Wert steht stattdessen
              unten in der Legende. */}
          <ReferenceLine
            xAxisId="betrag"
            x={med}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 3"
          />
          {/* Mittelwert als zweite, gepunktete Linie daneben — siehe mean() oben. Beide
              grau, damit keine der beiden wie ein Teil der (goldenen) Dichtekurve wirkt;
              unterschieden werden sie über das Strichmuster, genau wie in der Legende
              darunter. Faellt bei einer symmetrischen Verteilung mit dem Median zusammen,
              bei Erics schiefen Daten liegen sie sichtbar auseinander. */}
          <ReferenceLine
            xAxisId="betrag"
            x={avg}
            stroke="var(--muted-foreground)"
            strokeDasharray="1 3"
          />
          {/* Modus als dritte Linie — sitzt per Definition (modeFromKurve) exakt auf dem
              Scheitel der goldenen Kurve und macht daher optisch kaum etwas Neues sichtbar.
              Trotzdem eine eigene Linie statt nur "der Scheitel ist der Modus" im Kopf: erst
              damit stehen alle drei Lagemaße nebeneinander in derselben Legende und lassen
              sich auf einen Blick vergleichen, ohne die Kurve selbst abzulesen. */}
          <ReferenceLine
            xAxisId="betrag"
            x={modus}
            stroke="var(--muted-foreground)"
            strokeDasharray="6 2 1 2"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.75 }} />
          Monate je Klasse
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-[2.5px] border-dashed" style={{ borderColor: color }} />
          Dichtekurve
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block w-4 border-t-[2.5px] border-dashed border-muted-foreground" />
          Median {fmt(med)}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block w-4 border-t-[2.5px] border-dotted border-muted-foreground" />
          Mittelwert {fmt(avg)}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          {/* Kein Tailwind-Randstil trifft "6 2 1 2" (Strich-Punkt) — daher als Inline-SVG,
              damit die Legende exakt das Muster der ReferenceLine zeigt statt einer
              Näherung. */}
          <svg width="16" height="3" className="shrink-0">
            <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="var(--muted-foreground)" strokeWidth="2.5" strokeDasharray="6 2 1 2" />
          </svg>
          Modus {fmt(modus)}
        </span>
        {/* Kein Punkt/keine Linie im Chart dafür — σ ist keine Stelle auf der Achse, sondern
            eine Spannweite, und deshalb hier reiner Text statt eines vierten Markers. Der
            z-Score (wie viele σ der laufende Monat vom Mittelwert entfernt ist) steht
            stattdessen oben neben dem Perzentil, weil er wie das Perzentil eine Aussage über
            DIESEN Monat ist, nicht über die Verteilung insgesamt. */}
        <span className="flex items-center gap-1.5 tabular-nums">
          σ {fmt(sd)}
        </span>
        {currentValue != null && (
          <span className="flex items-center gap-1.5">
            {/* Punkt auf der Kurve + umrandeter Balken meinen denselben Monat — ein
                Legendeneintrag für beides. */}
            <span
              className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-card"
              style={{ backgroundColor: color }}
            />
            Dieser Monat
          </span>
        )}
      </div>
    </div>
  )
}
