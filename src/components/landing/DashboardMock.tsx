'use client'

import { useEffect, useRef, useState } from 'react'
import { BarChart2, PieChart, Wallet, LineChart, CandlestickChart, Target } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { C, F, kicker } from './landing-tokens'

/**
 * Illustratives Dashboard für die Vollbild-Enthüllung.
 *
 * Alle Zahlen sind Beispieldaten. Der gesamte Block ist `aria-hidden`: ein
 * Screenreader würde sonst erfundene Kontostände als echte Finanzdaten
 * vorlesen. Die Bedeutung trägt die Bildunterschrift in LandingClient.
 */

const NAV = [
  { icon: BarChart2, label: 'Dashboard', active: true },
  { icon: PieChart, label: 'Depot' },
  { icon: Wallet, label: 'Finance' },
  { icon: LineChart, label: 'Analyse' },
  { icon: CandlestickChart, label: 'Crypto' },
  { icon: Target, label: 'Strategie' },
]

const STATS = [
  { label: 'Vermögen', value: 84320, prefix: '', suffix: ' €', delta: '+12,4 %' },
  { label: 'Einnahmen / Monat', value: 4850, prefix: '', suffix: ' €', delta: '+5,2 %' },
  { label: 'Ausgaben / Monat', value: 2190, prefix: '', suffix: ' €', delta: '−8,1 %' },
  { label: 'Sparquote', value: 54.8, prefix: '', suffix: ' %', delta: '+2,3 %', decimals: 1 },
]

const MONTHS = [
  { m: 'Apr', ein: 4200, aus: 2600 },
  { m: 'Mai', ein: 4800, aus: 2900 },
  { m: 'Jun', ein: 3900, aus: 2400 },
  { m: 'Jul', ein: 5400, aus: 3100 },
  { m: 'Aug', ein: 4500, aus: 2500 },
  { m: 'Sep', ein: 4850, aus: 2190 },
]
const MONTH_MAX = 5400

const MIX = [
  { label: 'Aktien', pct: 50, color: C.gold },
  { label: 'Crypto', pct: 30, color: C.oliveLight },
  { label: 'Cash', pct: 20, color: C.cream },
]

const BOOKINGS = [
  { day: '01.09.', label: 'Miete', cat: 'Wohnen', amount: -1200 },
  { day: '30.08.', label: 'Gehalt', cat: 'Einkommen', amount: 3800 },
  { day: '29.08.', label: 'Sparplan MSCI World', cat: 'Depot', amount: -500 },
  { day: '28.08.', label: 'Freelance-Projekt', cat: 'Einkommen', amount: 950 },
  { day: '27.08.', label: 'Wocheneinkauf', cat: 'Lebensmittel', amount: -68.4 },
]

const euro = (n: number) =>
  `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

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

  return run ? value.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }) : (0).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function StatCard({ stat, run }: { stat: (typeof STATS)[number]; run: boolean }) {
  const shown = useCountUp(stat.value, run, stat.decimals ?? 0)
  return (
    <div
      style={{
        backgroundColor: C.onyxLift,
        border: `1px solid ${C.ruleOnSoft}`,
        padding: 'clamp(14px, 1.6vw, 22px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
      }}
    >
      <span
        className="mock-label"
        style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: C.onSubtle }}
      >
        {stat.label}
      </span>
      <span
        style={{
          fontFamily: F.display,
          fontSize: 'clamp(22px, 2.4vw, 38px)',
          lineHeight: 1,
          color: C.onCream,
          letterSpacing: '-0.02em',
          /* tabellarische Ziffern: sonst springt die Breite bei jedem
             Zählschritt und die Karte zappelt */
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {shown}
        {stat.suffix}
      </span>
      <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: C.olive }}>
        {stat.delta}
      </span>
    </div>
  )
}

export function DashboardMock({ run }: { run: boolean }) {
  const [hoverBar, setHoverBar] = useState<number | null>(null)
  const [hoverSlice, setHoverSlice] = useState<number | null>(null)

  // Donut: Segmente als gestrichelter Kreis, Umfang 2πr bei r=42.
  // Offsets vorab kumulieren statt im map() mitzuzählen — eine Variable
  // während des Renderns fortzuschreiben ist in React nicht zulässig und
  // liefert bei unterbrochenem Rendering falsche Werte.
  const R = 42
  const CIRC = 2 * Math.PI * R
  const SEGMENTS = MIX.reduce<{ seg: (typeof MIX)[number]; offset: number }[]>((list, seg) => {
    const prev = list[list.length - 1]
    const offset = prev ? prev.offset + (prev.seg.pct / 100) * CIRC : 0
    return [...list, { seg, offset }]
  }, [])

  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: C.onyxWarm,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 210px) minmax(0, 1fr)',
        overflow: 'hidden',
      }}
      className="mock-root"
    >
      {/* Sidebar */}
      <aside
        className="mock-side"
        style={{
          borderRight: `1px solid ${C.ruleOnSoft}`,
          padding: 'clamp(18px, 2vw, 30px) clamp(10px, 1vw, 16px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px', marginBottom: '26px' }}>
          <Logo variant="transparent" size={22} />
          <span style={{ fontFamily: F.display, fontSize: '15px', color: C.onCream }}>Athena Finance</span>
        </div>
        {NAV.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '11px',
              padding: '10px 12px',
              fontSize: 'clamp(12px, 1vw, 14px)',
              color: active ? C.gold : C.onSubtle,
              backgroundColor: active ? 'rgba(184,143,81,.1)' : 'transparent',
              borderLeft: `2px solid ${active ? C.gold : 'transparent'}`,
            }}
          >
            <Icon size={15} strokeWidth={1.6} />
            {label}
          </div>
        ))}
      </aside>

      {/* Inhalt */}
      <div
        style={{
          padding: 'clamp(18px, 2.2vw, 34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 1.4vw, 20px)',
          minWidth: 0,
        }}
      >
        <div
          className="mock-stats"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'clamp(10px, 1.2vw, 16px)' }}
        >
          {STATS.map((s) => (
            <StatCard key={s.label} stat={s} run={run} />
          ))}
        </div>

        {/*
          Feste Höhe statt flex:1 — im Vollbild ist die Fläche rund 700px hoch,
          und ein auf volle Höhe gezogenes Balkendiagramm wirkt wie Spaghetti.
          Der Rest der Höhe geht an die Buchungsliste darunter.
        */}
        <div
          className="mock-charts"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 'clamp(10px, 1.2vw, 16px)', height: 'clamp(210px, 30vh, 330px)', flexShrink: 0 }}
        >
          {/* Balken mit Hover */}
          <div
            style={{
              backgroundColor: C.onyxLift,
              border: `1px solid ${C.ruleOnSoft}`,
              padding: 'clamp(14px, 1.6vw, 22px)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <span className="mock-label" style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: C.onSubtle }}>
              Einnahmen und Ausgaben
            </span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(8px, 1.4vw, 22px)', flex: 1, minHeight: '90px', marginTop: '18px', position: 'relative' }}>
              {MONTHS.map((b, i) => (
                <div
                  key={b.m}
                  onMouseEnter={() => setHoverBar(i)}
                  onMouseLeave={() => setHoverBar(null)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    height: '100%',
                    position: 'relative',
                    cursor: 'default',
                  }}
                >
                  {hoverBar === i && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% - 4px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: C.cream,
                        color: C.onyx,
                        padding: '6px 10px',
                        fontFamily: F.mono,
                        fontSize: '11px',
                        whiteSpace: 'nowrap',
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                    >
                      +{b.ein.toLocaleString('de-DE')} / −{b.aus.toLocaleString('de-DE')} €
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', flex: 1, width: '100%', justifyContent: 'center' }}>
                    {([['ein', C.oliveLight], ['aus', C.terracotta]] as const).map(([key, color]) => (
                      <span
                        key={key}
                        style={{
                          width: 'clamp(12px, 1.5vw, 26px)',
                          height: `${((b[key] / MONTH_MAX) * 100) * (run ? 1 : 0)}%`,
                          backgroundColor: color,
                          opacity: hoverBar === null || hoverBar === i ? 1 : 0.35,
                          transition: 'height .9s cubic-bezier(.16,1,.3,1), opacity .2s ease',
                          transitionDelay: `${i * 0.06}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontFamily: F.mono, fontSize: 'clamp(9px, .7vw, 11px)', color: C.onSubtle }}>{b.m}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Donut mit Hover */}
          <div
            style={{
              backgroundColor: C.onyxLift,
              border: `1px solid ${C.ruleOnSoft}`,
              padding: 'clamp(14px, 1.6vw, 22px)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <span className="mock-label" style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: C.onSubtle }}>
              Portfolio-Mix
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px, 1.6vw, 24px)', flex: 1, marginTop: '14px', minHeight: 0 }}>
              <svg viewBox="0 0 100 100" style={{ width: 'clamp(80px, 8vw, 128px)', flexShrink: 0, transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(232,224,208,.1)" strokeWidth="13" />
                {SEGMENTS.map(({ seg, offset }, i) => (
                  <circle
                    key={seg.label}
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={hoverSlice === i ? 16 : 13}
                    strokeDasharray={`${(seg.pct / 100) * CIRC * (run ? 1 : 0)} ${CIRC}`}
                    strokeDashoffset={-offset * (run ? 1 : 0)}
                    opacity={hoverSlice === null || hoverSlice === i ? 1 : 0.4}
                    style={{ transition: 'stroke-dasharray 1s cubic-bezier(.16,1,.3,1), stroke-dashoffset 1s cubic-bezier(.16,1,.3,1), stroke-width .2s ease, opacity .2s ease' }}
                  />
                ))}
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0, flex: 1 }}>
                {MIX.map((s, i) => (
                  <div
                    key={s.label}
                    onMouseEnter={() => setHoverSlice(i)}
                    onMouseLeave={() => setHoverSlice(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '9px',
                      opacity: hoverSlice === null || hoverSlice === i ? 1 : 0.45,
                      transition: 'opacity .2s ease',
                      cursor: 'default',
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', backgroundColor: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 'clamp(11px, .9vw, 13px)', color: C.onBody, flex: 1, minWidth: 0 }}>{s.label}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 'clamp(11px, .9vw, 13px)', color: C.onCream }}>{s.pct} %</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Buchungsliste füllt die Resthöhe — zwei riesige Diagrammkarten
            allein wirkten im Vollbild leer */}
        <div
          className="mock-bookings"
          style={{
            backgroundColor: C.onyxLift,
            border: `1px solid ${C.ruleOnSoft}`,
            padding: 'clamp(14px, 1.6vw, 22px)',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <span className="mock-label" style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: C.onSubtle }}>
            Letzte Buchungen
          </span>
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {BOOKINGS.map((b) => (
              <div
                key={b.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
                  alignItems: 'center',
                  gap: 'clamp(10px, 1.6vw, 26px)',
                  padding: 'clamp(8px, 1vw, 13px) 0',
                  borderBottom: `1px solid ${C.ruleOnSoft}`,
                }}
              >
                <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: C.onSubtle }}>{b.day}</span>
                <span style={{ fontSize: 'clamp(12px, 1vw, 14px)', color: C.onCream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.label}
                </span>
                <span className="booking-cat" style={{ ...kicker, fontSize: 'clamp(8px, .7vw, 10px)', color: C.onSubtle }}>
                  {b.cat}
                </span>
                <span
                  style={{
                    fontFamily: F.mono,
                    fontSize: 'clamp(11px, .95vw, 14px)',
                    color: b.amount > 0 ? C.oliveLight : C.terracotta,
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
        </div>
      </div>
    </div>
  )
}
