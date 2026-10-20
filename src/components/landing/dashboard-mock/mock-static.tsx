import type { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight, Sparkles, Info, AlertTriangle } from 'lucide-react'
import { APP, F, kicker } from '@/components/landing/landing-tokens'
import { ATHENA_INSIGHTS } from '@/components/landing/dashboard-mock/mock-data'

// Reine Darstellung ohne Hooks/Handler: die Datei trägt bewusst KEIN 'use client'
// und bleibt damit von jeder Seite (Server wie Client) importierbar.

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="mock-label"
      style={{ ...kicker, fontSize: 'clamp(9px, .75vw, 11px)', color: APP.mutedFg, position: 'relative' }}
    >
      {children}
    </span>
  )
}

export function DeltaChip({ up, delta, big = false }: { up: boolean; delta: string; big?: boolean }) {
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
        color: up ? APP.positive : APP.destructive,
      }}
    >
      <Arrow size={big ? 14 : 12} strokeWidth={2} />
      {delta}
    </span>
  )
}

/**
 * Athenas Hinweise. Nachbau von athena-insights.tsx statt Import: die echte
 * Komponente ist ein Client-Formular mit Server-Action zum Wegklicken
 * (dismissInsight) — im Mockup wäre das eine Schaltfläche, die nichts tut,
 * und der Import zöge die Server-Action mitsamt Supabase-Client in das
 * Landing-Bundle, das sonst keinen davon braucht.
 */
export function AthenaInsightsCard() {
  return (
    <div
      style={{
        border: `1px solid ${APP.border}`,
        borderRadius: '10px',
        padding: 'clamp(10px, 1.1vw, 15px)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '9px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(11px, .95vw, 13px)', fontWeight: 600, color: APP.cardFg }}>
          <Sparkles size={13} strokeWidth={1.8} style={{ color: APP.positive, flexShrink: 0 }} />
          Athena
          <span style={{ fontWeight: 400, color: APP.mutedFg }}>{ATHENA_INSIGHTS.length}</span>
        </span>
        <span style={{ fontSize: 'clamp(10px, .8vw, 12px)', color: APP.mutedFg, whiteSpace: 'nowrap' }}>Chat →</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {ATHENA_INSIGHTS.map((it) => {
          const Icon = it.severity === 'warning' ? AlertTriangle : Info
          return (
            <div key={it.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Icon
                size={13}
                strokeWidth={1.7}
                style={{ flexShrink: 0, marginTop: '2px', color: it.severity === 'warning' ? APP.warning : APP.mutedFg }}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'clamp(11px, .9vw, 12.5px)', lineHeight: 1.35, color: APP.cardFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.title}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 'clamp(10px, .78vw, 11.5px)', lineHeight: 1.35, color: APP.mutedFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Kleine Beschriftung + Wert, wie sie in der Net-Worth-Karte viermal und in
    der Monatsbilanz zweimal vorkommt. */
export function MiniStat({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 'clamp(9px, .72vw, 10.5px)', color: APP.mutedFg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </p>
      <p style={{ margin: '1px 0 0', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: F.mono, fontSize: 'clamp(10px, .84vw, 12px)', color: color ?? APP.cardFg, fontVariantNumeric: 'tabular-nums' }}>
        {icon}
        {value}
      </p>
    </div>
  )
}
