'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import type { CashflowEvent } from '@/lib/analyseData'

interface Props { events: CashflowEvent[] }

const WEEKDAYS    = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstDayOffset(y: number, m: number) {
  const dow = new Date(y, m, 1).getDay()
  return dow === 0 ? 6 : dow - 1
}
function fmtAmt(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface TipState { day: number; x: number; y: number }

export function CashflowKalender({ events }: Props) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [tip, setTip] = useState<TipState | null>(null)

  const days   = daysInMonth(year, month)
  const offset = firstDayOffset(year, month)
  const cells  = Math.ceil((days + offset) / 7) * 7

  // Group events by day
  const byDay = new Map<number, CashflowEvent[]>()
  for (const ev of events) {
    const d = new Date(ev.date + 'T00:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(ev)
    }
  }

  const prev = () => {
    setSelectedDay(null)
    month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1)
  }
  const next = () => {
    setSelectedDay(null)
    month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1)
  }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const selectedEvs = selectedDay != null ? (byDay.get(selectedDay) ?? []) : []
  const selectedIncome  = selectedEvs.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const selectedExpense = selectedEvs.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

  // Tooltip data for hovered day
  const tipEvs = tip ? (byDay.get(tip.day) ?? []) : []
  const tipIncome  = tipEvs.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const tipExpense = tipEvs.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-1 rounded hover:bg-[#1e2130] text-[#6b7280] hover:text-[#f3f0ea] transition-colors">
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-sm font-semibold text-[#f3f0ea]">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={next} className="p-1 rounded hover:bg-[#1e2130] text-[#6b7280] hover:text-[#f3f0ea] transition-colors">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-[#4b5563] py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: cells }, (_, i) => {
          const day  = i - offset + 1
          const valid = day >= 1 && day <= days
          const evs  = valid ? (byDay.get(day) ?? []) : []
          const isSelected = valid && selectedDay === day
          const hasEvs = evs.length > 0

          return (
            <div
              key={i}
              onClick={() => valid && setSelectedDay(isSelected ? null : day)}
              onMouseEnter={e => {
                if (!valid || !hasEvs) return
                const r = e.currentTarget.getBoundingClientRect()
                setTip({ day, x: r.left + r.width / 2, y: r.top })
              }}
              onMouseLeave={() => setTip(null)}
              className={`min-h-14.5 p-1 rounded text-xs transition-colors ${
                !valid ? '' :
                isSelected ? 'bg-[#1e2130] ring-1 ring-[#f0d98c]/40 cursor-pointer' :
                hasEvs ? 'bg-[#0d0f14] hover:bg-[#1a1d29] cursor-pointer' :
                'bg-[#0d0f14]'
              }`}
            >
              {valid && (
                <>
                  <div className={`w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-medium mb-0.5 ${
                    isToday(day) ? 'bg-[#f0d98c] text-[#0d0f14] font-bold' : 'text-[#6b7280]'
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 2).map((ev, ei) => (
                      <div key={ei} className={`flex items-center gap-0.5 text-[9px] truncate leading-tight ${
                        ev.type === 'income' ? 'text-[#4ade80]' : 'text-[#f87171]'
                      }`}>
                        {ev.type === 'income'
                          ? <ArrowUpRight className="size-2.5 shrink-0" />
                          : <ArrowDownLeft className="size-2.5 shrink-0" />
                        }
                        <span className="truncate font-medium">
                          {Number.isInteger(ev.amount) ? ev.amount : ev.amount.toFixed(2).replace('.', ',')}€
                        </span>
                      </div>
                    ))}
                    {evs.length > 2 && (
                      <div className="text-[9px] text-[#4b5563]">+{evs.length - 2}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay != null && (
        <div className="mt-4 pt-4 border-t border-[#1e2130]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#f3f0ea]">
              {selectedDay}. {MONTH_NAMES[month]} {year}
            </p>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-[#4b5563] hover:text-[#9ca3af] transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {selectedEvs.length === 0 ? (
            <p className="text-xs text-[#4b5563]">Keine Transaktionen</p>
          ) : (
            <>
              <div className="space-y-1.5 mb-3">
                {selectedEvs.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ev.type === 'income'
                        ? <ArrowUpRight className="size-3.5 text-[#4ade80] shrink-0" />
                        : <ArrowDownLeft className="size-3.5 text-[#f87171] shrink-0" />
                      }
                      <span className="text-xs text-[#d1d5db] truncate">{ev.label}</span>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                      ev.type === 'income' ? 'text-[#4ade80]' : 'text-[#f87171]'
                    }`}>
                      {ev.type === 'income' ? '+' : '−'}{fmtAmt(ev.amount)} €
                    </span>
                  </div>
                ))}
              </div>

              {/* Day summary */}
              <div className="flex justify-between pt-2 border-t border-[#1e2130] text-[10px]">
                {selectedIncome > 0 && (
                  <span className="text-[#4ade80] font-medium">+{fmtAmt(selectedIncome)} €</span>
                )}
                {selectedExpense > 0 && (
                  <span className="text-[#f87171] font-medium">−{fmtAmt(selectedExpense)} €</span>
                )}
                {selectedIncome > 0 && selectedExpense > 0 && (
                  <span className={`font-semibold ${
                    selectedIncome - selectedExpense >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                  }`}>
                    Netto: {selectedIncome - selectedExpense >= 0 ? '+' : '−'}
                    {fmtAmt(Math.abs(selectedIncome - selectedExpense))} €
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Hover tooltip */}
      {tip && tipEvs.length > 0 && selectedDay !== tip.day && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border border-[#1e2130] bg-[#0d0f14] p-2.5 shadow-xl text-xs"
          style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <p className="text-[#6b7280] mb-1 font-medium">
            {tip.day}. {MONTH_NAMES[month]}
          </p>
          {tipIncome > 0 && (
            <p className="text-[#4ade80]">+{fmtAmt(tipIncome)} €</p>
          )}
          {tipExpense > 0 && (
            <p className="text-[#f87171]">−{fmtAmt(tipExpense)} €</p>
          )}
          <p className="text-[#4b5563] mt-0.5">{tipEvs.length} Transaktion{tipEvs.length > 1 ? 'en' : ''}</p>
        </div>
      )}
    </div>
  )
}
