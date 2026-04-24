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

interface PopupState { day: number; x: number; y: number }
interface TipState  { day: number; x: number; y: number }

export function CashflowKalender({ events }: Props) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [tip,   setTip]   = useState<TipState | null>(null)

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
    setPopup(null)
    month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1)
  }
  const next = () => {
    setPopup(null)
    month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1)
  }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const popupEvs    = popup ? (byDay.get(popup.day) ?? []) : []
  const popupIncome  = popupEvs.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const popupExpense = popupEvs.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

  const tipEvs     = tip ? (byDay.get(tip.day) ?? []) : []
  const tipIncome  = tipEvs.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const tipExpense = tipEvs.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-[#1e2130] text-[#6b7280] hover:text-[#f3f0ea] transition-colors">
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-sm font-semibold text-[#f3f0ea]">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={next} className="p-1.5 rounded-lg hover:bg-[#1e2130] text-[#6b7280] hover:text-[#f3f0ea] transition-colors">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1.5 ${
            i >= 5 ? 'text-[#374151]' : 'text-[#4b5563]'
          }`}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.75">
        {Array.from({ length: cells }, (_, i) => {
          const day     = i - offset + 1
          const valid   = day >= 1 && day <= days
          const evs     = valid ? (byDay.get(day) ?? []) : []
          const isSelected = valid && popup?.day === day
          const hasEvs  = evs.length > 0
          const isWeekend = i % 7 >= 5
          const inc = evs.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
          const exp = evs.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

          return (
            <div
              key={i}
              onClick={e => {
                if (!valid || !hasEvs) return
                const r = e.currentTarget.getBoundingClientRect()
                if (isSelected) {
                  setPopup(null)
                } else {
                  setTip(null)
                  setPopup({ day, x: r.left + r.width / 2, y: r.top })
                }
              }}
              onMouseEnter={e => {
                if (!valid || !hasEvs || isSelected) return
                const r = e.currentTarget.getBoundingClientRect()
                setTip({ day, x: r.left + r.width / 2, y: r.top })
              }}
              onMouseLeave={() => setTip(null)}
              className={`rounded-lg text-xs transition-all duration-100 ${
                !valid ? 'invisible' :
                isSelected ? 'bg-[#1e2130] ring-1 ring-[#f0d98c]/40 cursor-pointer' :
                hasEvs ? `cursor-pointer ${isWeekend ? 'bg-[#0c0e16] hover:bg-[#1a1d29]' : 'bg-[#0d0f14] hover:bg-[#1a1d29]'}` :
                isWeekend ? 'bg-[#0c0e16]' : 'bg-[#0d0f14]'
              }`}
              style={{ minHeight: '58px', padding: '6px' }}
            >
              {valid && (
                <>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-medium mb-1 ${
                    isToday(day) ? 'bg-[#f0d98c] text-[#0d0f14] font-bold' :
                    isSelected   ? 'text-[#f3f0ea]' :
                    isWeekend    ? 'text-[#374151]' : 'text-[#6b7280]'
                  }`}>
                    {day}
                  </div>
                  {hasEvs && (
                    <div className="space-y-0.75">
                      {inc > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="w-0.75 h-0.75 rounded-full bg-[#4ade80] shrink-0" />
                          <span className="text-[9px] text-[#4ade80] font-medium truncate leading-tight">
                            +{inc % 1 === 0 ? inc : inc.toFixed(0)}€
                          </span>
                        </div>
                      )}
                      {exp > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="w-0.75 h-0.75 rounded-full bg-[#f87171] shrink-0" />
                          <span className="text-[9px] text-[#f87171] font-medium truncate leading-tight">
                            −{exp % 1 === 0 ? exp : exp.toFixed(0)}€
                          </span>
                        </div>
                      )}
                      {evs.length > 2 && (
                        <div className="text-[9px] text-[#374151] leading-tight">+{evs.length - 2}</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Click popup — appears above the clicked day cell */}
      {popup && popupEvs.length > 0 && (
        <div
          className="fixed z-50 rounded-xl border border-[#2a2d3e] bg-[#0d0f14] shadow-2xl w-60"
          style={{
            left: Math.max(8, Math.min(popup.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 248)),
            top: popup.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-[#1e2130]">
            <p className="text-xs font-semibold text-[#f3f0ea]">
              {popup.day}. {MONTH_NAMES[month]} {year}
            </p>
            <button
              onClick={() => setPopup(null)}
              className="text-[#4b5563] hover:text-[#9ca3af] transition-colors ml-2 shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Events list */}
          <div className="px-3.5 py-2.5 space-y-2 max-h-52 overflow-y-auto">
            {popupEvs.map((ev, i) => (
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
          {(popupIncome > 0 || popupExpense > 0) && (
            <div className="px-3.5 pt-2 pb-3 border-t border-[#1e2130] flex items-center justify-between gap-2">
              {popupIncome > 0 && (
                <span className="text-[10px] text-[#4ade80] font-semibold">+{fmtAmt(popupIncome)} €</span>
              )}
              {popupExpense > 0 && (
                <span className="text-[10px] text-[#f87171] font-semibold">−{fmtAmt(popupExpense)} €</span>
              )}
              {popupIncome > 0 && popupExpense > 0 && (
                <span className={`text-[10px] font-bold ml-auto ${
                  popupIncome - popupExpense >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                }`}>
                  Netto: {popupIncome - popupExpense >= 0 ? '+' : '−'}{fmtAmt(Math.abs(popupIncome - popupExpense))} €
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hover tooltip */}
      {tip && tipEvs.length > 0 && popup?.day !== tip.day && (
        <div
          className="fixed z-40 pointer-events-none rounded-lg border border-[#1e2130] bg-[#0d0f14] p-2.5 shadow-xl text-xs"
          style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <p className="text-[#6b7280] mb-1 font-medium">{tip.day}. {MONTH_NAMES[month]}</p>
          {tipIncome  > 0 && <p className="text-[#4ade80]">+{fmtAmt(tipIncome)} €</p>}
          {tipExpense > 0 && <p className="text-[#f87171]">−{fmtAmt(tipExpense)} €</p>}
          <p className="text-[#4b5563] mt-0.5">{tipEvs.length} Transaktion{tipEvs.length > 1 ? 'en' : ''}</p>
        </div>
      )}
    </div>
  )
}
