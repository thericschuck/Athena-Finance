'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useMotionValue, useSpring, useInView, type Variants } from 'framer-motion'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight, ChevronRight,
  CandlestickChart, PieChart, Wallet, LineChart, Landmark, ShoppingCart,
} from 'lucide-react'
import { BentoGrid, type BentoItem } from '@/components/ui/bento-grid'

// ── Floating background paths ─────────────────────────────────────────────────

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
    opacity: 0.04 + i * 0.012,
  }))

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="url(#heroPathGrad)"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            initial={{ pathLength: 0.3, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: [path.opacity * 0.5, path.opacity, path.opacity * 0.5],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + (path.id % 7) * 3,
              repeat: Infinity,
              ease: 'linear',
              delay: path.id * 0.15,
            }}
          />
        ))}
        <defs>
          <linearGradient id="heroPathGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#6366f1" />
            <stop offset="50%"  stopColor="#f0d98c" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

// ── Animation variants ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden:  { opacity: 0, y: 28 },
  visible: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1], delay } }),
}

const fadeLeft  = { hidden: { opacity: 0, x: -32 }, visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } } }
const fadeRight = { hidden: { opacity: 0, x:  32 }, visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } } }

function FadeIn({ children, delay = 0, dir = 'up', className = '' }: {
  children: React.ReactNode; delay?: number; dir?: 'up' | 'left' | 'right'; className?: string
}) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variant = (dir === 'left' ? fadeLeft : dir === 'right' ? fadeRight : fadeUp) as any
  return (
    <motion.div ref={ref} className={className} variants={variant} custom={delay}
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      {children}
    </motion.div>
  )
}

// ── Tilt card (Framer Motion) ──────────────────────────────────────────────────

function TiltCard({ children, className = '', style = {} }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties
}) {
  const ref  = useRef<HTMLDivElement>(null)
  const rotX = useMotionValue(0)
  const rotY = useMotionValue(0)
  const sX   = useSpring(rotX, { stiffness: 180, damping: 22 })
  const sY   = useSpring(rotY, { stiffness: 180, damping: 22 })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const xp = (e.clientX - r.left) / r.width  - 0.5
    const yp = (e.clientY - r.top)  / r.height - 0.5
    rotX.set(yp * -14)
    rotY.set(xp *  14)
  }
  function onLeave() { rotX.set(0); rotY.set(0) }

  return (
    <motion.div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}
      style={{ ...style, rotateX: sX, rotateY: sY, transformStyle: 'preserve-3d' }}
      className={className}>
      {children}
    </motion.div>
  )
}

// ── Mini visualisations ────────────────────────────────────────────────────────

const EXP_COLS = ['#1a1d29', '#3d2e0a', '#6b4f15', '#a8782a', '#d4a84c', '#f0d98c']
const GOLD_DATA = [0,1,2,3,2,1,1,3,4,5,3,2,0,2,5,4,3,1,1,3,5,4,2,1,0,1,3,4,2,0,1,2,3,4,3,2]

function MiniHeatmap() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
      {GOLD_DATA.map((v, i) => <div key={i} style={{ height: '12px', borderRadius: '2px', backgroundColor: EXP_COLS[v] }} />)}
    </div>
  )
}
function MiniSparkline() {
  return (
    <svg width="100%" height="44" viewBox="0 0 160 44" preserveAspectRatio="none">
      <defs><linearGradient id="gGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4ade80" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
      </linearGradient></defs>
      <path d="M0,40 C20,36 35,32 50,26 C65,20 80,18 95,12 C110,6 130,8 160,3" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
      <path d="M0,40 C20,36 35,32 50,26 C65,20 80,18 95,12 C110,6 130,8 160,3 L160,44 L0,44Z" fill="url(#gGrad)" />
    </svg>
  )
}
function MiniDonut() {
  return (
    <svg viewBox="0 0 80 80" width="72" height="72" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="40" cy="40" r="30" fill="none" stroke="#1e2130" strokeWidth="10" />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#6366f1" strokeWidth="10" strokeDasharray="65 125" strokeDashoffset="-31" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#f0d98c" strokeWidth="10" strokeDasharray="38 125" strokeDashoffset="-96" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#4ade80" strokeWidth="10" strokeDasharray="22 125" strokeDashoffset="-134" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  )
}
function MiniStrategy() {
  return (
    <svg width="100%" height="44" viewBox="0 0 320 44" preserveAspectRatio="none">
      <defs><linearGradient id="lineG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f87171" stopOpacity=".25" />
        <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
      </linearGradient></defs>
      <path d="M0,38 L40,30 L80,34 L110,22 L140,26 L170,16 L200,20 L230,11 L260,15 L290,6 L320,9" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
      <path d="M0,38 L40,30 L80,34 L110,22 L140,26 L170,16 L200,20 L230,11 L260,15 L290,6 L320,9 L320,44 L0,44Z" fill="url(#lineG)" />
    </svg>
  )
}

// ── CSS (minimal — only keyframes that can't be done in Framer) ────────────────

const CSS = `
  @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes pulse-glow { 0%,100%{opacity:.2} 50%{opacity:.55} }
  .shimmer-text {
    background: linear-gradient(90deg, #f0d98c 0%, #fffde0 38%, #f0d98c 55%, #c8961f 100%);
    background-size: 200% auto;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    animation: shimmer 4.5s linear infinite;
  }
  .btn-gold {
    position:relative; overflow:hidden;
    background: linear-gradient(135deg, #f0d98c 0%, #d4a84c 100%);
    transition: box-shadow .2s ease, transform .15s ease;
  }
  .btn-gold::before {
    content:''; position:absolute; inset:0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.18) 50%, transparent 100%);
    transform: translateX(-100%); transition: transform .55s ease;
  }
  .btn-gold:hover::before { transform: translateX(100%); }
  .btn-gold:hover { box-shadow: 0 0 32px rgba(240,217,140,.4), 0 4px 16px rgba(0,0,0,.4); transform: translateY(-1px); }
  .btn-ghost { transition: background .2s, border-color .2s; }
  .btn-ghost:hover { background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.2) !important; }
  .grid-bg {
    background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  @media (max-width: 767px) {
    .mock-grid { grid-template-columns: 1fr !important; }
    .mock-sidebar { display: none !important; }
    .stats-grid { grid-template-columns: 1fr 1fr !important; }
    .color-grid { grid-template-columns: 1fr 1fr !important; }
    .steps-grid { grid-template-columns: 1fr !important; }
    .addl-grid { grid-template-columns: 1fr 1fr !important; }
    .split-grid { grid-template-columns: 1fr !important; }
    .footer-flex { flex-direction: column !important; align-items: flex-start !important; }
  }
`

// ── Feature bento items ────────────────────────────────────────────────────────

const bentoItems: BentoItem[] = [
  {
    title: 'Ausgaben-Analyse',
    description: 'Heatmap, GuV-Chart & Cashflow-Kalender — alle aus echten Transaktionsdaten.',
    icon: <BarChart2 className="w-4 h-4 text-indigo-400" />,
    status: 'Live',
    tags: ['Heatmap', 'GuV', 'Kalender'],
    colSpan: 2,
    hasPersistentHover: true,
    visual: (
      <div className="flex gap-0.5 flex-wrap max-w-xs">
        {GOLD_DATA.concat([1,3,2,4,2,1]).map((v, i) => (
          <div key={i} style={{ width: '11px', height: '11px', borderRadius: '2px', backgroundColor: EXP_COLS[Math.min(v,5)] }} />
        ))}
      </div>
    ),
  },
  {
    title: 'Portfolio-Tracking',
    description: 'Depot & Crypto in einer Ansicht. Kurs-Updates und Rebalancing-Vorschläge.',
    icon: <TrendingUp className="w-4 h-4 text-yellow-400" />,
    status: 'Live',
    tags: ['Depot', 'Crypto'],
    visual: <MiniDonut />,
  },
  {
    title: 'Vertrags-Management',
    description: 'Alle Abos und Daueraufträge im Blick. Automatische Buchung wiederkehrender Zahlungen.',
    icon: <FileText className="w-4 h-4 text-emerald-400" />,
    tags: ['Abos', 'Daueraufträge'],
  },
  {
    title: 'Sparziele & Pläne',
    description: 'Definiere Ziele, verfolge den Fortschritt und automatisiere Sparpläne.',
    icon: <Target className="w-4 h-4 text-rose-400" />,
    tags: ['Ziele', 'Sparpläne'],
  },
  {
    title: 'Strategie & Backtesting',
    description: 'TPI-Analyse, eigene Indikatoren und vollautomatisierte Backtests für fundierte Entscheidungen.',
    icon: <CandlestickChart className="w-4 h-4 text-rose-400" />,
    status: 'Beta',
    tags: ['TPI', 'Indikatoren', 'Backtest'],
    colSpan: 2,
    visual: <MiniStrategy />,
  },
  {
    title: 'Multi-Währung',
    description: 'EUR, USD, CHF. Automatische Umrechnung mit Echtzeit-Kursen.',
    icon: <Globe className="w-4 h-4 text-sky-400" />,
    tags: ['EUR', 'USD', 'CHF'],
  },
  {
    title: 'Banking-Sync',
    description: 'FinTS-Anbindung für automatischen Kontoimport direkt aus deiner Bank.',
    icon: <Landmark className="w-4 h-4 text-purple-400" />,
    status: 'Live',
    tags: ['FinTS', 'HBCI'],
  },
  {
    title: 'Lebenshaltungskosten',
    description: 'Berechne dein Mindestgehalt auf Basis realer Lebenshaltungskosten.',
    icon: <ShoppingCart className="w-4 h-4 text-amber-400" />,
    tags: ['Budget', 'Kalkulation'],
    visual: <MiniSparkline />,
    colSpan: 2,
  },
]

// ── Main ───────────────────────────────────────────────────────────────────────

export function LandingClient() {
  return (
    <div style={{ backgroundColor: '#08090e', minHeight: '100vh', color: '#f3f0ea', fontFamily: 'var(--font-geist-sans)', overflowX: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'rgba(8,9,14,0.88)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Image src="/athena-logo.png" alt="Athena Finance" width={28} height={28} style={{ borderRadius: '6px' }} />
            <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>Athena Finance</span>
          </div>
          <Link href="/login" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0d0f14', fontWeight: 700, fontSize: '13px', padding: '7px 18px', borderRadius: '8px', textDecoration: 'none' }}>
            Anmelden
          </Link>
        </div>
      </motion.nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', overflow: 'hidden', paddingTop: '120px', paddingBottom: '80px' }} className="grid-bg">
        {/* Floating paths background */}
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        {/* Radial orbs layered on top of paths */}
        <motion.div
          animate={{ y: [0, -14, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,.14) 0%, transparent 68%)', pointerEvents: 'none' }}
        />
        <motion.div
          animate={{ y: [0, -10, 0], opacity: [0.15, 0.4, 0.15] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          style={{ position: 'absolute', top: '80px', right: '8%', width: '320px', height: '320px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,.08) 0%, transparent 70%)', pointerEvents: 'none' }}
        />
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{ position: 'absolute', bottom: '60px', left: '6%', width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(74,222,128,.06) 0%, transparent 70%)', pointerEvents: 'none' }}
        />

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.22)', borderRadius: '100px', padding: '5px 16px 5px 8px', marginBottom: '36px' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', background: 'linear-gradient(135deg, #818cf8, #6366f1)', borderRadius: '50%' }}>
              <Zap size={10} color="white" strokeWidth={2.5} />
            </span>
            <span style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 500 }}>Persönliches Finanzsystem · Eric Schuck</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 'clamp(42px, 7vw, 88px)', fontWeight: 800, letterSpacing: '-0.038em', lineHeight: 1.0, marginBottom: '28px', fontFamily: 'var(--font-playfair)' }}
          >
            Finanzen im Griff.
            <br />
            <span className="shimmer-text">Vollständig überblickt.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#9ca3af', maxWidth: '560px', margin: '0 auto 52px', lineHeight: 1.75 }}
          >
            Portfolio-Tracking, Ausgaben-Analyse, Sparplan-Management und Vertragsübersicht — in einem einzigen, leistungsstarken Dashboard.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link href="/login" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#0d0f14', fontWeight: 700, fontSize: '15px', padding: '13px 30px', borderRadius: '10px', textDecoration: 'none', letterSpacing: '-0.01em' }}>
              Anmelden <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <a href="#features" className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#d1d5db', fontWeight: 500, fontSize: '15px', padding: '13px 26px', borderRadius: '10px', textDecoration: 'none' }}>
              Features entdecken <ChevronRight size={16} />
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── DASHBOARD MOCKUP ── */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <TiltCard style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.07)', backgroundColor: '#0d0f14', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(240,217,140,.03)' }}>
              {/* Window chrome */}
              <div style={{ height: '40px', backgroundColor: '#0a0c12', borderBottom: '1px solid #1e2130', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', opacity: .7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', opacity: .7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', opacity: .7 }} />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ backgroundColor: '#13161e', borderRadius: '6px', padding: '3px 20px', fontSize: '11px', color: '#4b5563' }}>athena-finance.de/dashboard</div>
                </div>
              </div>
              {/* Mock dashboard content */}
              <div className="mock-grid" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '380px' }}>
                <div className="mock-sidebar" style={{ backgroundColor: '#0a0c12', borderRight: '1px solid #1e2130', padding: '20px 12px' }}>
                  <div style={{ marginBottom: '20px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Image src="/athena-logo.png" alt="Athena Finance" width={22} height={22} style={{ borderRadius: '4px' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Athena Finance</span>
                  </div>
                  {[
                    { icon: <BarChart2 size={13} />, label: 'Dashboard', active: true },
                    { icon: <PieChart size={13} />, label: 'Depot' },
                    { icon: <Wallet size={13} />, label: 'Finance' },
                    { icon: <LineChart size={13} />, label: 'Analyse' },
                    { icon: <CandlestickChart size={13} />, label: 'Crypto' },
                    { icon: <Target size={13} />, label: 'Strategie' },
                  ].map(({ icon, label, active }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', marginBottom: '2px', backgroundColor: active ? 'rgba(240,217,140,.1)' : 'transparent', color: active ? '#f0d98c' : '#4b5563', fontSize: '12px', fontWeight: active ? 600 : 400 }}>
                      {icon}{label}
                    </div>
                  ))}
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {[
                      { label: 'Gesamtvermögen', value: '€ 84.320', delta: '+12,4%', pos: true },
                      { label: 'Monat. Einnahmen', value: '€ 4.850', delta: '+5,2%', pos: true },
                      { label: 'Monat. Ausgaben', value: '€ 2.190', delta: '-8,1%', pos: false },
                      { label: 'Sparquote', value: '54,8%', delta: '+2,3%', pos: true },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '12px', border: '1px solid #1e2130' }}>
                        <p style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>{s.label}</p>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px', letterSpacing: '-0.02em' }}>{s.value}</p>
                        <p style={{ fontSize: '10px', color: s.pos ? '#4ade80' : '#f87171', fontWeight: 500 }}>{s.delta}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130' }}>
                      <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '10px' }}>Monatlicher Vergleich</p>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '72px' }}>
                        {[{i:70,e:50},{i:80,e:55},{i:65,e:45},{i:90,e:60},{i:75,e:48},{i:95,e:52}].map((b, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}>
                            <div style={{ width: '6px', height: `${b.i}%`, backgroundColor: '#4ade80', borderRadius: '2px 2px 0 0', opacity: .75 }} />
                            <div style={{ width: '6px', height: `${b.e}%`, backgroundColor: '#f87171', borderRadius: '2px 2px 0 0', opacity: .75 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130', display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '64px', height: '64px', flexShrink: 0 }}>
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#1e2130" strokeWidth="5" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#6366f1" strokeWidth="5" strokeDasharray="44 88" strokeLinecap="round" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#f0d98c" strokeWidth="5" strokeDasharray="26 88" strokeDashoffset="-44" strokeLinecap="round" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#4ade80" strokeWidth="5" strokeDasharray="18 88" strokeDashoffset="-70" strokeLinecap="round" />
                      </svg>
                      <div>
                        <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '6px' }}>Portfolio-Mix</p>
                        {[{ color: '#6366f1', label: 'Aktien', pct: '50%' }, { color: '#f0d98c', label: 'Crypto', pct: '30%' }, { color: '#4ade80', label: 'Cash', pct: '20%' }].map(i => (
                          <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i.color }} />
                            <span style={{ fontSize: '10px', color: '#9ca3af', flex: 1 }}>{i.label}</span>
                            <span style={{ fontSize: '10px', color: '#f3f0ea', fontWeight: 600 }}>{i.pct}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </FadeIn>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section style={{ padding: '48px 24px', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)', backgroundColor: '#0a0c12' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', textAlign: 'center' }}>
            {[
              { value: '360°', label: 'Finanzüberblick', color: '#f0d98c' },
              { value: '8+',   label: 'Analysetools',    color: '#6366f1' },
              { value: '∞',    label: 'Transaktionen',   color: '#4ade80' },
              { value: '24/7', label: 'Echtzeit-Daten',  color: '#f87171' },
            ].map((s, i) => (
              <FadeIn key={s.label} delay={i * 0.07}>
                <p style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: s.color, letterSpacing: '-0.03em', marginBottom: '4px', fontFamily: 'var(--font-geist-mono)', textShadow: `0 0 24px ${s.color}40` }}>{s.value}</p>
                <p style={{ fontSize: '13px', color: '#4b5563' }}>{s.label}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES BENTO ── */}
      <section id="features" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>Alles in einem Dashboard</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.028em', color: '#f3f0ea', lineHeight: 1.12 }}>
                Jede Dimension deiner Finanzen.
                <br /><span style={{ color: '#374151' }}>Lückenlos erfasst.</span>
              </h2>
            </div>
          </FadeIn>
          <FadeIn dir="up" delay={0.1}>
            <BentoGrid items={bentoItems} />
          </FadeIn>
        </div>
      </section>

      {/* ── COLOR SYSTEM ── */}
      <section style={{ padding: '100px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>Visuelles System</p>
              <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 800, letterSpacing: '-0.028em', color: '#f3f0ea', lineHeight: 1.15 }}>
                Vier Farben. Vier Dimensionen.
              </h2>
              <p style={{ fontSize: '15px', color: '#6b7280', marginTop: '14px' }}>Jede Farbe trägt eine Bedeutung — konsistent durch das gesamte Dashboard.</p>
            </div>
          </FadeIn>

          <div className="color-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              { color: '#f0d98c', topGrad: 'linear-gradient(135deg, #3d2e0a, #a8782a, #f0d98c)', glow: 'rgba(240,217,140,.18)', label: 'Ausgaben', sub: 'Heatmap · GuV · Kategorien', desc: 'Alle Ausgaben in Goldtönen — von hell für niedrig bis satt für hoch.', viz: <MiniHeatmap /> },
              { color: '#4ade80', topGrad: 'linear-gradient(135deg, #0a2d1a, #166534, #4ade80)', glow: 'rgba(74,222,128,.18)', label: 'Einnahmen', sub: 'Cashflow · Kalender · Trends', desc: 'Einnahmen erscheinen in Grüntönen als Sparkline und im GuV-Chart.', viz: <MiniSparkline /> },
              { color: '#f87171', topGrad: 'linear-gradient(135deg, #3b0a0a, #991b1b, #f87171)', glow: 'rgba(248,113,113,.18)', label: 'Verluste', sub: 'Alerts · Limits · Negativ', desc: 'Rottöne signalisieren Verluste und überschrittene Budgets.', viz: (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', height: '44px', paddingTop: '4px' }}>
                  {[75, 45, 90, 55, 30].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h * .48}px`, borderRadius: '3px 3px 0 0', background: 'linear-gradient(to bottom, #f87171, #991b1b)', opacity: 0.85 }} />
                  ))}
                </div>
              )},
              { color: '#818cf8', topGrad: 'linear-gradient(135deg, #1a1b3a, #4338ca, #818cf8)', glow: 'rgba(99,102,241,.22)', label: 'Portfolio', sub: 'Depot · Crypto · Rebalancing', desc: 'Indigo steht für Investitionen — Depot-Charts und Portfolio-Donut.', viz: <MiniDonut /> },
            ].map(({ color, topGrad, glow, label, sub, desc, viz }, i) => (
              <FadeIn key={label} delay={i * 0.08} dir="up">
                <TiltCard style={{ backgroundColor: '#0d0f14', border: '1px solid rgba(255,255,255,.06)', borderRadius: '16px', height: '100%', overflow: 'hidden' }}>
                  <div style={{ height: '3px', background: topGrad }} />
                  <div style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '16px', minHeight: '52px' }}>{viz}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
                      <span style={{ fontSize: '15px', fontWeight: 700, color }}>{label}</span>
                    </div>
                    <p style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '8px' }}>{sub}</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </TiltCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ textAlign: 'center', marginBottom: '64px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#f0d98c', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>So einfach geht's</p>
              <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.026em', color: '#f3f0ea', lineHeight: 1.2 }}>In 3 Schritten zum vollen Überblick</h2>
            </div>
          </FadeIn>
          <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '28px', left: 'calc(16.67% + 20px)', right: 'calc(16.67% + 20px)', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.08), rgba(240,217,140,.25), rgba(255,255,255,.08), transparent)', pointerEvents: 'none' }} />
            {[
              { n: '01', icon: <ShieldCheck size={22} color="#f0d98c" />, title: 'Einloggen', desc: 'Privates System — Zugang nur für mich. Keine öffentliche Registrierung.' },
              { n: '02', icon: <Wallet size={22} color="#f0d98c" />, title: 'Daten einrichten', desc: 'Konten, Transaktionen, Verträge und Portfolios nach eigenem Bedarf konfigurieren.' },
              { n: '03', icon: <TrendingUp size={22} color="#f0d98c" />, title: 'Überblick genießen', desc: 'Alle Finanzdaten in einem übersichtlichen Dashboard — jederzeit und von überall.' },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.12} dir="up">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: 'rgba(240,217,140,.07)', border: '1px solid rgba(240,217,140,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    {step.icon}
                  </div>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#f0d98c', letterSpacing: '.08em', marginBottom: '8px', fontFamily: 'var(--font-geist-mono)' }}>{step.n}</p>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f0ea', marginBottom: '8px' }}>{step.title}</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.65 }}>{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPOTLIGHT ── */}
      <section style={{ padding: '80px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid rgba(255,255,255,.05)', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <div className="split-grid" style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}>
          <FadeIn dir="left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.22)', borderRadius: '100px', padding: '4px 14px', marginBottom: '20px' }}>
              <BarChart2 size={12} color="#818cf8" />
              <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>Analyse-Tab</span>
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.026em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.2 }}>
              Deine Ausgaben in einem ganz neuen Licht
            </h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.8, marginBottom: '24px' }}>
              Der Analyse-Tab verwandelt rohe Transaktionsdaten in aussagekräftige Visualisierungen. Erkenne saisonale Muster, verfolge Geldflüsse und verstehe, wohin dein Geld wirklich geht.
            </p>
            {['Ausgaben-Heatmap (GitHub-style) mit GuV-Modus', 'Sankey-Diagramm für vollständige Geldfluss-Visualisierung', 'Interaktiver Cashflow-Kalender — Popup direkt am Tag', 'Divergierende Balken für Einnahmen & Ausgaben'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'rgba(99,102,241,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <ChevronRight size={10} color="#818cf8" strokeWidth={2.5} />
                </div>
                <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.55 }}>{item}</p>
              </div>
            ))}
          </FadeIn>
          <FadeIn dir="right">
            <TiltCard style={{ backgroundColor: '#0d0f14', borderRadius: '16px', border: '1px solid rgba(255,255,255,.07)', padding: '24px', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
              <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '14px' }}>Ausgaben nach Kategorie</p>
              {[
                { cat: 'Wohnen', val: 1200, max: 1200, color: '#f87171' },
                { cat: 'Lebensmittel', val: 480, max: 1200, color: '#f87171' },
                { cat: 'Transport', val: 320, max: 1200, color: '#f87171' },
                { cat: 'Gehalt', val: 3800, max: 3800, color: '#4ade80' },
                { cat: 'Freelance', val: 950, max: 3800, color: '#4ade80' },
                { cat: 'Entertainment', val: 180, max: 1200, color: '#f87171' },
              ].map(item => (
                <div key={item.cat} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', width: '88px', textAlign: 'right', flexShrink: 0 }}>{item.cat}</span>
                  <div style={{ flex: 1, height: '16px', backgroundColor: '#13161e', borderRadius: '4px', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(item.val / item.max) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: '100%', backgroundColor: item.color, opacity: .75, borderRadius: '4px' }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: item.color, fontWeight: 600, width: '52px', textAlign: 'right', fontFamily: 'var(--font-geist-mono)' }}>
                    {item.color === '#4ade80' ? '+' : '-'}{item.val.toLocaleString('de-DE')}
                  </span>
                </div>
              ))}
            </TiltCard>
          </FadeIn>
        </div>
      </section>

      {/* ── ADDITIONAL FEATURES ── */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="addl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }}>
            {[
              { icon: <Repeat2 size={20} color="#f0d98c" />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
              { icon: <ShieldCheck size={20} color="#4ade80" />, title: 'Datenschutz', desc: 'Deine Daten bleiben bei dir. Keine Weitergabe, kein Tracking.' },
              { icon: <Globe size={20} color="#818cf8" />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — optimal auf Desktop, Tablet und Mobil.' },
              { icon: <Zap size={20} color="#fb923c" />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
            ].map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.07} dir="up">
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#13161e', border: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {f.icon}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#f3f0ea', marginBottom: '4px' }}>{f.title}</h4>
                    <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.55 }}>{f.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ borderRadius: '22px', background: 'linear-gradient(135deg, #0f1018 0%, #131620 50%, #0d0f16 100%)', border: '1px solid rgba(240,217,140,.14)', padding: 'clamp(40px, 5vw, 64px)', textAlign: 'center', position: 'relative', overflow: 'hidden', boxShadow: '0 0 60px rgba(240,217,140,.06)' }}>
              <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '500px', height: '400px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#f0d98c', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '16px' }}>Persönliches Projekt</p>
                <h2 style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-0.028em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.1, fontFamily: 'var(--font-playfair)' }}>
                  Selbst gebaut. Nur für mich.
                </h2>
                <p style={{ fontSize: '15px', color: '#9ca3af', lineHeight: 1.75, maxWidth: '480px', margin: '0 auto 36px' }}>
                  Athena Finance ist mein persönliches Finanzsystem — entwickelt, um exakt meinen Anforderungen zu entsprechen. Kein fremdes SaaS-Produkt, keine Kompromisse.
                </p>
                <Link href="/login" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#0d0f14', fontWeight: 700, fontSize: '15px', padding: '14px 34px', borderRadius: '11px', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                  Anmelden <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.05)', padding: '32px 24px', backgroundColor: '#08090e' }}>
        <div className="footer-flex" style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Image src="/athena-logo.png" alt="Athena Finance" width={24} height={24} style={{ borderRadius: '4px', opacity: 0.6 }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Athena Finance</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#1f2937' }}>© 2025 Eric Schuck · Persönliches Projekt</span>
            <Link href="/login" style={{ fontSize: '12px', color: '#374151', textDecoration: 'none' }}>Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
