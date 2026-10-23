'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, X } from 'lucide-react'
import type { CashflowEvent } from '@/lib/analyseData'
import { kurzBetrag } from '@/lib/analyse/geldfluss'
import { useClampedPosition } from '@/lib/hooks/use-clamped-position'

interface Props {
  events: CashflowEvent[]
  /** Heutiges Datum (YYYY-MM-DD) vom Server; ohne: Uhr des Geraets. */
  heute?: string
  /**
   * Setzt (`YYYY-MM-DD`) bzw. hebt auf (`null`) den Tagesfilter der Buchungsliste. Fehlt er
   * (Landingpage, kein UrlFiltersProvider), zeigt der Kalender nur Details und bietet keinen
   * „Buchungen anzeigen"-Knopf an.
   */
  onTag?: (tag: string | null) => void
  /** Aktuell gefilterter Tag — wird im Raster markiert. */
  aktiverTag?: string | null
}

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
const fmtGanz = (n: number) => Math.round(n).toLocaleString('de-DE')
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

interface PopupState { day: number; x: number; y: number }
interface TipState  { day: number; x: number; y: number }

/**
 * Unter 640 px (Tailwind `sm`): Tippen öffnet die Tagesliste UNTER dem Raster statt eines
 * schwebenden Popups. Ein `position: fixed` Popup mit 240 px Breite über einer 42-px-Zelle
 * verdeckt auf dem Handy das halbe Raster und wird vom Daumen gleich mit verdeckt.
 * Per matchMedia statt Tailwind-Klassen, weil sich hier nicht nur das Aussehen, sondern der
 * gerenderte Baum unterscheidet (Popup/Hover-Karte entfallen).
 */
function useSchmal(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(max-width: 639px)')
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  )
}

export function CashflowKalender({ events, onTag, aktiverTag, heute: heuteDatum }: Props) {
  // `heute` vom Server (deutsche Zeit): mit der Geraeteuhr rechneten Server und Browser nachts
  // mit verschiedenen Tagen (Hydration-Fehler). Ohne (Landingpage-Demo): Uhr des Geraets.
  const today = useMemo(() => {
    if (heuteDatum) return new Date(Number(heuteDatum.slice(0, 4)), Number(heuteDatum.slice(5, 7)) - 1, Number(heuteDatum.slice(8, 10)))
    return new Date()
  }, [heuteDatum])
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [tip,   setTip]   = useState<TipState | null>(null)
  const schmal = useSchmal()
  const panelRef = useRef<HTMLDivElement>(null)

  const { ref: popupRef, style: popupPos } = useClampedPosition(
    popup && !schmal ? { x: popup.x, y: popup.y } : null,
    { alignX: 'center', alignY: 'above', gapY: 8 },
  )
  const { ref: tipRef, style: tipPos } = useClampedPosition(
    tip ? { x: tip.x, y: tip.y } : null,
    { alignX: 'center', alignY: 'above', gapY: 8 },
  )

  // Auf dem Handy liegt die Tagesliste unter dem Raster — nach dem Tippen ins Bild holen,
  // sonst sieht man nicht, dass überhaupt etwas passiert ist.
  const gewaehlterTag = popup?.day
  useEffect(() => {
    if (schmal && gewaehlterTag !== undefined) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [schmal, gewaehlterTag])

  const days   = daysInMonth(year, month)
  const offset = firstDayOffset(year, month)
  const cells  = Math.ceil((days + offset) / 7) * 7

  // Group events by day
  // Nur bei Daten- oder Monatswechsel neu: der Hover setzt bei jeder Mausbewegung State und
  // rechnete sonst jedes Mal ueber die ganze Historie.
  const byDay = useMemo(() => {
    const m = new Map<number, CashflowEvent[]>()
    for (const ev of events) {
      const d = new Date(ev.date + 'T00:00:00')
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!m.has(day)) m.set(day, [])
        m.get(day)!.push(ev)
      }
    }
    return m
  }, [events, year, month])

  // Monatssummen für den Kopf: zählen nur, was auch die Tageszellen zählen (`zaehlt`).
  let monatEin = 0
  let monatAus = 0
  for (const evs of byDay.values()) {
    for (const e of evs) {
      if (!e.zaehlt) continue
      if (e.type === 'income') monatEin += e.amount
      else monatAus += e.amount
    }
  }
  const monatSaldo = monatEin - monatAus

  // Blättern nur dort, wo es Daten gibt: vom ersten Monat mit Buchungen bis zum Monat nach dem letzten bzw. heutigen.
  const monatIndex = (y: number, m: number) => y * 12 + m
  // Ohne Spread (`Math.min(...liste)` wirft ab ~125.000 Eintraegen) und nur bei Datenwechsel.
  const heuteIndex = monatIndex(today.getFullYear(), today.getMonth())
  const { ersterMonat, letzterMonat } = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const e of events) {
      const i = monatIndex(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1)
      if (i < min) min = i
      if (i > max) max = i
    }
    return {
      ersterMonat: min === Infinity ? heuteIndex : min,
      letzterMonat: Math.max(heuteIndex + 1, max),
    }
  }, [events, heuteIndex])
  const aktuell = monatIndex(year, month)
  const canPrev = aktuell > ersterMonat
  const canNext = aktuell < letzterMonat

  const prev = () => {
    if (!canPrev) return
    setPopup(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  const next = () => {
    if (!canNext) return
    setPopup(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }
  const heute = () => { setPopup(null); setYear(today.getFullYear()); setMonth(today.getMonth()) }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const popupEvs = popup ? (byDay.get(popup.day) ?? []) : []

  const tipEvs     = tip ? (byDay.get(tip.day) ?? []) : []
  const tipIncome  = tipEvs.filter(e => e.zaehlt && e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const tipExpense = tipEvs.filter(e => e.zaehlt && e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const tipAusgeblendet = tipEvs.filter(e => !e.zaehlt).length

  const pfeil = 'flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent sm:size-9'

  const detail = popup && popupEvs.length > 0 ? (
    <TagesDetail
      titel={`${popup.day}. ${MONTH_NAMES[month]} ${year}`}
      evs={popupEvs}
      onClose={() => setPopup(null)}
      tag={iso(year, month, popup.day)}
      aktiverTag={aktiverTag}
      onTag={onTag}
      gross={schmal}
    />
  ) : null

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
      {/* Header: Pfeile 44 px (Daumen), Monat in der Mitte, Monatssummen darunter */}
      <div className="mb-3 sm:mb-4">
        <div className="flex items-center justify-between">
          <button onClick={prev} disabled={!canPrev} aria-label="Vorheriger Monat" className={pfeil}>
            <ChevronLeft className="size-5 sm:size-4" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{MONTH_NAMES[month]} {year}</h2>
            {aktuell !== monatIndex(today.getFullYear(), today.getMonth()) && (
              <button onClick={heute} className="min-h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                Heute
              </button>
            )}
          </div>
          <button onClick={next} disabled={!canNext} aria-label="Nächster Monat" className={pfeil}>
            <ChevronRight className="size-5 sm:size-4" />
          </button>
        </div>
        {(monatEin > 0 || monatAus > 0) && (
          <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <span className="text-(--chart-income)">+{fmtGanz(monatEin)} €</span>
            <span className="text-(--chart-expense)">−{fmtGanz(monatAus)} €</span>
            <span className={`font-semibold ${monatSaldo >= 0 ? 'text-(--chart-income)' : 'text-(--chart-expense)'}`}>
              Saldo {monatSaldo >= 0 ? '+' : '−'}{fmtGanz(Math.abs(monatSaldo))} €
            </span>
          </p>
        )}
      </div>

      {/* Weekday labels */}
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`py-1.5 text-center text-[11px] font-medium ${
            i >= 5 ? 'text-muted-foreground/60' : 'text-muted-foreground'
          }`}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-0.75">
        {Array.from({ length: cells }, (_, i) => {
          const day     = i - offset + 1
          const valid   = day >= 1 && day <= days
          const evs     = valid ? (byDay.get(day) ?? []) : []
          const isSelected = valid && popup?.day === day
          const istFilter = valid && !!aktiverTag && aktiverTag === iso(year, month, day)
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
              aria-pressed={valid && hasEvs ? isSelected : undefined}
              aria-label={valid && hasEvs ? `${day}. ${MONTH_NAMES[month]}, ${evs.length} Transaktion${evs.length > 1 ? 'en' : ''}` : undefined}
              onClick={e => activateDay(e.currentTarget)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activateDay(e.currentTarget)
                }
              }}
              onMouseEnter={e => {
                if (schmal || !valid || !hasEvs || isSelected) return
                const r = e.currentTarget.getBoundingClientRect()
                setTip({ day, x: r.left + r.width / 2, y: r.top })
              }}
              onMouseLeave={() => setTip(null)}
              className={`min-h-12 min-w-0 rounded-md p-0.5 text-xs transition-all duration-100 sm:min-h-14.5 sm:rounded-lg sm:p-1.5 ${
                !valid ? 'invisible' :
                isSelected ? 'bg-accent ring-1 ring-(--chart-accent)/40 cursor-pointer' :
                hasEvs ? `cursor-pointer hover:bg-accent ${isWeekend ? 'bg-muted/35' : 'bg-muted/20'}` :
                isWeekend ? 'bg-muted/35' : 'bg-muted/20'
              } ${istFilter ? 'ring-2 ring-(--chart-accent)' : ''}`}
            >
              {valid && (
                <>
                  <div className={`mb-0.5 flex size-5 items-center justify-center rounded-full text-[11px] font-medium sm:mb-1 ${
                    isToday(day) ? 'bg-(--chart-accent) font-bold text-background' :
                    isSelected   ? 'text-foreground' :
                    isWeekend    ? 'text-muted-foreground/60' : 'text-muted-foreground'
                  }`}>
                    {day}
                  </div>
                  {hasEvs && (
                    <div className="space-y-px sm:space-y-0.75">
                      {inc > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="hidden size-0.75 shrink-0 rounded-full bg-(--chart-income) sm:block" />
                          <span className="truncate text-[10px] font-medium leading-tight tabular-nums text-(--chart-income)">
                            {/* Handy: 1,2k statt 1.234 — die Zelle ist nur ~42 px breit. */}
                            <span className="sm:hidden">+{kurzBetrag(inc)}</span>
                            <span className="hidden sm:inline">+{fmtGanz(inc)}€</span>
                          </span>
                        </div>
                      )}
                      {exp > 0 && (
                        <div className="flex items-center gap-0.75">
                          <div className="hidden size-0.75 shrink-0 rounded-full bg-(--chart-expense) sm:block" />
                          <span className="truncate text-[10px] font-medium leading-tight tabular-nums text-(--chart-expense)">
                            <span className="sm:hidden">−{kurzBetrag(exp)}</span>
                            <span className="hidden sm:inline">−{fmtGanz(exp)}€</span>
                          </span>
                        </div>
                      )}
                      {ausgeblendet > 0 && (
                        <div className="text-[10px] leading-tight text-muted-foreground/70">
                          <span className="sm:hidden">+{ausgeblendet}</span>
                          <span className="hidden sm:inline">+{ausgeblendet} Anlage</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Handy: Tagesliste unter dem Raster */}
      {schmal && detail && (
        <div ref={panelRef} className="mt-3 rounded-xl border border-border bg-popover">
          {detail}
        </div>
      )}

      {/* Desktop: Click popup — appears above the clicked day cell (flips below / clamps near edges) */}
      {!schmal && detail && (
        <div
          ref={popupRef}
          className="fixed z-50 w-60 rounded-xl border border-border bg-popover shadow-2xl"
          style={popupPos}
        >
          {detail}
        </div>
      )}

      {/* Hover tooltip (nur mit Maus) */}
      {!schmal && tip && tipEvs.length > 0 && popup?.day !== tip.day && (
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-40 rounded-lg border border-border bg-popover p-2.5 text-xs shadow-xl"
          style={tipPos}
        >
          <p className="mb-1 font-medium text-muted-foreground">{tip.day}. {MONTH_NAMES[month]}</p>
          {tipIncome  > 0 && <p className="text-(--chart-income) tabular-nums">+{fmtAmt(tipIncome)} €</p>}
          {tipExpense > 0 && <p className="text-(--chart-expense) tabular-nums">−{fmtAmt(tipExpense)} €</p>}
          <p className="mt-0.5 text-muted-foreground/70">{tipEvs.length} Transaktion{tipEvs.length > 1 ? 'en' : ''}</p>
          {tipAusgeblendet > 0 && <p className="text-muted-foreground/70">davon {tipAusgeblendet} Anlage/Forderung (nicht eingerechnet)</p>}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-muted-foreground/80">
        Alle Buchungen seit Beginn der Aufzeichnung. Anlage (Krypto, Depot, Bauspar) und Forderungen sind grau, solange sie oben
        nicht eingerechnet sind. Umbuchungen zwischen eigenen Konten fehlen bewusst.
      </p>
    </div>
  )
}

/**
 * Inhalt von Popup (Desktop) und Tagesliste (Handy): Kopf mit Datum, Buchungen, Tagessumme und —
 * wenn die Seite es unterstützt — der Knopf, der die Buchungsliste unten auf diesen Tag filtert.
 *
 * Der Filter wird bewusst NICHT schon beim Antippen des Tages gesetzt: jedes Setzen lädt die
 * Seite serverseitig neu und blendet die Charts ab. Wer nur durch den Kalender blättert und Tage
 * ansieht, würde bei jedem Tipp den Bildschirm flackern sehen.
 */
function TagesDetail({ titel, evs, onClose, tag, aktiverTag, onTag, gross }: {
  titel: string
  evs: CashflowEvent[]
  onClose: () => void
  tag: string
  aktiverTag?: string | null
  onTag?: (tag: string | null) => void
  gross: boolean
}) {
  const income  = evs.filter(e => e.zaehlt && e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const expense = evs.filter(e => e.zaehlt && e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const aktiv = aktiverTag === tag

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-3.5 pb-2.5 pt-3">
        <p className="text-xs font-semibold text-popover-foreground">{titel}</p>
        <button
          onClick={onClose}
          aria-label="Schließen"
          className="-my-2 -mr-2.5 ml-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className={`space-y-2 overflow-y-auto px-3.5 py-2.5 ${gross ? 'max-h-72' : 'max-h-52'}`}>
        {evs.map((ev, i) => (
          <div key={`${ev.date}_${ev.type}_${ev.label}_${ev.amount}_${i}`} className={`flex items-center justify-between gap-2 ${ev.zaehlt ? '' : 'opacity-55'}`}>
            <div className="flex min-w-0 items-center gap-2">
              {ev.type === 'income'
                ? <ArrowUpRight className="size-3.5 shrink-0 text-(--chart-income)" />
                : <ArrowDownLeft className="size-3.5 shrink-0 text-(--chart-expense)" />
              }
              <span className="truncate text-xs text-popover-foreground">{ev.label}</span>
              {!ev.zaehlt && (
                <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                  {ev.kind === 'forderung' ? 'Forderung' : 'Anlage'}
                </span>
              )}
            </div>
            <span className={`shrink-0 text-xs font-semibold tabular-nums ${
              ev.type === 'income' ? 'text-(--chart-income)' : 'text-(--chart-expense)'
            }`}>
              {ev.type === 'income' ? '+' : '−'}{fmtAmt(ev.amount)} €
            </span>
          </div>
        ))}
      </div>

      {(income > 0 || expense > 0) && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 pb-3 pt-2">
          {income > 0 && (
            <span className="text-[11px] font-semibold tabular-nums text-(--chart-income)">+{fmtAmt(income)} €</span>
          )}
          {expense > 0 && (
            <span className="text-[11px] font-semibold tabular-nums text-(--chart-expense)">−{fmtAmt(expense)} €</span>
          )}
          {income > 0 && expense > 0 && (
            <span className={`ml-auto text-[11px] font-bold tabular-nums ${
              income - expense >= 0 ? 'text-(--chart-income)' : 'text-(--chart-expense)'
            }`}>
              Netto: {income - expense >= 0 ? '+' : '−'}{fmtAmt(Math.abs(income - expense))} €
            </span>
          )}
        </div>
      )}

      {onTag && (
        <div className="border-t border-border p-2.5">
          <button
            onClick={() => onTag(aktiv ? null : tag)}
            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border text-xs font-medium text-popover-foreground transition-colors hover:bg-accent sm:min-h-9"
          >
            {aktiv ? 'Filter aufheben' : 'Buchungen dieses Tages anzeigen'}
          </button>
        </div>
      )}
    </>
  )
}
