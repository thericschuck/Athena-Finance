import { useEffect, useRef, useState } from 'react'
import { TICKER_BASE } from '@/components/landing/dashboard-mock/mock-data'

/**
 * Zählt eine Zahl hoch, sobald `run` true wird.
 *
 * `useRef` für den Startzeitpunkt statt State: sonst würde jeder Frame ein
 * Re-Render des Eltern-Hooks auslösen und die Animation gegen sich selbst
 * laufen.
 */
export function useCountUp(target: number, run: boolean, decimals = 0) {
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
export function useLiveTicker(base: typeof TICKER_BASE, active: boolean) {
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
export function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
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
export function usePulseDirection(value: number) {
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

export function useTilt() {
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
