'use client'

import { useMemo, useState } from 'react'
import type { HeatmapDay } from '@/lib/analyseData'
import { useClampedPosition } from '@/lib/hooks/use-clamped-position'

interface Props { data: HeatmapDay[]; initialMode?: Mode }

export type Mode = 'ausgaben' | 'einnahmen' | 'guv'

const MONTH_LABELS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const DAY_LABELS   = ['Mo', '', 'Mi', '', 'Fr', '', '']

// Stufen als color-mix() von --muted (neutral) zur Theme-Farbe --chart-expense
// / --chart-income (siehe globals.css) statt fester Gold-/Oliv-Hex-Werte —
// jedes Theme-Preset bekommt so seine eigene Heatmap-Skala statt überall
// Aurums Gold/Oliv zu zeigen. 0 = keine Aktivität, 5 = sehr hoch.
function mixScale(color: string, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) =>
    `color-mix(in srgb, ${color} ${Math.round((i / (steps - 1)) * 100)}%, var(--muted) ${Math.round((1 - i / (steps - 1)) * 100)}%)`,
  )
}
const EXP_COLORS = mixScale('var(--chart-expense)', 6)
const INC_COLORS = mixScale('var(--chart-income)', 6)
// GuV-Skala: -5 (hohe Ausgaben) → 0 (neutral) → +5 (hohe Einnahmen), jeweils
// zur Theme-Farbe hin abgestuft statt fester Terrakotta-/Oliv-Werte.
const GUV_COLORS = [
  ...mixScale('var(--chart-expense)', 6).slice(1).reverse(), // -5 .. -1
  'var(--muted)',                                            //  0: neutral
  ...mixScale('var(--chart-income)', 6).slice(1),             // +1 .. +5
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

export function AusgabenHeatmap({ data, initialMode = 'ausgaben' }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tip, setTip]   = useState<TipState | null>(null)
  const { ref: tipRef, style: tipStyle } = useClampedPosition(tip ? { x: tip.x, y: tip.y } : null)

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
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-foreground">{modeLabel}-Heatmap</h2>
        <div className="flex gap-1">
          {(['ausgaben', 'einnahmen', 'guv'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-[10px] rounded font-medium capitalize transition-all duration-150 ${
                mode === m
                  ? 'bg-foreground text-background scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {m === 'ausgaben' ? 'Ausgaben' : m === 'einnahmen' ? 'Einnahmen' : 'GuV'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-0.75" style={{ minWidth: `${weeks.length * 15 + 34}px` }}>
          {/* Day labels */}
          <div className="flex flex-col gap-0.75 mr-1.5 shrink-0">
            <div className="h-5" />
            {DAY_LABELS.map((lbl, i) => (
              <div key={i} className="h-3 w-6 flex items-center text-[10px] font-medium text-muted-foreground">{lbl}</div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.75">
              <div className="h-5 text-[10px] font-semibold text-muted-foreground whitespace-nowrap leading-5">
                {monthMarkers.get(wi) ?? ''}
              </div>
              {week.map((day, di) => (
                <div
                  key={di}
                  className="w-3 h-3 rounded-[2px] cursor-default overflow-hidden"
                  style={{ background: day ? cellBackground(day, mode) : 'var(--muted)' }}
                  onMouseEnter={e => {
                    if (!day) return
                    setTip({ date: day.date, amount: day.amount, income: day.income, x: e.clientX, y: e.clientY })
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
            <span className="text-[9px] text-muted-foreground/60">wenig</span>
            {EXP_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-muted-foreground/60">viel</span>
          </div>
        )}
        {mode === 'einnahmen' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground/60">wenig</span>
            {INC_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-muted-foreground/60">viel</span>
          </div>
        )}
        {mode === 'guv' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-(--chart-expense)">Ausgaben</span>
            {GUV_COLORS.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[9px] text-(--chart-income)">Einnahmen</span>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tip && (
        <div
          ref={tipRef}
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover p-2.5 shadow-xl text-xs"
          style={tipStyle}
        >
          <p className="text-muted-foreground mb-1">
            {new Date(tip.date + 'T00:00:00').toLocaleDateString('de-DE', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </p>
          {(mode === 'ausgaben' || mode === 'guv') && tip.amount > 0 && (
            <p className="font-semibold text-(--chart-expense)">
              Ausgaben: {tip.amount.toLocaleString('de-DE')} €
            </p>
          )}
          {(mode === 'einnahmen' || mode === 'guv') && tip.income > 0 && (
            <p className="font-semibold text-(--chart-income)">
              Einnahmen: {tip.income.toLocaleString('de-DE')} €
            </p>
          )}
          {mode === 'guv' && (tip.income > 0 || tip.amount > 0) && (
            <p className={`font-bold mt-0.5 ${tip.income - tip.amount >= 0 ? 'text-(--chart-income)' : 'text-(--chart-expense)'}`}>
              Netto: {tip.income - tip.amount >= 0 ? '+' : ''}{(tip.income - tip.amount).toLocaleString('de-DE')} €
            </p>
          )}
        </div>
      )}
    </div>
  )
}
