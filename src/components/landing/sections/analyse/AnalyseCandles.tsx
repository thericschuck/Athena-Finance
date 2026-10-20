'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { C, F } from '@/components/landing/landing-tokens'
import { gsap } from '@/components/landing/islands/gsap-setup'
import { hashNoise } from '@/components/landing/shared/hash-noise'

/**
 * Candlestick-Hintergrund für „III · Die Analyse" (siehe Aufrufstelle) — rein
 * dekorativ, kein Bezug zu echten Kursdaten. Feste, deterministisch
 * berechnete Werte statt Math.random(): ein clientseitig zufällig erzeugtes
 * Muster läge beim ersten Client-Render anders als beim Server-Rendering und
 * löste einen Hydration-Mismatch aus.
 */
const CANDLE_COUNT = 52
const CANDLE_W = 900
const CANDLE_H = 560
// Grundlinie folgt keiner geraden Diagonale mehr, sondern demselben
// Auf-ab-auf-Pfad wie die rote Referenzlinie: von unten links auf einen
// ersten Gipfel, zurück in ein Tal (etwa auf Höhe der dunklen Chart-Karte),
// dann steil weiter nach oben rechts. `CANDLE_KEYFRAMES` sind normalisierte
// Stützpunkte (t=Position 0..1 im Verlauf, y=0 oben/1 unten im Chart);
// `smoothstep` rundet die Übergänge zwischen ihnen, statt scharfe Knicke an
// Gipfel/Tal zu erzeugen.
const CANDLE_Y_TOP = 90
const CANDLE_Y_BOTTOM = 480
const CANDLE_KEYFRAMES = [
  { t: 0, y: 1 },
  { t: 0.32, y: 0.1 },
  { t: 0.6, y: 0.68 },
  { t: 1, y: 0 },
]
function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}
function candleBaselineYNorm(t: number) {
  for (let i = 0; i < CANDLE_KEYFRAMES.length - 1; i++) {
    const a = CANDLE_KEYFRAMES[i]
    const b = CANDLE_KEYFRAMES[i + 1]
    if (t <= b.t || i === CANDLE_KEYFRAMES.length - 2) {
      const local = smoothstep((t - a.t) / (b.t - a.t))
      return a.y + (b.y - a.y) * local
    }
  }
  return CANDLE_KEYFRAMES[CANDLE_KEYFRAMES.length - 1].y
}
/** `channel` trennt die drei unabhängigen Rauschquellen pro Kerze
    (Kurslücke, Docht oben, Docht unten) — vorher über den `seed`-
    Multiplikator (0.9/1.7/2.3), jetzt als Kanal-Index in denselben Hash. */
function pseudoNoise(i: number, channel: number) {
  return hashNoise(i * 4 + channel)
}
/**
 * Jede Kerze bekommt jetzt einen echten Open/Close-Bezug statt unabhängigem
 * Zickzack: der Schlusskurs folgt der Trendlinie (`candleBaselineYNorm`), der
 * Eröffnungskurs sitzt nah am Schlusskurs der Vorkerze plus einer kleinen
 * Kurslücke — genau wie bei echten OHLC-Daten. Körper = Spanne zwischen Open
 * und Close, Docht = kleiner, unabhängiger Über- bzw. Unterstand darüber
 * hinaus. Das Ergebnis liest sich wie ein plausibler Kursverlauf statt wie
 * eine reine Textur.
 */
const CANDLES = Array.from({ length: CANDLE_COUNT }, (_, i) => {
  const t = i / (CANDLE_COUNT - 1)
  const closeY = CANDLE_Y_TOP + candleBaselineYNorm(t) * (CANDLE_Y_BOTTOM - CANDLE_Y_TOP)
  const prevT = i === 0 ? t : (i - 1) / (CANDLE_COUNT - 1)
  const prevCloseY = CANDLE_Y_TOP + candleBaselineYNorm(prevT) * (CANDLE_Y_BOTTOM - CANDLE_Y_TOP)
  const openY = i === 0 ? closeY + 14 : prevCloseY + pseudoNoise(i, 0) * 9
  const bodyTop = Math.min(openY, closeY)
  const bodyBottom = Math.max(openY, closeY)
  const bodyH = Math.max(3, bodyBottom - bodyTop)
  const wickTop = bodyTop - Math.max(4, 10 + pseudoNoise(i, 1) * 16)
  const wickBottom = bodyBottom + Math.max(4, 10 + pseudoNoise(i, 2) * 16)
  // Klassische Candlestick-Konvention: gestiegener Kurs (Close über Open,
  // also kleineres y) hohl/nur Kontur, gefallener Kurs voll gefüllt.
  const up = closeY < openY
  return { wickTop, wickBottom, bodyTop, bodyH, up }
})

/**
 * Wächst beim Durchscrollen der umgebenden Sektion von der Grundlinie aus
 * auf — ein scrub-Reveal (siehe scroll-storytelling-Skill, Pattern 1), kein
 * fest getimtes Abspielen: Fortschritt entspricht exakt der Scrollposition,
 * rückwärts scrollen zieht die Kerzen also auch wieder ein.
 *
 * `attr`-Tweens auf y/height/y1 statt transform+scaleY: dafür bräuchte es
 * `transform-box: fill-box`, damit sich SVG-Formen um die eigene Mitte statt
 * um den Ursprung des `<svg>` skalieren — das direkte Animieren der
 * Geometrie selbst kommt ganz ohne diese Sonderregel aus.
 */
/** Dekorativer Ablesewert zur gehoverten Kerze — aus ihrer eigenen Geometrie
    abgeleitet, damit Server- und Client-Render identisch bleiben. */
function candleValue(i: number) {
  const c = CANDLES[i]
  return Math.round(2400 + (CANDLE_Y_BOTTOM - c.wickBottom) * 6 + (c.wickBottom - c.wickTop) * 4)
}

export function AnalyseCandles() {
  const still = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wickRefs = useRef<(SVGLineElement | null)[]>([])
  const bodyRefs = useRef<(SVGRectElement | null)[]>([])
  const [hover, setHover] = useState<number | null>(null)
  const hoverRef = useRef<number | null>(null)

  useEffect(() => {
    if (still) return
    const svg = svgRef.current
    const scene = svg?.closest('section')
    if (!svg || !scene) return

    // Die Kerzen bauen sich auf dem Weg IN die Szene auf und stehen genau
    // dann fertig, wenn das Pinning greift (`top top`) — danach sind sie
    // ruhiger Hintergrund für die vier Schritte, statt weiter zu wachsen.
    const tl = gsap.timeline({
      scrollTrigger: { trigger: scene, start: 'top bottom', end: 'top top', scrub: true },
    })

    CANDLES.forEach((c, i) => {
      const wick = wickRefs.current[i]
      const body = bodyRefs.current[i]
      if (!wick || !body) return
      gsap.set(wick, { attr: { y1: c.wickBottom } })
      gsap.set(body, { attr: { y: c.wickBottom, height: 0 } })
      // Enger gestaffelt (statt strikt links-nach-rechts) und mit leichtem
      // Jitter statt gleichmäßigem Abstand — wirkt weniger wie ein sauberer
      // Sweep, mehr wie ungleichmäßiges Aufflackern.
      const pos = Math.max(0, i * 0.07 + hashNoise(i) * 0.02)
      tl.to(wick, { attr: { y1: c.wickTop }, duration: 0.6, ease: 'none' }, pos)
      tl.to(body, { attr: { y: c.bodyTop, height: c.bodyH }, duration: 0.6, ease: 'none' }, pos)
    })

    return () => {
      tl.scrollTrigger?.kill()
      tl.kill()
    }
  }, [still])

  /*
   * Hover wird NICHT per pointer-events an den Kerzen selbst erkannt, sondern
   * aus der Zeigerposition über der ganzen Szene berechnet — wie das
   * Fadenkreuz eines echten Charts. Grund: die Kerzen liegen hinter der
   * Textspalte und der Karte, deren Kästen den Zeiger abfangen würden; an
   * ihnen selbst zu lauschen träfe nur die schmalen Ränder links und rechts.
   * Über Text/Karte wird die Hervorhebung bewusst zurückgenommen — dort soll
   * gelesen und nicht gespielt werden.
   */
  useEffect(() => {
    const wrap = wrapRef.current
    const host = wrap?.parentElement
    if (!wrap || !host) return

    const set = (v: number | null) => {
      if (v === hoverRef.current) return
      hoverRef.current = v
      setHover(v)
    }
    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.('.analyse-copy, .split-card')) {
        set(null)
        return
      }
      const r = wrap.getBoundingClientRect()
      if (!r.width) return
      const rel = (e.clientX - r.left) / r.width
      if (rel < 0 || rel > 1) {
        set(null)
        return
      }
      set(Math.max(0, Math.min(CANDLE_COUNT - 1, Math.floor(rel * CANDLE_COUNT))))
    }
    const onLeave = () => set(null)

    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const hoveredX = hover === null ? 0 : (CANDLE_W / CANDLE_COUNT) * (hover + 0.5)
  const hoveredTop = hover === null ? 0 : CANDLES[hover].wickTop

  return (
    <div
      ref={wrapRef}
      aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, top: '6%', height: '88%', pointerEvents: 'none' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANDLE_W} ${CANDLE_H}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {hover !== null && (
          <line
            x1={hoveredX}
            x2={hoveredX}
            y1={0}
            y2={CANDLE_H}
            stroke={C.goldInk}
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.32}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {CANDLES.map((c, i) => {
          const x = (CANDLE_W / CANDLE_COUNT) * (i + 0.5)
          const bodyW = (CANDLE_W / CANDLE_COUNT) * 0.72
          const on = hover === i
          const tone = on ? C.goldInk : C.inkFaint
          return (
            /*
              y/height/y1 bleiben bewusst statische Props: GSAP schreibt diese
              Attribute pro Frame, React fasst sie beim Re-Render (Hover) nur
              an, wenn sich der PROP-Wert ändert — täte er das, würde jeder
              Hover den Aufbau-Fortschritt der Kerze zurücksetzen.
            */
            <g key={i} opacity={on ? 0.5 : 0.15} style={{ transition: 'opacity .18s ease' }}>
              <line
                ref={(el) => {
                  wickRefs.current[i] = el
                }}
                x1={x}
                x2={x}
                y1={still ? c.wickTop : c.wickBottom}
                y2={c.wickBottom}
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
                style={{ stroke: tone, transition: 'stroke .18s ease' }}
              />
              <rect
                ref={(el) => {
                  bodyRefs.current[i] = el
                }}
                x={x - bodyW / 2}
                y={still ? c.bodyTop : c.wickBottom}
                width={bodyW}
                height={still ? c.bodyH : 0}
                strokeWidth={c.up ? 1.6 : 0}
                vectorEffect="non-scaling-stroke"
                style={{
                  // "Hohle" (gestiegene) Kerzen bekommen keinen echten
                  // Transparent-Körper — sie werden mit der Seitenfarbe
                  // gefüllt, genau wie in echten Chart-Bibliotheken. Sonst
                  // schiene der Docht (dahinterliegend im selben <g>) als
                  // Linie durch den Körper, weil `fill: none` ihn nicht
                  // verdeckt.
                  fill: c.up ? C.parchment : tone,
                  stroke: c.up ? tone : 'none',
                  transition: 'fill .18s ease, stroke .18s ease',
                }}
              />
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <span
          style={{
            position: 'absolute',
            left: `${(hoveredX / CANDLE_W) * 100}%`,
            top: `${(hoveredTop / CANDLE_H) * 100}%`,
            transform: 'translate(-50%, -150%)',
            padding: '5px 10px',
            borderRadius: '999px',
            border: `1px solid ${C.rule}`,
            backgroundColor: 'rgba(244,239,228,.94)',
            fontFamily: F.mono,
            fontSize: '10px',
            whiteSpace: 'nowrap',
            color: C.inkSubtle,
          }}
        >
          {candleValue(hover).toLocaleString('de-DE')} €
        </span>
      )}
    </div>
  )
}
