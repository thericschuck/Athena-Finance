'use client'

import { useState } from 'react'
import { APP, F, kicker } from '@/components/landing/landing-tokens'
import { BOOKINGS, euro } from '@/components/landing/dashboard-mock/mock-data'
import { usePulseDirection, useTilt } from '@/components/landing/dashboard-mock/mock-hooks'
import { CardLabel } from '@/components/landing/dashboard-mock/mock-static'

const cardStyle: React.CSSProperties = {
  backgroundColor: APP.card,
  border: `1px solid ${APP.border}`,
  borderRadius: '10px',
  padding: 'clamp(14px, 1.6vw, 22px)',
}

/** Gemeinsame Karten-Hülle: Theme-Kartenfläche plus Cursor-Tilt/Glanzlicht (siehe
    useTilt). Ersetzt die früher pro Karte einzeln notierte cardStyle-Hülle. */
export function TiltCard({
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

/** Kleine Kennzahlen-Kachel — Depot- und Crypto-Szene, wie die Stat-Karten
    im Figma-Mockup (Portfoliowert/Investiert/Gewinn-Verlust/Anteile bzw.
    Portfolio-Wert/24h-Änderung/…). `value` bewusst ein fertiger String statt
    Zahl+Formatter-Prop: die aufrufenden Szenen brauchen mal Euro, mal
    Prozent, mal einen Label+Prozent-Mix ("PAXG · 69 %"). */
export function StatTile({ label, value, sub, valueColor }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string }) {
  return (
    <TiltCard style={{ display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center' }}>
      <CardLabel>{label}</CardLabel>
      <span style={{ fontFamily: F.mono, fontSize: 'clamp(15px, 1.5vw, 19px)', color: valueColor ?? APP.cardFg, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>{sub}</span>}
    </TiltCard>
  )
}

export function StatTilesRow({
  tiles,
  style,
  className,
}: {
  tiles: Array<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueColor?: string }>
  style?: React.CSSProperties
  /** Für szenenspezifische Überschreibungen der Spaltenzahl auf schmalen
      Displays (siehe .mock-row-* in landing.css). */
  className?: string
}) {
  return (
    <div
      className={`mock-charts${className ? ` ${className}` : ''}`}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0,1fr))`, gap: 'clamp(10px, 1.2vw, 16px)', flexShrink: 0, ...style }}
    >
      {tiles.map((t) => <StatTile key={t.label} {...t} />)}
    </div>
  )
}

/** Blitzt bei jeder Wertänderung kurz grün/rot auf und poppt minimal —
    „Live-Tick"-Effekt für Kurse (siehe usePulseDirection). */
export function PulseValue({
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
        color: dir === 'up' ? APP.positive : dir === 'down' ? APP.destructive : baseColor,
        transition: 'color .5s ease',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

/** Kompakte Positionsliste neben den beiden Verteilungs-Ringen — Crypto-
    Szene, drittes Drittel derselben Reihe (siehe Figma: "Assets · Kraken ·
    2 Positionen"). */
/** Positionsliste neben den beiden Verteilungs-Ringen — Crypto-Szene,
    drittes Drittel derselben Reihe (siehe Figma: „Assets · Kraken ·
    2 Positionen"). Zeilen jetzt mit Farbpunkt + Anteils-Balken statt reinem
    Text, plus Gesamtsumme als Fußzeile (`marginTop: 'auto'`, an den unteren
    Kartenrand gepinnt): bei nur zwei Positionen hing die Liste zuvor mit
    `justifyContent: 'center'` in der von den Donut-Karten daneben
    vorgegebenen Kartenhöhe fest und wirkte wie ein fast leeres Feld mit zwei
    beliebig in der Mitte schwebenden Zeilen (siehe Screenshot im Chat) —
    jetzt oben ausgerichtet, farblich an die Ringe angebunden und mit
    sinnvollem Inhalt bis zum unteren Rand statt Leerraum. */
export function AssetsList({
  title,
  sub,
  rows,
  total,
}: {
  title: string
  sub: string
  rows: readonly { label: string; sub: string; amount: string; pct: number; color: string }[]
  total: string
}) {
  return (
    <TiltCard style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 20px)', minHeight: 0 }}>
      <div>
        <CardLabel>{title}</CardLabel>
        <p style={{ margin: '3px 0 0', fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>{sub}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 1.6vw, 18px)' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: r.color, flexShrink: 0 }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 'clamp(11px, .9vw, 13px)', color: APP.cardFg }}>{r.label}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 'clamp(9px, .7vw, 10px)', color: APP.mutedFg }}>{r.sub}</span>
                </span>
              </span>
              <span style={{ fontFamily: F.mono, fontSize: 'clamp(11px, .9vw, 13px)', color: APP.cardFg, whiteSpace: 'nowrap' }}>
                {r.amount}
              </span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', backgroundColor: APP.secondary, overflow: 'hidden' }}>
              <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: '2px', backgroundColor: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 'clamp(10px, 1.2vw, 14px)',
          borderTop: `1px solid ${APP.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg }}>Gesamt</span>
        <span style={{ fontFamily: F.mono, fontSize: 'clamp(12px, 1vw, 14px)', color: APP.cardFg }}>{total}</span>
      </div>
    </TiltCard>
  )
}

export function BookingsList({ title, bookings }: { title: string; bookings: typeof BOOKINGS }) {
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
              borderBottom: `1px solid ${APP.border}`,
              backgroundColor: hover === i ? APP.secondary : 'transparent',
              transition: 'background-color .18s ease',
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 'clamp(10px, .8vw, 12px)', color: APP.mutedFg }}>{b.day}</span>
            <span style={{ fontSize: 'clamp(12px, 1vw, 14px)', color: APP.cardFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
            <span className="booking-cat" style={{ ...kicker, fontSize: 'clamp(8px, .7vw, 10px)', color: APP.mutedFg }}>
              {b.cat}
            </span>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 'clamp(11px, .95vw, 14px)',
                color: b.amount > 0 ? APP.positive : APP.destructive,
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

/** Reiter-Leiste für den Zeitraum-Filter der Analyse-Szene (siehe
    PeriodTabs): aktiv = gefüllte Pille mit leichtem Scale, inaktiv =
    Ghost-Text mit Hover. Echt umschaltbar (eigener State je Instanz), aber
    ohne Wirkung auf die Charts darunter — reine Chrome.

    In der Dashboard-Szene gab es dieselbe Leiste zweimal als Attrappe über
    dem Vermögens-Chart; die ist weg, seit dort der echte NetWorthChart steht,
    der seine Zeitraum- und Ansicht-Tabs selbst mitbringt und sie tatsächlich
    auswertet. */
export function TabPills({ options, active, onChange }: { options: string[]; active: string; onChange: (v: string) => void }) {
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
              backgroundColor: isActive ? APP.cardFg : 'transparent',
              color: isActive ? APP.bg : APP.mutedFg,
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

export function PeriodTabs() {
  const [active, setActive] = useState('1J')
  return <TabPills options={['3M', '6M', '1J', 'Alle']} active={active} onChange={setActive} />
}
