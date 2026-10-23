'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ZStufe, Zustandszeile } from '@/lib/dashboard/zustand'

/**
 * Darstellung der Zustandszeile. Eine einzeilige Leiste (mind. 40 px), darin ein Chip je Bereich.
 * Gesund ist sie ruhig: Rahmen und Schrift gedimmt, nur kleine gruene Haekchen. Gelb/rot faerbt
 * den Rahmen der Zeile und den betroffenen Chip.
 *
 * Jeder Chip ist ein Popover-Ausloeser (Tippen oder Klick): die Befunde stehen UEBER dem Inhalt
 * (Radix rendert per Portal, schneidet also kein Elternteil ab und schiebt nichts im Seitenfluss),
 * dazu ein Link „Öffnen" zur passenden Seite. Der Chip selbst navigiert nicht, damit ein Tippen auf
 * dem Handy nicht ungewollt die Seite wechselt.
 */

const ICON: Record<ZStufe, typeof Info> = { ok: CheckCircle2, info: Info, warn: AlertTriangle, fehler: XCircle }
const ICON_FARBE: Record<ZStufe, string> = {
  ok: 'text-emerald-500/80',
  info: 'text-muted-foreground',
  warn: 'text-amber-500',
  fehler: 'text-red-500',
}
const TEXT_FARBE: Record<ZStufe, string> = {
  ok: 'text-muted-foreground',
  info: 'text-muted-foreground',
  warn: 'text-amber-700 dark:text-amber-300',
  fehler: 'text-red-700 dark:text-red-300',
}

const OEFFNEN: Record<string, string> = {
  bank: 'Bankdaten öffnen',
  steuer: 'Steuer öffnen',
  daten: 'Buchungen ohne Kategorie',
}

export function DashZustandZeile({ zeile }: { zeile: Zustandszeile }) {
  if (zeile.chips.length === 0) return null
  const { stufe } = zeile

  return (
    <section
      aria-label="Zustand"
      className={cn(
        'flex min-h-10 min-w-0 items-center gap-1 rounded-lg border px-1.5 text-xs sm:text-[13px]',
        (stufe === 'ok' || stufe === 'info') && 'border-border bg-card',
        stufe === 'warn' && 'border-amber-500/40 bg-amber-500/5',
        stufe === 'fehler' && 'border-red-500/40 bg-red-500/5',
      )}
    >
      {zeile.chips.map((chip, i) => {
        const Icon = ICON[chip.stufe]
        return (
          <div key={chip.id} className={cn('flex min-w-0 items-center', i > 0 && 'border-l border-border/50 pl-1')}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={chip.label}
                  className={cn(
                    // 40 px hoch (Tap-Ziel), Text gekuerzt; Hover nur als leichte Flaeche.
                    'flex min-h-10 min-w-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring',
                    TEXT_FARBE[chip.stufe],
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', ICON_FARBE[chip.stufe])} />
                  <span className={cn('min-w-0 truncate', chip.stufe !== 'ok' && chip.stufe !== 'info' && 'font-medium')}>{chip.label}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] space-y-2 text-xs">
                <ul className="space-y-2">
                  {chip.zeilen.map((z, j) => {
                    const ZIcon = ICON[z.stufe]
                    return (
                      <li key={j} className="flex min-w-0 gap-2">
                        <ZIcon className={cn('mt-0.5 size-3.5 shrink-0', ICON_FARBE[z.stufe])} />
                        <span className="min-w-0">
                          <span className="font-medium">{z.titel}</span>
                          {z.detail && <span className="block text-muted-foreground">{z.detail}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <Link
                  href={chip.href}
                  className="flex min-h-10 items-center text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  {OEFFNEN[chip.id]} →
                </Link>
              </PopoverContent>
            </Popover>
          </div>
        )
      })}
    </section>
  )
}
