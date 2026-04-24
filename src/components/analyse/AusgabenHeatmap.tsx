'use client'

import { useMemo, useState } from 'react'
import type { HeatmapDay } from '@/lib/analyseData'

interface Props { data: HeatmapDay[] }

type Mode = 'ausgaben' | 'einnahmen' | 'guv'

const MONTH_LABELS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const DAY_LABELS   = ['Mo', '', 'Mi', '', 'Fr', '', '']

// Gold-Skala (Ausgaben): 0 = keine, 5 = sehr hoch
const EXP_COLORS = ['#1a1d29', '#3d2e0a', '#6b4f15', '#a8782a', '#d4a84c', '#f0d98c']
// Grün-Skala (Einnahmen)
const INC_COLORS = ['#1a1d29', '#0a2d1a', '#15542f', '#1a7a43', '#22a85e', '#4ade80']
// GuV-Skala: -5 (hohe Ausgaben) → 0 (neutral) → +5 (hohe Einnahmen)
const GUV_COLORS = [
  '#7f1d1d', // -5: sehr hohe Nettoausgaben
  '#991b1b', // -4
  '#c62828', // -3
  '#ef4444', // -2
  '#fca5a5', // -1: leicht negativ
  '#1a1d29', // 0: neutral / keine Aktivität
  '#bbf7d0', // +1: leicht positiv
  '#4ade80', // +2
  '#22c55e', // +3
  '#16a34a', // +4
  '#166534', // +5: sehr hohe Nettoeinnahmen
]

function expLevel(v: number): number {
  if (v === 0) return 0; if (v <= 80) return 1; if (v <= 200) return 2
  if (v <= 350) return 3; if (v <= 550) return 4; return 5
}
function incLevel(v: number): number {
  if (v === 0) return 0; if (v <= 50) return 1; if (v <= 200) return 2
  if (v <= 1000) return 3; if (v <= 2500) return 4; return 5
}
function guvLevel(income: number, amount: number): number {
  if (income === 0 && amount === 0) return 0
  const net = income - amount
  if (net > 2000) return 5
  if (net > 500)  return 4
  if (net > 100)  return 3
  if (net > 10)   return 2
  if (net > 0)    return 1
  if (net === 0)  return 0
  if (net >= -10)   return -1
  if (net >= -100)  return -2
  if (net >= -500)  return -3
  if (net >= -2000) return -4
  return -5
}

function cellBackground(day: HeatmapDay, mode: Mode): string {
  if (mode === 'ausgaben')  return EXP_COLORS[expLevel(day.amount)]
  if (mode === 'einnahmen') return INC_COLORS[incLevel(day.income)]
  // GuV: divergierende Farbskala basierend auf Netto-Cashflow
  return GUV_COLORS[guvLevel(day.income, day.amount) + 5]
}

interface TipState { date: string; amount: number; income: number; x: number; y: number }

export function AusgabenHeatmap({ data }: Props) {
  const [mode, setMode] = useState<Mode>('ausgaben')
  const [tip, setTip]   = useState<TipState | null>(null)

  const { weeks, monthMarkers } = useMemo(() => {
    const map = new Map(data.map(d => [d.date, d]))

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay()
    const lastMon = new Date(today)
    lastMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))

    const start = new Date(lastMon)
    start.setDate(lastMon.getDate() - 51 * 7)

    type Cell = { date: string; amount: number; income: number }
    const days: Cell[] = []
    const cur = new Date(start)
    while (cur <= today) {
      const iso = cur.toISOString().split('T')[0]
      const d = map.get(iso)
      days.push({ date: iso, amount: d?.amount ?? 0, income: d?.income ?? 0 })
      cur.setDate(cur.getDate() + 1)
    }

    const weeks: (Cell | null)[][] = []
    for (let i = 0; i < days.length; i += 7) {
      const w: (Cell | null)[] = days.slice(i, i + 7)
      while (w.length < 7) w.push(null)
      weeks.push(w)
    }

    const monthMarkers = new Map<number, string>()
    weeks.forEach((week, wi) => {
      week.forEach(d => {
        if (!d) return
        const dt = new Date(d.date + 'T00:00:00')
        if (dt.getDate() === 1) monthMarkers.set(wi, MONTH_LABELS[dt.getMonth()])
      })
    })

    return { weeks, monthMarkers }
  }, [data])

  const modeLabel = mode === 'ausgaben' ? 'Ausgaben' : mode === 'einnahmen' ? 'Einnahmen' : 'GuV'

  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-[#f3f0ea]">{modeLabel}-Heatmap</h2>
        <div className="flex gap-1">
          {(['ausgaben', 'einnahmen', 'guv'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-all duration-150 ${
                mode === m
                  ? m === 'ausgaben'  ? 'bg-[#f0d98c] text-[#0d0f14]'
                  : m === 'einnahmen' ? 'bg-[#4ade80] text-[#0d0f14]'
                  :                    'bg-linear-to-r from-[#ef4444] to-[#4ade80] text-[#0d0f14]'
                  : 'text-[#6b7280] hover:text-[#d1d5db] hover:bg-[#1e2130]'
              }`}
            >
              {m === 'ausgaben' ? 'Ausgaben' : m === 'einnahmen' ? 'Einnahmen' : 'GuV'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" style={{ minWidth: `${weeks.length * 14 + 32}px` }}>
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] mr-1 shrink-0">
            <div className="h-4" />
            {DAY_LABELS.map((lbl, i) => (
              <div key={i} className="h-[11px] w-6 flex items-center text-[9px] text-[#4b5563]">{lbl}</div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              <div className="h-4 text-[9px] text-[#4b5563] whitespace-nowrap leading-4">
                {monthMarkers.get(wi) ?? ''}
              </div>
              {week.map((day, di) => (
                <div
                  key={di}
                  className="w-[11px] h-[11px] rounded-[2px] cursor-default overflow-hidden"
                  style={day
                    ? { background: cellBackground(day, mode) }
                    : { backgroundColor: '#1a1d29' }
                  }
                  onMouseEnter={e => {
                    if (!day) return
                    const r = e.currentTarget.getBoundingClientRect()
                    setTip({ date: day.date, amount: day.amount, income: day.income, x: r.left, y: r.top })
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legende */}
      <div className="flex items-center justify-end gap-3 mt-3">
        {mode === 'ausgaben' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#4b5563]">wenig</span>
            {EXP_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-[#4b5563]">viel</span>
          </div>
        )}
        {mode === 'einnahmen' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#4b5563]">wenig</span>
            {INC_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-[#4b5563]">viel</span>
          </div>
        )}
        {mode === 'guv' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#f87171]">Ausgaben</span>
            {GUV_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-[#4ade80]">Einnahmen</span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tip && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-[#1e2130] bg-[#0d0f14] p-2.5 shadow-xl text-xs"
          style={{ left: tip.x + 16, top: tip.y - 8 }}
        >
          <p className="text-[#6b7280] mb-1">
            {new Date(tip.date + 'T00:00:00').toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </p>
          {(mode === 'ausgaben' || mode === 'guv') && tip.amount > 0 && (
            <p className="font-semibold text-[#f0d98c]">
              Ausgaben: {tip.amount.toLocaleString('de-DE')} €
            </p>
          )}
          {(mode === 'einnahmen' || mode === 'guv') && tip.income > 0 && (
            <p className="font-semibold text-[#4ade80]">
              Einnahmen: {tip.income.toLocaleString('de-DE')} €
            </p>
          )}
          {mode === 'guv' && (tip.income > 0 || tip.amount > 0) && (
            <p className={`font-bold mt-0.5 ${tip.income - tip.amount >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
              Netto: {tip.income - tip.amount >= 0 ? '+' : ''}{(tip.income - tip.amount).toLocaleString('de-DE')} €
            </p>
          )}
        </div>
      )}
    </div>
  )
}
