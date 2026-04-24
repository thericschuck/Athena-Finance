'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight, ChevronRight,
  CandlestickChart, PieChart, Wallet, LineChart,
} from 'lucide-react'

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const h = (e: MouseEvent) =>
      setPos({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 })
    window.addEventListener('mousemove', h, { passive: true })
    return () => window.removeEventListener('mousemove', h)
  }, [])
  return pos
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, v] as const
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FadeIn({ children, delay = 0, dir = 'up', style = {}, className = '' }: {
  children: React.ReactNode; delay?: number
  dir?: 'up' | 'left' | 'right' | 'none'
  style?: React.CSSProperties; className?: string
}) {
  const [ref, v] = useInView()
  const t = dir === 'up' ? 'translateY(36px)' : dir === 'left' ? 'translateX(-36px)' : dir === 'right' ? 'translateX(36px)' : 'none'
  return (
    <div ref={ref} className={className} style={{ ...style, opacity: v ? 1 : 0, transform: v ? 'none' : t, transition: `opacity .75s ease ${delay}s, transform .75s ease ${delay}s` }}>
      {children}
    </div>
  )
}

function TiltCard({ children, style, className = '', maxTilt = 8, onHoverShadow = '' }: {
  children: React.ReactNode; style?: React.CSSProperties
  className?: string; maxTilt?: number; onHoverShadow?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const glr = useRef<HTMLDivElement>(null)
  const baseShadow = (style as React.CSSProperties & { boxShadow?: string })?.boxShadow ?? ''

  const move = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const xp = (e.clientX - r.left) / r.width
    const yp = (e.clientY - r.top) / r.height
    el.style.transform = `perspective(1100px) rotateX(${(yp - .5) * maxTilt * -2}deg) rotateY(${(xp - .5) * maxTilt * 2}deg) scale3d(1.02,1.02,1.02)`
    if (onHoverShadow) el.style.boxShadow = onHoverShadow
    if (glr.current) {
      glr.current.style.opacity = '1'
      glr.current.style.background = `radial-gradient(circle at ${xp * 100}% ${yp * 100}%, rgba(255,255,255,0.07), transparent 65%)`
    }
  }, [maxTilt, onHoverShadow])

  const leave = useCallback(() => {
    const el = ref.current; if (!el) return
    el.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'
    if (onHoverShadow) el.style.boxShadow = baseShadow
    if (glr.current) glr.current.style.opacity = '0'
  }, [onHoverShadow, baseShadow])

  return (
    <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={className}
      style={{ ...style, transition: 'transform .18s ease, box-shadow .22s ease, border-color .18s ease', transformStyle: 'preserve-3d', position: 'relative', overflow: 'hidden' }}>
      {children}
      <div ref={glr} style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', transition: 'opacity .3s', borderRadius: 'inherit' }} />
    </div>
  )
}

// ── Color System Mini Visualizations ──────────────────────────────────────────

const EXP_COLS = ['#1a1d29', '#3d2e0a', '#6b4f15', '#a8782a', '#d4a84c', '#f0d98c']
const GOLD_DATA = [0, 1, 2, 3, 2, 1, 1, 3, 4, 5, 3, 2, 0, 2, 5, 4, 3, 1, 1, 3, 5, 4, 2, 1, 0, 1, 3, 4, 2, 0, 1, 2, 3, 4, 3, 2]

function MiniHeatmap() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px' }}>
      {GOLD_DATA.map((v, i) => (
        <div key={i} style={{ height: '14px', borderRadius: '2px', backgroundColor: EXP_COLS[v] }} />
      ))}
    </div>
  )
}

function MiniSparkline() {
  return (
    <svg width="100%" height="52" viewBox="0 0 160 52" preserveAspectRatio="none">
      <defs>
        <linearGradient id="gGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,48 C20,44 35,40 50,34 C65,28 80,24 95,16 C110,10 130,12 160,6" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" />
      <path d="M0,48 C20,44 35,40 50,34 C65,28 80,24 95,16 C110,10 130,12 160,6 L160,52 L0,52 Z" fill="url(#gGrad)" />
    </svg>
  )
}

function MiniDonut() {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx="40" cy="40" r="30" fill="none" stroke="#1e2130" strokeWidth="10" />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#6366f1" strokeWidth="10"
        strokeDasharray="65 125" strokeDashoffset="-31" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#818cf8" strokeWidth="10"
        strokeDasharray="38 125" strokeDashoffset="-96" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#4338ca" strokeWidth="10"
        strokeDasharray="22 125" strokeDashoffset="-134" strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  )
}

function MiniLossBars() {
  const bars = [75, 45, 90, 55, 30]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', height: '52px', paddingTop: '4px' }}>
      {bars.map((h, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ width: '100%', height: `${h * .48}px`, borderRadius: '3px 3px 0 0', background: `linear-gradient(to bottom, #f87171, #991b1b)`, opacity: 0.85 }} />
        </div>
      ))}
    </div>
  )
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const CSS = `
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  @keyframes float-alt { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes pulse-glow { 0%,100%{opacity:.25} 50%{opacity:.6} }
  @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
  @keyframes fade-in-up { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
  @keyframes border-flow { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }

  .fiu { animation: fade-in-up .7s ease forwards; }
  .d1{animation-delay:.1s;opacity:0} .d2{animation-delay:.2s;opacity:0} .d3{animation-delay:.3s;opacity:0} .d4{animation-delay:.4s;opacity:0} .d5{animation-delay:.5s;opacity:0}

  .shimmer-text {
    background: linear-gradient(90deg, #f0d98c 0%, #fffde0 38%, #f0d98c 55%, #c8961f 100%);
    background-size: 200% auto;
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    animation: shimmer 4.5s linear infinite;
  }

  .btn-gold {
    position: relative; overflow: hidden;
    transition: box-shadow .2s ease, transform .15s ease;
    background: linear-gradient(135deg, #f0d98c 0%, #d4a84c 100%);
  }
  .btn-gold::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
    transform: translateX(-100%); transition: transform .55s ease;
  }
  .btn-gold:hover::before { transform: translateX(100%); }
  .btn-gold:hover { box-shadow: 0 0 32px rgba(240,217,140,.4), 0 4px 16px rgba(0,0,0,.4); transform: translateY(-1px); }

  .btn-ghost {
    transition: background .2s ease, border-color .2s ease;
  }
  .btn-ghost:hover { background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.2) !important; }

  .grid-bg {
    background-image: linear-gradient(rgba(30,33,48,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(30,33,48,.28) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  .float-a { animation: float 5.5s ease infinite; }
  .float-b { animation: float-alt 7s ease infinite; animation-delay: -3s; }
  .float-c { animation: float 9s ease infinite; animation-delay: -5s; }

  .color-card { cursor: default; }
  .color-card:hover .color-strip { opacity: 1 !important; }
`

// ── Main ───────────────────────────────────────────────────────────────────────

export function LandingClient() {
  const mouse = useMouse()

  // Parallax offsets at different depths
  const p1 = { x: mouse.x * -28, y: mouse.y * -28 }  // slow
  const p2 = { x: mouse.x * -50, y: mouse.y * -50 }  // medium
  const p3 = { x: mouse.x * -18, y: mouse.y * -18 }  // very slow (large bg orb)

  return (
    <div style={{ backgroundColor: '#08090e', minHeight: '100vh', color: '#f3f0ea', fontFamily: 'var(--font-geist-sans)', overflowX: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'rgba(8,9,14,0.88)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(30,33,48,0.7)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={14} color="#0d0f14" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>Athena Finance</span>
          </div>
          <Link href="/login" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#0d0f14', fontWeight: 700, fontSize: '13px', padding: '7px 18px', borderRadius: '8px', textDecoration: 'none' }}>
            Anmelden
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', overflow: 'hidden', paddingTop: '100px', paddingBottom: '60px' }} className="grid-bg">
        {/* Parallax orbs */}
        <div className="float-c" style={{ position: 'absolute', top: '-120px', left: '50%', transform: `translateX(calc(-50% + ${p3.x}px)) translateY(${p3.y}px)`, width: '800px', height: '600px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,.14) 0%, transparent 68%)', pointerEvents: 'none', transition: 'transform .8s cubic-bezier(.25,.46,.45,.94)' }} />
        <div className="float-a" style={{ position: 'absolute', top: '60px', right: '6%', transform: `translate(${p1.x}px, ${p1.y}px)`, width: '360px', height: '360px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,.07) 0%, transparent 70%)', pointerEvents: 'none', transition: 'transform .55s cubic-bezier(.25,.46,.45,.94)', animation: 'pulse-glow 5s ease infinite' }} />
        <div className="float-b" style={{ position: 'absolute', bottom: '40px', left: '4%', transform: `translate(${p2.x}px, ${p2.y}px)`, width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(74,222,128,.06) 0%, transparent 70%)', pointerEvents: 'none', transition: 'transform .45s cubic-bezier(.25,.46,.45,.94)' }} />
        {/* Accent right bottom */}
        <div style={{ position: 'absolute', bottom: '-40px', right: '15%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(248,113,113,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
          <div className="fiu d1" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.22)', borderRadius: '100px', padding: '5px 16px 5px 8px', marginBottom: '36px' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', background: 'linear-gradient(135deg, #818cf8, #6366f1)', borderRadius: '50%' }}>
              <Zap size={10} color="white" strokeWidth={2.5} />
            </span>
            <span style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 500, letterSpacing: '.01em' }}>Persönliches Finanzsystem · Eric Schuck</span>
          </div>

          <h1 className="fiu d2" style={{ fontSize: 'clamp(42px, 7vw, 84px)', fontWeight: 800, letterSpacing: '-0.036em', lineHeight: 1.0, marginBottom: '24px', fontFamily: 'var(--font-playfair)' }}>
            Finanzen im Griff.
            <br />
            <span className="shimmer-text">Vollständig überblickt.</span>
          </h1>

          <p className="fiu d3" style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: '#9ca3af', maxWidth: '560px', margin: '0 auto 48px', lineHeight: 1.7 }}>
            Portfolio-Tracking, Ausgaben-Analyse, Sparplan-Management und Vertragsübersicht — in einem einzigen, leistungsstarken Dashboard.
          </p>

          <div className="fiu d4" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="btn-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#0d0f14', fontWeight: 700, fontSize: '15px', padding: '13px 30px', borderRadius: '10px', textDecoration: 'none', letterSpacing: '-0.01em' }}>
              Anmelden <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <a href="#features" className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#d1d5db', fontWeight: 500, fontSize: '15px', padding: '13px 26px', borderRadius: '10px', textDecoration: 'none' }}>
              Features entdecken <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD MOCKUP ── */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn dir="up" delay={0}>
            <TiltCard maxTilt={4} onHoverShadow="0 50px 120px rgba(0,0,0,.75), 0 0 50px rgba(240,217,140,.06), 0 0 0 1px rgba(240,217,140,.08)"
              style={{ borderRadius: '16px', border: '1px solid rgba(30,33,48,0.85)', backgroundColor: '#0d0f14', overflow: 'hidden', boxShadow: '0 36px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(240,217,140,.03)' }}>
              {/* Window bar */}
              <div style={{ height: '40px', backgroundColor: '#0a0c12', borderBottom: '1px solid #1e2130', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', opacity: .7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', opacity: .7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', opacity: .7 }} />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ backgroundColor: '#13161e', borderRadius: '6px', padding: '3px 20px', fontSize: '11px', color: '#4b5563' }}>athena-finance.de/dashboard</div>
                </div>
              </div>
              {/* Mock dashboard */}
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '420px' }}>
                {/* Sidebar */}
                <div style={{ backgroundColor: '#0a0c12', borderRight: '1px solid #1e2130', padding: '20px 12px' }}>
                  <div style={{ marginBottom: '20px', padding: '0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingUp size={11} color="#0d0f14" strokeWidth={2.5} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f0ea' }}>Athena Finance</span>
                    </div>
                  </div>
                  {[
                    { icon: <BarChart2 size={13} />, label: 'Dashboard', active: true },
                    { icon: <PieChart size={13} />, label: 'Depot' },
                    { icon: <Wallet size={13} />, label: 'Finance' },
                    { icon: <LineChart size={13} />, label: 'Analyse' },
                    { icon: <CandlestickChart size={13} />, label: 'Crypto' },
                    { icon: <Target size={13} />, label: 'Strategie' },
                  ].map(({ icon, label, active }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', marginBottom: '2px', backgroundColor: active ? 'rgba(240,217,140,0.1)' : 'transparent', color: active ? '#f0d98c' : '#4b5563', fontSize: '12px', fontWeight: active ? 600 : 400 }}>
                      {icon}{label}
                    </div>
                  ))}
                </div>
                {/* Main area */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'Gesamtvermögen', value: '€ 84.320', delta: '+12,4%', pos: true },
                      { label: 'Monat. Einnahmen', value: '€ 4.850', delta: '+5,2%', pos: true },
                      { label: 'Monat. Ausgaben', value: '€ 2.190', delta: '-8,1%', pos: false },
                      { label: 'Sparquote', value: '54,8%', delta: '+2,3%', pos: true },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '12px', border: '1px solid #1e2130' }}>
                        <p style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>{s.label}</p>
                        <p style={{ fontSize: '16px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px', letterSpacing: '-0.02em' }}>{s.value}</p>
                        <p style={{ fontSize: '10px', color: s.pos ? '#4ade80' : '#f87171', fontWeight: 500 }}>{s.delta}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1 }}>
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130' }}>
                      <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '12px' }}>Monatlicher Vergleich</p>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                        {[{ inc: 70, exp: 50 }, { inc: 80, exp: 55 }, { inc: 65, exp: 45 }, { inc: 90, exp: 60 }, { inc: 75, exp: 48 }, { inc: 95, exp: 52 }].map((b, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', height: '100%', justifyContent: 'flex-end' }}>
                            <div style={{ width: '100%', display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'flex-end' }}>
                              <div style={{ width: '6px', height: `${b.inc}%`, backgroundColor: '#4ade80', borderRadius: '2px 2px 0 0', opacity: .75 }} />
                              <div style={{ width: '6px', height: `${b.exp}%`, backgroundColor: '#f87171', borderRadius: '2px 2px 0 0', opacity: .75 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130', display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                        <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '72px', height: '72px' }}>
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#1e2130" strokeWidth="5" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#6366f1" strokeWidth="5" strokeDasharray="44 88" strokeLinecap="round" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#f0d98c" strokeWidth="5" strokeDasharray="26 88" strokeDashoffset="-44" strokeLinecap="round" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#4ade80" strokeWidth="5" strokeDasharray="18 88" strokeDashoffset="-70" strokeLinecap="round" />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f0ea' }}>3</span>
                          <span style={{ fontSize: '8px', color: '#6b7280' }}>Assets</span>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>Portfolio-Mix</p>
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

      {/* ── COLOR SYSTEM ── */}
      <section style={{ padding: '80px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              {
                color: '#f0d98c', accent: '#a8782a',
                glow: 'rgba(240,217,140,.2)',
                topGrad: 'linear-gradient(135deg, #3d2e0a, #a8782a, #f0d98c)',
                label: 'Ausgaben', sub: 'Heatmap · GuV · Kategorien',
                desc: 'Alle Ausgaben werden in Goldtönen visualisiert — von hell für niedrig bis satt für hoch.',
                viz: <MiniHeatmap />,
              },
              {
                color: '#4ade80', accent: '#166534',
                glow: 'rgba(74,222,128,.18)',
                topGrad: 'linear-gradient(135deg, #0a2d1a, #166534, #4ade80)',
                label: 'Einnahmen', sub: 'Cashflow · Kalender · Trends',
                desc: 'Einnahmen erscheinen in Grüntönen — als Sparkline, im Kalender und im GuV-Chart.',
                viz: <MiniSparkline />,
              },
              {
                color: '#f87171', accent: '#991b1b',
                glow: 'rgba(248,113,113,.18)',
                topGrad: 'linear-gradient(135deg, #3b0a0a, #991b1b, #f87171)',
                label: 'Verluste', sub: 'Alerts · Limits · Negativ',
                desc: 'Rottöne signalisieren Verluste, überschrittene Budgets und negative Nettobalance.',
                viz: <MiniLossBars />,
              },
              {
                color: '#818cf8', accent: '#4338ca',
                glow: 'rgba(99,102,241,.22)',
                topGrad: 'linear-gradient(135deg, #1a1b3a, #4338ca, #818cf8)',
                label: 'Portfolio', sub: 'Depot · Crypto · Rebalancing',
                desc: 'Indigo steht für Investitionen — Depot-Charts, Portfolio-Donut und Strategie-Übersicht.',
                viz: <MiniDonut />,
              },
            ].map(({ color, accent, glow, topGrad, label, sub, desc, viz }, i) => (
              <FadeIn key={label} delay={i * 0.08} dir="up">
                <TiltCard maxTilt={10} onHoverShadow={`0 12px 48px ${glow}, 0 0 0 1px ${color}30`}
                  style={{ backgroundColor: '#0d0f14', border: `1px solid #1e2130`, borderRadius: '16px', height: '100%' }}
                  className="color-card">
                  {/* Color strip */}
                  <div className="color-strip" style={{ height: '4px', background: topGrad, opacity: .7, transition: 'opacity .25s ease' }} />
                  <div style={{ padding: '20px' }}>
                    {/* Mini viz */}
                    <div style={{ marginBottom: '20px', minHeight: '56px' }}>
                      {viz}
                    </div>
                    {/* Label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
                      <span style={{ fontSize: '15px', fontWeight: 700, color }}>{label}</span>
                    </div>
                    <p style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '10px' }}>{sub}</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </TiltCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section style={{ padding: '40px 24px', backgroundColor: '#08090e' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', textAlign: 'center' }}>
          {[
            { value: '360°', label: 'Finanzüberblick', color: '#f0d98c' },
            { value: '8+', label: 'Analysetools', color: '#6366f1' },
            { value: '∞', label: 'Transaktionen', color: '#4ade80' },
            { value: '24/7', label: 'Echtzeit-Daten', color: '#f87171' },
          ].map((s, i) => (
            <FadeIn key={s.label} delay={i * 0.06}>
              <p style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: s.color, letterSpacing: '-0.03em', marginBottom: '4px', fontFamily: 'var(--font-geist-mono)', textShadow: `0 0 24px ${s.color}40` }}>{s.value}</p>
              <p style={{ fontSize: '13px', color: '#4b5563' }}>{s.label}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FEATURES BENTO ── */}
      <section id="features" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>Alles in einem Dashboard</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.028em', color: '#f3f0ea', lineHeight: 1.12 }}>
                Jede Dimension deiner Finanzen.
                <br /><span style={{ color: '#374151' }}>Lückenlos erfasst.</span>
              </h2>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {/* Big card: Analyse */}
            <FadeIn dir="up" delay={0} style={{ gridColumn: 'span 2' }}>
              <TiltCard maxTilt={6} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(99,102,241,.2)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(99,102,241,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BarChart2 size={18} color="#6366f1" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px' }}>Ausgaben-Analyse</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>Heatmap, GuV-Chart & Cashflow-Kalender</p>
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65, marginBottom: '20px', maxWidth: '400px' }}>
                  Visualisiere deinen Geldfluss mit GitHub-style Heatmaps, divergierenden GuV-Charts und einem interaktiven Cashflow-Kalender — alles aus echten Transaktionsdaten.
                </p>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', maxWidth: '300px' }}>
                  {GOLD_DATA.concat([1, 3, 2, 4, 2, 1]).map((v, i) => (
                    <div key={i} style={{ width: '11px', height: '11px', borderRadius: '2px', backgroundColor: EXP_COLS[Math.min(v, 5)] }} />
                  ))}
                </div>
              </TiltCard>
            </FadeIn>

            {/* Portfolio */}
            <FadeIn dir="up" delay={0.08}>
              <TiltCard maxTilt={10} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(240,217,140,.2)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(240,217,140,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <TrendingUp size={18} color="#f0d98c" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Portfolio-Tracking</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65 }}>Depot & Crypto in einer Ansicht. Kurs-Updates, Rebalancing-Vorschläge und Performance-Übersicht.</p>
              </TiltCard>
            </FadeIn>

            {/* Verträge */}
            <FadeIn dir="up" delay={0.04}>
              <TiltCard maxTilt={10} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(74,222,128,.2)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(74,222,128,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(74,222,128,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <FileText size={18} color="#4ade80" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Vertrags-Management</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65 }}>Alle Abonnements und Daueraufträge im Blick. Automatische Buchung wiederkehrender Zahlungen.</p>
              </TiltCard>
            </FadeIn>

            {/* Sparziele */}
            <FadeIn dir="up" delay={0.1}>
              <TiltCard maxTilt={10} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(248,113,113,.2)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(248,113,113,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(248,113,113,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <Target size={18} color="#f87171" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Sparziele & Pläne</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65 }}>Definiere Ziele, verfolge den Fortschritt und automatisiere Sparpläne für planbare Zukunftsplanung.</p>
              </TiltCard>
            </FadeIn>

            {/* Strategie — big */}
            <FadeIn dir="up" delay={0.06} style={{ gridColumn: 'span 2' }}>
              <TiltCard maxTilt={6} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(248,113,113,.15)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ position: 'absolute', bottom: '-40px', right: '-40px', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(248,113,113,.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(248,113,113,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CandlestickChart size={18} color="#f87171" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px' }}>Strategie & Backtesting</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>TPI, Indikatoren & Strategie-Tests</p>
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65, maxWidth: '440px', marginBottom: '20px' }}>
                  Entwickle und teste Handelsstrategien mit historischen Daten. TPI-Analyse, eigene Indikatoren und vollautomatisierte Backtests für fundierte Entscheidungen.
                </p>
                <svg width="100%" height="44" viewBox="0 0 320 44" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lineG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity=".3" />
                      <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,38 L40,30 L80,34 L110,22 L140,26 L170,16 L200,20 L230,11 L260,15 L290,6 L320,9" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" opacity=".75" />
                  <path d="M0,38 L40,30 L80,34 L110,22 L140,26 L170,16 L200,20 L230,11 L260,15 L290,6 L320,9 L320,44 L0,44 Z" fill="url(#lineG)" />
                </svg>
              </TiltCard>
            </FadeIn>

            {/* Multi-Währung */}
            <FadeIn dir="up" delay={0.12}>
              <TiltCard maxTilt={10} onHoverShadow="0 12px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(129,140,248,.2)"
                style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', height: '100%' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(99,102,241,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <Globe size={18} color="#818cf8" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Multi-Währung</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.65 }}>EUR, USD, CHF und mehr. Automatische Umrechnung in deine Basiswährung mit Echtzeit-Kursen.</p>
              </TiltCard>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: '80px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <FadeIn dir="up">
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#f0d98c', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '12px' }}>So einfach geht's</p>
              <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.026em', color: '#f3f0ea', lineHeight: 1.2 }}>In 3 Schritten zum vollen Überblick</h2>
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '28px', left: 'calc(16.67% + 20px)', right: 'calc(16.67% + 20px)', height: '1px', background: 'linear-gradient(90deg, transparent, #1e2130, rgba(240,217,140,.3), #1e2130, transparent)', pointerEvents: 'none' }} />
            {[
              { n: '01', icon: <ShieldCheck size={22} color="#f0d98c" />, title: 'Einloggen', desc: 'Privates System — Zugang nur für mich. Keine öffentliche Registrierung.' },
              { n: '02', icon: <Wallet size={22} color="#f0d98c" />, title: 'Daten einrichten', desc: 'Konten, Transaktionen, Verträge und Portfolios nach eigenem Bedarf konfigurieren.' },
              { n: '03', icon: <TrendingUp size={22} color="#f0d98c" />, title: 'Überblick genießen', desc: 'Alle Finanzdaten in einem übersichtlichen Dashboard — jederzeit und von überall.' },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.1} dir="up">
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

      {/* ── SPOTLIGHT: ANALYSE ── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}>
          <FadeIn dir="left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.22)', borderRadius: '100px', padding: '4px 14px', marginBottom: '20px' }}>
              <BarChart2 size={12} color="#818cf8" />
              <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>Analyse-Tab</span>
            </div>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.026em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.2 }}>
              Deine Ausgaben in einem ganz neuen Licht
            </h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.75, marginBottom: '24px' }}>
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
            <TiltCard maxTilt={8} style={{ backgroundColor: '#0d0f14', borderRadius: '16px', border: '1px solid #1e2130', padding: '20px', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
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
                    <div style={{ height: '100%', width: `${(item.val / item.max) * 100}%`, backgroundColor: item.color, opacity: .75, borderRadius: '4px' }} />
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
      <section style={{ padding: '48px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }}>
          {[
            { icon: <Repeat2 size={20} color="#f0d98c" />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
            { icon: <ShieldCheck size={20} color="#4ade80" />, title: 'Datenschutz', desc: 'Deine Daten bleiben bei dir. Keine Weitergabe, kein Tracking.' },
            { icon: <Globe size={20} color="#818cf8" />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — optimal auf Desktop, Tablet und Mobil.' },
            { icon: <Zap size={20} color="#fb923c" />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
          ].map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.07} dir="up">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#13161e', border: '1px solid #1e2130', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                <p style={{ fontSize: '15px', color: '#9ca3af', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 36px' }}>
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
      <footer style={{ borderTop: '1px solid #1e2130', padding: '32px 24px', backgroundColor: '#08090e' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={12} color="#0d0f14" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Athena Finance</span>
          </div>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#1f2937' }}>© 2025 Eric Schuck · Persönliches Projekt</span>
            <Link href="/login" style={{ fontSize: '12px', color: '#374151', textDecoration: 'none' }}>Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
