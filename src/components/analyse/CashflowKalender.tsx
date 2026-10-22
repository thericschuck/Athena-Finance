'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import type { CashflowEvent } from '@/lib/analyseData'
import { useClampedPosition } from '@/lib/hooks/use-clamped-position'

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

  const { ref: popupRef, style: popupPos } = useClampedPosition(
    popup ? { x: popup.x, y: popup.y } : null,
    { alignX: 'center', alignY: 'above', gapY: 8 },
  )
  const { ref: tipRef, style: tipPos } = useClampedPosition(
    tip ? { x: tip.x, y: tip.y } : null,
    { alignX: 'center', alignY: 'above', gapY: 8 },
  )

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

  // Blättern nur dort, wo es Daten gibt: vom ersten Monat mit Buchungen bis zum Monat nach dem letzten bzw. heutigen.
  const monatIndex = (y: number, m: number) => y * 12 + m
  const dataMonths = events.map(e => monatIndex(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1))
  const ersterMonat = dataMonths.length > 0 ? Math.min(...dataMonths) : monatIndex(today.getFullYear(), today.getMonth())
  const letzterMonat = Math.max(monatIndex(today.getFullYear(), today.getMonth() + 1), ...dataMonths)
  const aktuell = monatIndex(year, month)
  const canPrev = aktuell > ersterMonat
  const canNext = aktuell < letzterMonat

  const prev = () => {
    if (!canPrev) return
    setPopup(null)
    month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1)
  }
  const next = () => {
    if (!canNext) return
    setPopup(null)
    month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1)
  }
  const heute = () => { setPopup(null); setYear(today.getFullYear()); setMonth(today.getMonth()) }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const popupEvs    = popup ? (byDay.get(popup.day) ?? []) : []
  const popupIncome  = popupEvs.filter(e => e.zaehlt && e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const popupExpense = popupEvs.filter(e => e.zaehlt && e.type === 'expense').reduce((s, e) => s + e.amount, 0)

  const tipEvs     = tip ? (byDay.get(tip.day) ?? []) : []
  const tipIncome  = tipEvs.filter(e => e.zaehlt && e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const tipExpense = tipEvs.filter(e => e.zaehlt && e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const tipAusgeblendet = tipEvs.filter(e => !e.zaehlt).length

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={prev} disabled={!canPrev} aria-label="Vorheriger Monat" className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{MONTH_NAMES[month]} {year}</h2>
          {aktuell !== monatIndex(today.getFullYear(), today.getMonth()) && (
            <button onClick={heute} className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              Heute
            </button>
          )}
        </div>
        <button onClick={next} disabled={!canNext} aria-label="Nächster Monat" className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1.5 ${
            i >= 5 ? 'text-muted-foreground/50' : 'text-muted-foreground'
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
          const inc = evs.filter(e => e.zaehlt && e.type === 'income').reduce((s, e) => s + e.amount, 0)
          const exp = evs.filter(e => e.zaehlt && e.type === 'expense').reduce((s, e) => s + e.amount, 0)
          const ausgeblendet = evs.filter(e => !e.zaehlt).length

          const activateDay = (target: HTMLDivElement) => {
            if (!valid || !hasEvs) return
            const r = target.getBoundingClientRect()
            if (isSelected) {
              setPopup(null)
            } else {
              setTip(null)
              setPopup({ day, x: r.left + r.width / 2, y: r.top })
            }
          }

          return (
            <div
              key={i}
              role={valid && hasEvs ? 'button' : undefined}
              tabIndex={valid && hasEvs ? 0 : undefined}
              aria-label={valid && hasEvs ? `${day}. ${MONTH_NAMES[month]}, ${evs.length} Transaktion${evs.length > 1 ? 'en' : ''}` : undefined}
              onClick={e => activateDay(e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activateDay(e.currentTarget)
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
                isSelected ? 'bg-accent ring-1 ring-(--chart-accent)/40 cursor-pointer' :
                hasEvs ? `cursor-pointer hover:bg-accent ${isWeekend ? 'bg-muted/35' : 'bg-muted/20'}` :
                isWeekend ? 'bg-muted/35' : 'bg-muted/20'
              }`}
              style={{ minHeight: '58px', padding: '6px' }}
            >
              {valid && (
                <>
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-medium mb-1 ${
                    isToday(day) ? 'bg-(--chart-accent) text-background font-bold' :
                    isSelected   ? 'text-foreground' :
                    isWeekend    ? 'text-muted-foreground/50' : 'text-muted-foreground'
                  }`}>
                    {day}
                  </div>
                  {hasEvs && (
                    <div className="space-y-0.75">
                      {inc > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="w-0.75 h-0.75 rounded-full bg-(--chart-income) shrink-0" />
                          <span className="text-[9px] text-(--chart-income) font-medium truncate leading-tight tabular-nums">
                            +{inc % 1 === 0 ? inc : inc.toFixed(0)}€
                          </span>
                        </div>
                      )}
                      {exp > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="w-0.75 h-0.75 rounded-full bg-(--chart-expense) shrink-0" />
                          <span className="text-[9px] text-(--chart-expense) font-medium truncate leading-tight tabular-nums">
                            −{exp % 1 === 0 ? exp : exp.toFixed(0)}€
                          </span>
                        </div>
                      )}
                      {ausgeblendet > 0 && (
                        <div className="text-[9px] text-muted-foreground/60 leading-tight">+{ausgeblendet} Anlage</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Click popup — appears above the clicked day cell (flips below / clamps near edges) */}
      {popup && popupEvs.length > 0 && (
        <div
          ref={popupRef}
          className="fixed z-50 rounded-xl border border-border bg-popover shadow-2xl w-60"
          style={popupPos}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-border">
            <p className="text-xs font-semibold text-popover-foreground">
              {popup.day}. {MONTH_NAMES[month]} {year}
            </p>
            <button
              onClick={() => setPopup(null)}
              aria-label="Schließen"
              className="text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Events list */}
          <div className="px-3.5 py-2.5 space-y-2 max-h-52 overflow-y-auto">
            {popupEvs.map((ev, i) => (
              <div key={`${ev.date}_${ev.type}_${ev.label}_${ev.amount}_${i}`} className={`flex items-center justify-between gap-2 ${ev.zaehlt ? '' : 'opacity-55'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {ev.type === 'income'
                    ? <ArrowUpRight className="size-3.5 text-(--chart-income) shrink-0" />
                    : <ArrowDownLeft className="size-3.5 text-(--chart-expense) shrink-0" />
                  }
                  <span className="text-xs text-popover-foreground truncate">{ev.label}</span>
                  {!ev.zaehlt && (
                    <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                      {ev.kind === 'forderung' ? 'Forderung' : 'Anlage'}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                  ev.type === 'income' ? 'text-(--chart-income)' : 'text-(--chart-expense)'
                }`}>
                  {ev.type === 'income' ? '+' : '−'}{fmtAmt(ev.amount)} €
                </span>
              </div>
            ))}
          </div>

          {/* Day summary */}
          {(popupIncome > 0 || popupExpense > 0) && (
            <div className="px-3.5 pt-2 pb-3 border-t border-border flex items-center justify-between gap-2">
              {popupIncome > 0 && (
                <span className="text-[10px] text-(--chart-income) font-semibold tabular-nums">+{fmtAmt(popupIncome)} €</span>
              )}
              {popupExpense > 0 && (
                <span className="text-[10px] text-(--chart-expense) font-semibold tabular-nums">−{fmtAmt(popupExpense)} €</span>
              )}
              {popupIncome > 0 && popupExpense > 0 && (
                <span className={`text-[10px] font-bold ml-auto tabular-nums ${
                  popupIncome - popupExpense >= 0 ? 'text-(--chart-income)' : 'text-(--chart-expense)'
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
          ref={tipRef}
          className="fixed z-40 pointer-events-none rounded-lg border border-border bg-popover p-2.5 shadow-xl text-xs"
          style={tipPos}
        >
          <p className="text-muted-foreground mb-1 font-medium">{tip.day}. {MONTH_NAMES[month]}</p>
          {tipIncome  > 0 && <p className="text-(--chart-income) tabular-nums">+{fmtAmt(tipIncome)} €</p>}
          {tipExpense > 0 && <p className="text-(--chart-expense) tabular-nums">−{fmtAmt(tipExpense)} €</p>}
          <p className="text-muted-foreground/70 mt-0.5">{tipEvs.length} Transaktion{tipEvs.length > 1 ? 'en' : ''}</p>
          {tipAusgeblendet > 0 && <p className="text-muted-foreground/60">davon {tipAusgeblendet} Anlage/Forderung (nicht eingerechnet)</p>}
        </div>
      )}

      <p className="mt-4 text-[10px] leading-snug text-muted-foreground/70">
        Alle Buchungen seit Beginn der Aufzeichnung. Anlage (Krypto, Depot, Bauspar) und Forderungen sind grau, solange sie oben
        nicht eingerechnet sind. Umbuchungen zwischen eigenen Konten fehlen bewusst.
      </p>
    </div>
  )
}
