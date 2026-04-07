import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  TrendingUp, BarChart2, FileText, Target, Repeat2,
  Globe, ShieldCheck, Zap, ArrowRight, ChevronRight,
  CandlestickChart, PieChart, Wallet, LineChart,
} from 'lucide-react'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bar-grow {
          from { height: 0; }
          to { height: var(--bar-h); }
        }
        @keyframes count-up {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .fade-in-up { animation: fade-in-up 0.7s ease forwards; }
        .delay-100 { animation-delay: 0.1s; opacity: 0; }
        .delay-200 { animation-delay: 0.2s; opacity: 0; }
        .delay-300 { animation-delay: 0.3s; opacity: 0; }
        .delay-400 { animation-delay: 0.4s; opacity: 0; }
        .delay-500 { animation-delay: 0.5s; opacity: 0; }
        .shimmer-text {
          background: linear-gradient(90deg, #f0d98c 0%, #fffbe6 40%, #f0d98c 60%, #d4a84c 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .glow-gold { box-shadow: 0 0 40px rgba(240,217,140,0.15); }
        .glow-indigo { box-shadow: 0 0 40px rgba(99,102,241,0.2); }
        .card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .card-hover:hover {
          transform: translateY(-2px);
          border-color: rgba(240,217,140,0.2) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .btn-primary {
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.08);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .btn-primary:hover::after { opacity: 1; }
        .btn-primary:hover { box-shadow: 0 0 24px rgba(240,217,140,0.3); }
        .grid-bg {
          background-image:
            linear-gradient(rgba(30,33,48,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,33,48,0.4) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .mini-bar { animation: bar-grow 1.2s ease forwards; animation-delay: 0.5s; }
      `}</style>

      <div style={{ backgroundColor: '#08090e', minHeight: '100vh', color: '#f3f0ea', fontFamily: 'var(--font-geist-sans)' }}>

        {/* ── NAV ── */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: 'rgba(8,9,14,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(30,33,48,0.8)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={14} color="#0d0f14" strokeWidth={2.5} />
              </div>
              <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em', color: '#f3f0ea' }}>Athena Finance</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>Bereits Mitglied?</span>
              <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0d98c', color: '#0d0f14', fontWeight: 600, fontSize: '13px', padding: '7px 16px', borderRadius: '8px', textDecoration: 'none' }} className="btn-primary">
                Anmelden
              </Link>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section style={{ position: 'relative', overflow: 'hidden', paddingTop: '100px', paddingBottom: '80px' }} className="grid-bg">
          {/* Glow orbs */}
          <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '400px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '60px', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,0.08) 0%, transparent 70%)', pointerEvents: 'none', animation: 'pulse-glow 4s ease infinite' }} />
          <div style={{ position: 'absolute', bottom: '0', left: '5%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(74,222,128,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative' }}>

            {/* Badge */}
            <div className="fade-in-up delay-100" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '100px', padding: '5px 14px 5px 10px', marginBottom: '32px' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', backgroundColor: '#6366f1', borderRadius: '50%' }}>
                <Zap size={10} color="white" strokeWidth={2.5} />
              </span>
              <span style={{ fontSize: '12px', color: '#a5b4fc', fontWeight: 500 }}>Dein persönliches Finanzkommandozentrum</span>
            </div>

            {/* Headline */}
            <h1 className="fade-in-up delay-200" style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: '24px', fontFamily: 'var(--font-playfair)' }}>
              Finanzen im Griff.
              <br />
              <span className="shimmer-text">Vollständig überblickt.</span>
            </h1>

            {/* Subtext */}
            <p className="fade-in-up delay-300" style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#9ca3af', maxWidth: '560px', margin: '0 auto 40px', lineHeight: 1.65 }}>
              Athena Finance vereint Portfolio-Tracking, Ausgaben-Analyse, Sparplan-Management und Vertragsübersicht in einem einzigen, leistungsstarken Dashboard.
            </p>

            {/* CTAs */}
            <div className="fade-in-up delay-400" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#f0d98c', color: '#0d0f14', fontWeight: 700, fontSize: '15px', padding: '13px 28px', borderRadius: '10px', textDecoration: 'none', letterSpacing: '-0.01em' }} className="btn-primary">
                Kostenlos starten
                <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <a href="#features" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', fontWeight: 500, fontSize: '15px', padding: '13px 24px', borderRadius: '10px', textDecoration: 'none' }} className="btn-primary">
                Features entdecken
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </section>

        {/* ── DASHBOARD MOCKUP ── */}
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div className="fade-in-up delay-500" style={{ borderRadius: '16px', border: '1px solid rgba(30,33,48,0.8)', backgroundColor: '#0d0f14', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,217,140,0.04)' }}>
              {/* Window bar */}
              <div style={{ height: '40px', backgroundColor: '#0a0c12', borderBottom: '1px solid #1e2130', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', opacity: 0.7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', opacity: 0.7 }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', opacity: 0.7 }} />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ backgroundColor: '#13161e', borderRadius: '6px', padding: '3px 20px', fontSize: '11px', color: '#4b5563' }}>athena-finance.de/dashboard</div>
                </div>
              </div>

              {/* Mock dashboard content */}
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '420px' }}>
                {/* Sidebar */}
                <div style={{ backgroundColor: '#0a0c12', borderRight: '1px solid #1e2130', padding: '20px 12px' }}>
                  <div style={{ marginBottom: '20px', padding: '0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
                      {icon}
                      {label}
                    </div>
                  ))}
                </div>

                {/* Main area */}
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Top stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'Gesamtvermögen', value: '€ 84.320', delta: '+12,4%', positive: true },
                      { label: 'Monat. Einnahmen', value: '€ 4.850', delta: '+5,2%', positive: true },
                      { label: 'Monat. Ausgaben', value: '€ 2.190', delta: '-8,1%', positive: false },
                      { label: 'Sparquote', value: '54,8%', delta: '+2,3%', positive: true },
                    ].map(s => (
                      <div key={s.label} style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '12px', border: '1px solid #1e2130' }}>
                        <p style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>{s.label}</p>
                        <p style={{ fontSize: '16px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px', letterSpacing: '-0.02em' }}>{s.value}</p>
                        <p style={{ fontSize: '10px', color: s.positive ? '#4ade80' : '#f87171', fontWeight: 500 }}>{s.delta}</p>
                      </div>
                    ))}
                  </div>

                  {/* Charts row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1 }}>
                    {/* Bar chart mockup */}
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130' }}>
                      <p style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600, marginBottom: '12px' }}>Monatlicher Vergleich</p>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px', paddingBottom: '4px' }}>
                        {[
                          { inc: 70, exp: 50, m: 'Nov' },
                          { inc: 80, exp: 55, m: 'Dez' },
                          { inc: 65, exp: 45, m: 'Jan' },
                          { inc: 90, exp: 60, m: 'Feb' },
                          { inc: 75, exp: 48, m: 'Mär' },
                          { inc: 95, exp: 52, m: 'Apr' },
                        ].map(b => (
                          <div key={b.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', height: '100%', justifyContent: 'flex-end' }}>
                            <div style={{ width: '100%', display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'flex-end' }}>
                              <div style={{ width: '6px', height: `${b.inc}%`, backgroundColor: '#4ade80', borderRadius: '2px 2px 0 0', opacity: 0.75 }} />
                              <div style={{ width: '6px', height: `${b.exp}%`, backgroundColor: '#f87171', borderRadius: '2px 2px 0 0', opacity: 0.75 }} />
                            </div>
                            <span style={{ fontSize: '8px', color: '#4b5563' }}>{b.m}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Donut chart mockup */}
                    <div style={{ backgroundColor: '#13161e', borderRadius: '10px', padding: '14px', border: '1px solid #1e2130', display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                        <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '72px', height: '72px' }}>
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#1e2130" strokeWidth="5" />
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#6366f1" strokeWidth="5" strokeDasharray="44 88" strokeDashoffset="0" strokeLinecap="round" />
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
                        {[
                          { color: '#6366f1', label: 'Aktien', pct: '50%' },
                          { color: '#f0d98c', label: 'Crypto', pct: '30%' },
                          { color: '#4ade80', label: 'Cash', pct: '20%' },
                        ].map(i => (
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
            </div>
          </div>
        </section>

        {/* ── STATS STRIP ── */}
        <section style={{ borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130', backgroundColor: '#0a0c12', padding: '32px 24px' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', textAlign: 'center' }}>
            {[
              { value: '360°', label: 'Finanzüberblick', color: '#f0d98c' },
              { value: '8+', label: 'Analysetools', color: '#6366f1' },
              { value: '∞', label: 'Transaktionen', color: '#4ade80' },
              { value: '24/7', label: 'Echtzeit-Daten', color: '#f87171' },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 800, color: s.color, letterSpacing: '-0.03em', marginBottom: '4px', fontFamily: 'var(--font-geist-mono)' }}>{s.value}</p>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURES GRID ── */}
        <section id="features" style={{ padding: '80px 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Alles in einem Dashboard</p>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.15 }}>
                Jede Dimension deiner Finanzen.
                <br />
                <span style={{ color: '#6b7280' }}>Lückenlos erfasst.</span>
              </h2>
              <p style={{ fontSize: '15px', color: '#9ca3af', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>Von der täglichen Transaktion bis zur langfristigen Portfolio-Strategie — alles nahtlos vernetzt.</p>
            </div>

            {/* Bento grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'auto auto', gap: '16px' }}>

              {/* Big card: Ausgaben-Analyse */}
              <div className="card-hover" style={{ gridColumn: 'span 2', backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BarChart2 size={18} color="#6366f1" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px' }}>Ausgaben-Analyse</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>Heatmap, Sankey-Flow & Kalender</p>
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, marginBottom: '16px', maxWidth: '400px' }}>
                  Visualisiere deinen Geldfluss mit GitHub-style Heatmaps, Sankey-Diagrammen und einem interaktiven Cashflow-Kalender — alles mit echten Transaktionsdaten.
                </p>
                {/* Mini heatmap preview */}
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', maxWidth: '280px' }}>
                  {Array.from({ length: 52 }, (_, i) => {
                    const v = Math.random()
                    const col = v < 0.4 ? '#1a1d29' : v < 0.6 ? '#3d2e0a' : v < 0.75 ? '#a8782a' : v < 0.88 ? '#d4a84c' : '#f0d98c'
                    return <div key={i} style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: col }} />
                  })}
                </div>
              </div>

              {/* Small card: Portfolio */}
              <div className="card-hover" style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(240,217,140,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <TrendingUp size={18} color="#f0d98c" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Portfolio-Tracking</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>Depot & Crypto in einer Ansicht. Kurs-Updates, Rebalancing-Vorschläge und Performance-Übersicht.</p>
              </div>

              {/* Small card: Verträge */}
              <div className="card-hover" style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(74,222,128,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(74,222,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <FileText size={18} color="#4ade80" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Vertrags-Management</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>Alle Abonnements und Daueraufträge im Blick. Automatische Buchung wiederkehrender Zahlungen.</p>
              </div>

              {/* Small card: Sparziele */}
              <div className="card-hover" style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(248,113,113,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(248,113,113,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <Target size={18} color="#f87171" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Sparziele & Pläne</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>Definiere Ziele, verfolge den Fortschritt und automatisiere Sparpläne für planbare Zukunftsplanung.</p>
              </div>

              {/* Big card: Strategie */}
              <div className="card-hover" style={{ gridColumn: 'span 2', backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: '-40px', right: '-40px', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(248,113,113,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(248,113,113,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CandlestickChart size={18} color="#f87171" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '2px' }}>Strategie & Backtesting</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280' }}>TPI, Indikatoren & Strategie-Tests</p>
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, maxWidth: '440px' }}>
                  Entwickle und teste Handelsstrategien mit historischen Daten. TPI-Analyse, eigene Indikatoren und vollautomatisierte Backtests für fundierte Entscheidungen.
                </p>
                {/* Mini chart line */}
                <div style={{ marginTop: '16px', height: '40px', position: 'relative', maxWidth: '320px' }}>
                  <svg width="100%" height="40" viewBox="0 0 320 40" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,35 L40,28 L80,32 L100,20 L130,24 L160,15 L190,18 L220,10 L250,14 L280,6 L320,8" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
                    <path d="M0,35 L40,28 L80,32 L100,20 L130,24 L160,15 L190,18 L220,10 L250,14 L280,6 L320,8 L320,40 L0,40 Z" fill="url(#lineGrad)" />
                  </svg>
                </div>
              </div>

              {/* Small card: Multi-currency */}
              <div className="card-hover" style={{ backgroundColor: '#0d0f14', border: '1px solid #1e2130', borderRadius: '16px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <Globe size={18} color="#818cf8" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f0ea', marginBottom: '6px' }}>Multi-Währung</h3>
                <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>EUR, USD, CHF und mehr. Automatische Umrechnung in deine Basiswährung mit Echtzeit-Kursen.</p>
              </div>

            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ padding: '80px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '56px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#f0d98c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>So einfach geht's</p>
              <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#f3f0ea', lineHeight: 1.2 }}>In 3 Schritten zum vollen Überblick</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', position: 'relative' }}>
              {/* Connector line */}
              <div style={{ position: 'absolute', top: '28px', left: 'calc(16.67% + 20px)', right: 'calc(16.67% + 20px)', height: '1px', background: 'linear-gradient(90deg, transparent, #1e2130, #f0d98c40, #1e2130, transparent)', pointerEvents: 'none' }} />

              {[
                { n: '01', icon: <ShieldCheck size={22} color="#f0d98c" />, title: 'Konto erstellen', desc: 'Registriere dich kostenlos in unter einer Minute. Keine Kreditkarte, keine Verpflichtungen.' },
                { n: '02', icon: <Wallet size={22} color="#f0d98c" />, title: 'Daten einrichten', desc: 'Verbinde deine Konten, importiere Transaktionen und konfiguriere Kategorien nach deinem Bedarf.' },
                { n: '03', icon: <TrendingUp size={22} color="#f0d98c" />, title: 'Überblick genießen', desc: 'Alle deine Finanzdaten in einem übersichtlichen Dashboard — jederzeit und von überall.' },
              ].map(step => (
                <div key={step.n} style={{ textAlign: 'center', position: 'relative' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: 'rgba(240,217,140,0.08)', border: '1px solid rgba(240,217,140,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    {step.icon}
                  </div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#f0d98c', letterSpacing: '0.08em', marginBottom: '8px', fontFamily: 'var(--font-geist-mono)' }}>{step.n}</p>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f0ea', marginBottom: '8px' }}>{step.title}</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURE SPOTLIGHT: Analyse ── */}
        <section style={{ padding: '80px 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}>
            {/* Text */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '100px', padding: '4px 12px', marginBottom: '20px' }}>
                <BarChart2 size={12} color="#818cf8" />
                <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>Analyse-Tab</span>
              </div>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.2 }}>
                Deine Ausgaben in einem ganz neuen Licht
              </h2>
              <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.7, marginBottom: '24px' }}>
                Der Analyse-Tab verwandelt rohe Transaktionsdaten in aussagekräftige Visualisierungen. Erkenne saisonale Muster, verfolge Geldflüsse und verstehe, wohin dein Geld wirklich geht.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  'Ausgaben-Heatmap (GitHub-style) für Ein- & Ausgaben',
                  'Sankey-Diagramm für vollständige Geldfluss-Visualisierung',
                  'Interaktiver Cashflow-Kalender mit Tagesdetails',
                  'Divergierende Balken für Einnahmen & Ausgaben pro Kategorie',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      <ChevronRight size={10} color="#818cf8" strokeWidth={2.5} />
                    </div>
                    <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.5 }}>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual */}
            <div style={{ backgroundColor: '#0d0f14', borderRadius: '16px', border: '1px solid #1e2130', padding: '20px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '14px' }}>Ausgaben nach Kategorie</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { cat: 'Wohnen', val: 1200, max: 1200, color: '#f87171' },
                  { cat: 'Lebensmittel', val: 480, max: 1200, color: '#f87171' },
                  { cat: 'Transport', val: 320, max: 1200, color: '#f87171' },
                  { cat: 'Gehalt', val: 3800, max: 3800, color: '#4ade80', income: true },
                  { cat: 'Freelance', val: 950, max: 3800, color: '#4ade80', income: true },
                  { cat: 'Entertainment', val: 180, max: 1200, color: '#f87171' },
                ].map(item => (
                  <div key={item.cat} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: '#6b7280', width: '88px', textAlign: 'right', flexShrink: 0 }}>{item.cat}</span>
                    <div style={{ flex: 1, height: '16px', backgroundColor: '#13161e', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(item.val / (item.income ? 3800 : 1200)) * 100}%`, backgroundColor: item.color, opacity: 0.75, borderRadius: '4px', transition: 'width 1s ease' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: item.color, fontWeight: 600, width: '48px', textAlign: 'right', fontFamily: 'var(--font-geist-mono)' }}>
                      {item.income ? '+' : '-'}{item.val.toLocaleString('de-DE')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Month comparison mini */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1e2130' }}>
                <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '10px' }}>Letzten 4 Monate</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '50px' }}>
                  {[
                    { m: 'Jan', h: 60, pos: true },
                    { m: 'Feb', h: 72, pos: true },
                    { m: 'Mär', h: 48, pos: false },
                    { m: 'Apr', h: 80, pos: true },
                  ].map(b => (
                    <div key={b.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${b.h}%`, borderRadius: '3px 3px 0 0', backgroundColor: b.pos ? '#4ade80' : '#f87171', opacity: 0.7 }} />
                      <span style={{ fontSize: '9px', color: '#4b5563' }}>{b.m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FEATURE SPOTLIGHT: Portfolio ── */}
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }}>
            {/* Visual */}
            <div style={{ backgroundColor: '#0d0f14', borderRadius: '16px', border: '1px solid #1e2130', padding: '20px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <p style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>Portfolio-Übersicht</p>
                <span style={{ fontSize: '10px', color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', padding: '2px 8px', borderRadius: '100px' }}>+14,2% YTD</span>
              </div>
              {/* Fake line chart */}
              <div style={{ height: '80px', marginBottom: '16px', position: 'relative' }}>
                <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f0d98c" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#f0d98c" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,70 L30,65 L60,60 L90,55 L110,58 L130,48 L155,45 L170,40 L190,35 L210,38 L230,28 L260,22 L290,15 L300,12" fill="none" stroke="#f0d98c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M0,70 L30,65 L60,60 L90,55 L110,58 L130,48 L155,45 L170,40 L190,35 L210,38 L230,28 L260,22 L290,15 L300,12 L300,80 L0,80 Z" fill="url(#portfolioGrad)" />
                </svg>
              </div>
              {/* Holdings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { name: 'MSCI World ETF', pct: '+18,3%', val: '€ 42.150', pos: true },
                  { name: 'Bitcoin', pct: '+31,2%', val: '€ 18.400', pos: true },
                  { name: 'S&P 500 ETF', pct: '+9,8%', val: '€ 16.800', pos: true },
                  { name: 'Tagesgeld', pct: '+3,5%', val: '€ 6.970', pos: true },
                ].map(h => (
                  <div key={h.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', backgroundColor: '#13161e', borderRadius: '7px' }}>
                    <span style={{ fontSize: '11px', color: '#d1d5db' }}>{h.name}</span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: h.pos ? '#4ade80' : '#f87171', fontWeight: 600 }}>{h.pct}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'var(--font-geist-mono)' }}>{h.val}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Text */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(240,217,140,0.1)', border: '1px solid rgba(240,217,140,0.2)', borderRadius: '100px', padding: '4px 12px', marginBottom: '20px' }}>
                <TrendingUp size={12} color="#f0d98c" />
                <span style={{ fontSize: '11px', color: '#f0d98c', fontWeight: 600 }}>Portfolio & Depot</span>
              </div>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.2 }}>
                Dein gesamtes Vermögen auf einen Blick
              </h2>
              <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.7, marginBottom: '24px' }}>
                Verfolge Aktien, ETFs, Kryptowährungen und Cash-Positionen in einer zentralen Ansicht. Mit automatischen Kurs-Updates und intelligenten Rebalancing-Vorschlägen.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  'Echtzeit-Kurse für Aktien, ETFs & Kryptowährungen',
                  'Portfolio-Donut nach Anlageklassen & Währungen',
                  'Performance-Tracking über beliebige Zeiträume',
                  'Automatische Rebalancing-Empfehlungen',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'rgba(240,217,140,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      <ChevronRight size={10} color="#f0d98c" strokeWidth={2.5} />
                    </div>
                    <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.5 }}>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── ADDITIONAL FEATURES STRIP ── */}
        <section style={{ padding: '48px 24px', backgroundColor: '#0a0c12', borderTop: '1px solid #1e2130', borderBottom: '1px solid #1e2130' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {[
              { icon: <Repeat2 size={20} color="#f0d98c" />, title: 'Auto-Buchungen', desc: 'Wiederkehrende Verträge werden automatisch als Transaktionen gebucht.' },
              { icon: <ShieldCheck size={20} color="#4ade80" />, title: 'Datenschutz', desc: 'Deine Daten bleiben bei dir. Keine Weitergabe, kein Tracking.' },
              { icon: <Globe size={20} color="#818cf8" />, title: 'Überall verfügbar', desc: 'Vollständig responsiv — optimal auf Desktop, Tablet und Mobil.' },
              { icon: <Zap size={20} color="#fb923c" />, title: 'Echtzeitdaten', desc: 'Preise und Portfoliowerte aktualisieren sich automatisch.' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#13161e', border: '1px solid #1e2130', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#f3f0ea', marginBottom: '4px' }}>{f.title}</h4>
                  <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section style={{ padding: '80px 24px' }}>
          <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            <div style={{ borderRadius: '20px', background: 'linear-gradient(135deg, #0f1018 0%, #131620 50%, #0d0f16 100%)', border: '1px solid rgba(240,217,140,0.15)', padding: 'clamp(40px, 5vw, 64px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }} className="glow-gold">
              {/* Background glow */}
              <div style={{ position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)', width: '400px', height: '300px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(240,217,140,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

              <div style={{ position: 'relative' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#f0d98c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>Kostenlos starten</p>
                <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#f3f0ea', marginBottom: '16px', lineHeight: 1.15, fontFamily: 'var(--font-playfair)' }}>
                  Starte heute mit Athena Finance.
                </h2>
                <p style={{ fontSize: '15px', color: '#9ca3af', marginBottom: '36px', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 36px' }}>
                  Kein Abo, keine versteckten Kosten. Erstelle jetzt dein Konto und bringe Ordnung in deine Finanzen.
                </p>
                <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#f0d98c', color: '#0d0f14', fontWeight: 700, fontSize: '15px', padding: '14px 32px', borderRadius: '11px', textDecoration: 'none', letterSpacing: '-0.01em' }} className="btn-primary">
                  Jetzt kostenlos registrieren
                  <ArrowRight size={16} strokeWidth={2.5} />
                </Link>
                <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '16px' }}>
                  Bereits registriert?{' '}
                  <Link href="/login" style={{ color: '#6b7280', textDecoration: 'underline', textDecorationColor: 'rgba(107,114,128,0.4)' }}>
                    Direkt einloggen
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid #1e2130', padding: '32px 24px', backgroundColor: '#08090e' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '5px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={12} color="#0d0f14" strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#4b5563' }}>Athena Finance</span>
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#374151' }}>© 2025 Athena Finance</span>
              <Link href="/login" style={{ fontSize: '12px', color: '#4b5563', textDecoration: 'none' }}>Login</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}
