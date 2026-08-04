'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight,
  CandlestickChart, PieChart, Wallet, LineChart, Landmark, ShoppingCart,
} from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { C, F, SPACE, kicker } from './landing-tokens'
import './landing.css'
import { OliveVines, LaurelWreath, MeanderFrieze } from './olive-vines'

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
          fontSize: 'clamp(30px, 4.4vw, 54px)',
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
            fontSize: 'clamp(15px, 1.5vw, 17px)',
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
    <div
      className="af-landing"
      style={{
        backgroundColor: C.parchment,
        color: C.ink,
        minHeight: '100vh',
        fontFamily: F.sans,
        overflowX: 'hidden',
      }}
    >
      {/* ══ NAV ══ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: 'rgba(247,245,240,0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${C.rule}`,
        }}
      >
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
            <Link href="/login" className="af-btn af-btn-onyx nav-cta" style={{ padding: '11px 22px' }}>
              Anmelden
            </Link>
          </nav>
        </div>
        <div className="af-dentil" />
      </header>

      {/* ══ HERO ══ */}
      <section
        className="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          paddingTop: 'clamp(52px, 10vh, 132px)',
          paddingBottom: 'clamp(52px, 9vh, 112px)',
        }}
      >
        <OliveVines tone="light" opacity={0.62} />

        {/* warmes Licht hinter der Headline */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-140px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(900px, 130vw)',
            height: '620px',
            background: `radial-gradient(ellipse at center, rgba(232,224,208,.7) 0%, rgba(247,245,240,0) 70%)`,
            pointerEvents: 'none',
          }}
        />

        <div style={{ ...SHELL, position: 'relative', textAlign: 'center' }}>
          <div
            className="af-rise"
            style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}
          >
            <Kicker rules center color={C.inkSubtle}>
              ΑTΗEΝΑ · Finanzen im Überblick
            </Kicker>
          </div>

          <h1
            className="af-balance af-rise"
            style={{
              animationDelay: '.1s',
              fontFamily: F.display,
              fontWeight: 400,
              fontSize: 'clamp(33px, 8.4vw, 104px)',
              lineHeight: 1.02,
              letterSpacing: '-0.022em',
              margin: '0 auto',
              maxWidth: '15ch',
              color: C.ink,
            }}
          >
            Finanzen im Griff.
            <br />
            <em style={{ fontStyle: 'italic', color: C.goldInk }}>Vollständig überblickt.</em>
          </h1>

          <p
            className="af-balance af-rise"
            style={{
              animationDelay: '.22s',
              fontFamily: F.serif,
              fontSize: 'clamp(16px, 1.7vw, 19px)',
              lineHeight: 1.85,
              color: C.inkBody,
              maxWidth: '580px',
              margin: '32px auto 0',
            }}
          >
            Portfolio-Tracking, Ausgaben-Analyse, Sparplan-Management und Vertragsübersicht —
            vereint in einem einzigen, ruhigen Dashboard.
          </p>

          <div
            className="af-rise cta-row"
            style={{
              animationDelay: '.34s',
              display: 'flex',
              gap: '14px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 'clamp(30px, 4vw, 42px)',
            }}
          >
            <Link href="/login" className="af-btn af-btn-onyx">
              Anmelden <ArrowRight size={15} strokeWidth={2} />
            </Link>
            <a href="#features" className="af-btn af-btn-outline">
              Das Instrumentarium
            </a>
          </div>

          <p
            className="af-rise af-micro"
            style={{
              ...kicker,
              animationDelay: '.5s',
              fontSize: '10px',
              color: C.inkFaint,
              marginTop: '30px',
            }}
          >
            Portfolio · Ausgaben · Verträge · Strategie
          </p>
        </div>
      </section>

      <div style={{ ...SHELL, paddingBottom: 'clamp(40px, 6vw, 72px)' }}>
        <Lozenge />
      </div>

      {/* ══ APP-VORSCHAU ══ */}
      <section style={{ padding: `0 ${SPACE.gutter} ${SPACE.section}` }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
          <Reveal y={34}>
            <figure style={{ margin: 0 }}>
              {/* Illustrative Vorschau mit Beispielzahlen — für Screenreader
                  ausgeblendet, die Bildunterschrift trägt die Bedeutung. */}
              <div
                aria-hidden
                style={{
                  border: `1px solid rgba(26,26,26,.16)`,
                  backgroundColor: C.onyxWarm,
                  overflow: 'hidden',
                  boxShadow: '0 40px 90px -30px rgba(26,26,26,.42), 0 2px 8px rgba(26,26,26,.06)',
                }}
              >
                {/* Fensterleiste */}
                <div
                  style={{
                    height: '42px',
                    borderBottom: `1px solid ${C.ruleOnSoft}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    gap: '7px',
                  }}
                >
                  {[C.terracotta, C.gold, C.olive].map((c) => (
                    <span
                      key={c}
                      style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: c, opacity: 0.85 }}
                    />
                  ))}
                  <span
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontFamily: F.mono,
                      fontSize: '11px',
                      color: C.onSubtle,
                      letterSpacing: '0.02em',
                    }}
                  >
                    athena-finance.de/dashboard
                  </span>
                </div>

                <div className="g-mock" style={{ display: 'grid', gridTemplateColumns: '196px 1fr', minHeight: '340px' }}>
                  {/* Sidebar der App */}
                  <div
                    className="g-mock-side"
                    style={{ borderRight: `1px solid ${C.ruleOnSoft}`, padding: '20px 12px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '0 8px', marginBottom: '22px' }}>
                      <Logo variant="transparent" size={20} />
                      <span style={{ fontFamily: F.display, fontSize: '13px', color: C.onCream }}>
                        Athena Finance
                      </span>
                    </div>
                    {[
                      { icon: <BarChart2 size={13} strokeWidth={1.6} />, label: 'Dashboard', active: true },
                      { icon: <PieChart size={13} strokeWidth={1.6} />, label: 'Depot' },
                      { icon: <Wallet size={13} strokeWidth={1.6} />, label: 'Finance' },
                      { icon: <LineChart size={13} strokeWidth={1.6} />, label: 'Analyse' },
                      { icon: <CandlestickChart size={13} strokeWidth={1.6} />, label: 'Crypto' },
                      { icon: <Target size={13} strokeWidth={1.6} />, label: 'Strategie' },
                    ].map(({ icon, label, active }) => (
                      <div
                        key={label}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '9px',
                          padding: '8px 10px',
                          fontSize: '12px',
                          color: active ? C.gold : C.onSubtle,
                          backgroundColor: active ? 'rgba(184,143,81,.1)' : 'transparent',
                          borderLeft: `2px solid ${active ? C.gold : 'transparent'}`,
                        }}
                      >
                        {icon}
                        {label}
                      </div>
                    ))}
                  </div>

                  {/* Inhalt */}
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="mock-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {[
                        { label: 'Vermögen', value: '84.320', delta: '+12,4 %' },
                        { label: 'Einnahmen / Monat', value: '4.850', delta: '+5,2 %' },
                        { label: 'Ausgaben / Monat', value: '2.190', delta: '−8,1 %' },
                        { label: 'Sparquote', value: '54,8 %', delta: '+2,3 %' },
                      ].map((s) => (
                        <div
                          key={s.label}
                          style={{ backgroundColor: C.onyxLift, border: `1px solid ${C.ruleOnSoft}`, padding: '12px' }}
                        >
                          <p
                            className="mock-label"
                            style={{ ...kicker, fontSize: '9px', color: C.onSubtle, margin: '0 0 7px' }}
                          >
                            {s.label}
                          </p>
                          <p
                            style={{
                              fontFamily: F.display,
                              fontSize: '19px',
                              color: C.onCream,
                              margin: '0 0 3px',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {s.value}
                          </p>
                          <p style={{ fontFamily: F.mono, fontSize: '10px', color: C.olive, margin: 0 }}>
                            {s.delta}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mock-charts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
                      <div
                        style={{
                          backgroundColor: C.onyxLift,
                          border: `1px solid ${C.ruleOnSoft}`,
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <p style={{ ...kicker, fontSize: '9px', color: C.onSubtle, margin: '0 0 14px' }}>
                          Monatlicher Vergleich
                        </p>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', flex: 1, minHeight: '86px' }}>
                          {[{ i: 70, e: 50 }, { i: 80, e: 55 }, { i: 65, e: 45 }, { i: 90, e: 60 }, { i: 75, e: 48 }, { i: 95, e: 52 }].map((b, i) => (
                            <div key={i} style={{ flex: 1, display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}>
                              <span style={{ width: '6px', height: `${b.i}%`, backgroundColor: C.oliveLight }} />
                              <span style={{ width: '6px', height: `${b.e}%`, backgroundColor: C.terracotta }} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div
                        style={{
                          backgroundColor: C.onyxLift,
                          border: `1px solid ${C.ruleOnSoft}`,
                          padding: '14px',
                          display: 'flex',
                          gap: '16px',
                          alignItems: 'center',
                        }}
                      >
                        <svg viewBox="0 0 36 36" width="68" height="68" aria-hidden style={{ flexShrink: 0 }}>
                          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(232,224,208,.12)" strokeWidth="4.5" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={C.gold} strokeWidth="4.5" strokeDasharray="44 88" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={C.oliveLight} strokeWidth="4.5" strokeDasharray="26 88" strokeDashoffset="-44" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
                          <circle cx="18" cy="18" r="14" fill="none" stroke={C.cream} strokeWidth="4.5" strokeDasharray="18 88" strokeDashoffset="-70" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
                        </svg>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ ...kicker, fontSize: '9px', color: C.onSubtle, margin: '0 0 10px' }}>
                            Portfolio-Mix
                          </p>
                          {[
                            { color: C.gold, label: 'Aktien', pct: '50 %' },
                            { color: C.oliveLight, label: 'Crypto', pct: '30 %' },
                            { color: C.cream, label: 'Cash', pct: '20 %' },
                          ].map((i) => (
                            <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                              <span style={{ width: '6px', height: '6px', backgroundColor: i.color }} />
                              <span style={{ fontSize: '11px', color: C.onBody, flex: 1 }}>{i.label}</span>
                              <span style={{ fontFamily: F.mono, fontSize: '11px', color: C.onCream }}>{i.pct}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <figcaption
                className="fig-caption af-micro"
                style={{
                  ...kicker,
                  fontSize: '10px',
                  color: C.inkSubtle,
                  textAlign: 'center',
                  marginTop: '20px',
                }}
              >
                Das Dashboard · Ansicht im Dunkelmodus
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* ══ KENNZAHLEN (Onyx-Band) ══ */}
      <section style={{ backgroundColor: C.onyx, position: 'relative' }} className="af-flute">
        <MeanderFrieze id="frieze-stats-top" color={C.cream} opacity={0.16} />
        <div style={{ ...SHELL, padding: `clamp(48px, 6vw, 76px) ${SPACE.gutter}` }}>
          <div className="g-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { value: '360°', label: 'Finanzüberblick' },
              { value: '8+', label: 'Analysetools' },
              { value: '∞', label: 'Transaktionen' },
              { value: '24/7', label: 'Echtzeitdaten' },
            ].map((s, i) => (
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
                <p className="af-micro" style={{ ...kicker, fontSize: '10px', color: C.onSubtle, margin: 0 }}>{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <MeanderFrieze id="frieze-stats-bottom" color={C.cream} opacity={0.16} />
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
              {/* Zwei schlanke Säulen flankieren den Block wie ein Portal.
                  Rein dekorativ, unter 900px ausgeblendet (dort fehlt die Breite). */}
              {[
                { src: '/column-slim.svg', w: 76, h: 329, side: 'left' as const },
                { src: '/column-twisted.svg', w: 61, h: 330, side: 'right' as const },
              ].map((c) => (
                <Image
                  key={c.src}
                  src={c.src}
                  alt=""
                  aria-hidden
                  width={c.w}
                  height={c.h}
                  unoptimized
                  className={`portal-column portal-${c.side}`}
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
                    fontSize: 'clamp(30px, 5vw, 56px)',
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
                    fontSize: 'clamp(15px, 1.6vw, 17px)',
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
  )
}
