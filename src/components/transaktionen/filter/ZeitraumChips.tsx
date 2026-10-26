'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUrlFilters } from '@/components/providers/url-filters'
import { cn } from '@/lib/utils'
import { ZEITRAUM_LABEL, ZEITRAUM_PRESETS, aktivesPreset, zeitraumPreset, type ZeitraumPreset } from '@/lib/transaktionen/filter'
import { datumDe, feldKlasse } from './felder'

/** Chip der Zeitraum-Reihe: 40 px hoch am Handy, 32 px ab md. */
export const chipKlasse = (aktiv: boolean) =>
  cn(
    'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors md:h-8 md:px-3',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    aktiv
      ? 'border-primary bg-primary/10 font-medium text-primary'
      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
  )

/**
 * Datumsfeld mit Entwurf: Chrome meldet beim Tippen schon „0002-10-05“ als gültiges Datum — das darf keine
 * Server-Navigation auslösen. Übernommen wird nach einer Tippause, und nur ein leeres Feld oder ein Jahr
 * zwischen 1990 und 2100.
 */
function DatumFeld({ label, wert, onWert, min, max }: {
  label: string
  wert: string
  onWert: (wert: string | null) => void
  min?: string
  max?: string
}) {
  const [entwurf, setEntwurf] = useState(wert)
  const zuletzt = useRef(wert)
  const melden = useRef(onWert)
  useEffect(() => { melden.current = onWert })

  useEffect(() => {
    if (wert !== zuletzt.current) {
      zuletzt.current = wert
      setEntwurf(wert)
    }
  }, [wert])

  useEffect(() => {
    if (entwurf === zuletzt.current) return
    const jahr = Number(entwurf.slice(0, 4))
    if (entwurf !== '' && !(jahr >= 1990 && jahr <= 2100)) return
    const id = setTimeout(() => {
      zuletzt.current = entwurf
      melden.current(entwurf || null)
    }, 400)
    return () => clearTimeout(id)
  }, [entwurf])

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="date"
        aria-label={label}
        value={entwurf}
        min={min}
        max={max}
        onChange={e => setEntwurf(e.target.value)}
        className={cn(feldKlasse, 'w-full')}
      />
    </label>
  )
}

/**
 * Zeitraum als Chip-Reihe: die Voreinstellungen aus lib/transaktionen/filter plus „Eigener Zeitraum“.
 * Ein Klick setzt `from` und `to` in EINER Navigation; ein erneuter Klick auf das aktive Chip löscht beides.
 * Offene Zeiträume (`to` = null) bleiben „bis jetzt“, auch wenn der Link morgen geöffnet wird.
 */
export function ZeitraumChips({ heute, className }: { heute: string; className?: string }) {
  const filters = useUrlFilters()
  const from = filters.get('from') ?? undefined
  const to = filters.get('to') ?? undefined
  const aktiv = aktivesPreset(from, to, heute)
  const eigen = Boolean((from || to) && !aktiv)

  function waehle(key: ZeitraumPreset) {
    if (aktiv === key) {
      filters.setMany({ from: null, to: null })
      return
    }
    const p = zeitraumPreset(key, heute)
    filters.setMany({ from: p.from, to: p.to })
  }

  const eigenLabel = !eigen
    ? 'Eigener Zeitraum'
    : from && to
      ? `${datumDe(from)} – ${datumDe(to)}`
      : from
        ? `ab ${datumDe(from)}`
        : `bis ${datumDe(to ?? '')}`

  return (
    <div
      role="group"
      aria-label="Zeitraum"
      className={cn(
        // Handy: eine scrollbare Zeile ohne sichtbare Scrollleiste; ab md umbrechend.
        'flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible',
        className,
      )}
    >
      {ZEITRAUM_PRESETS.map(key => (
        <button
          key={key}
          type="button"
          aria-pressed={aktiv === key}
          onClick={() => waehle(key)}
          className={chipKlasse(aktiv === key)}
        >
          {ZEITRAUM_LABEL[key]}
        </button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-pressed={eigen} className={chipKlasse(eigen)}>
            <CalendarRange className="size-3.5" aria-hidden />
            {eigenLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <DatumFeld label="Von" wert={from ?? ''} onWert={v => filters.set('from', v)} max={to} />
            <DatumFeld label="Bis" wert={to ?? ''} onWert={v => filters.set('to', v)} min={from} />
          </div>
          {(from || to) && (
            <button
              type="button"
              onClick={() => filters.setMany({ from: null, to: null })}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-8"
            >
              Zeitraum entfernen
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
