'use client'

import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronDown } from 'lucide-react'
import { fmtCurrency } from '@/lib/format'
import {
  imFenster, kurzDatumTermin, relativDatum, summeFaellig, TERMINE_FENSTER, TERMINE_MAX_SICHTBAR,
  TERMINE_STANDARD_TAGE, type TerminZeile,
} from '@/lib/dashboard/termine'

/**
 * Die Liste von „Als Nächstes". Zeilen sind höchstens 44 px hoch (Tap-Ziel und trotzdem dicht),
 * acht sind sichtbar, der Rest klappt unter „Weitere (n)" im Rahmen der Karte auf. Die Karte
 * hat eine feste Höhe und scrollt innen: die Seite wächst nie mit der Terminzahl.
 *
 * Nur Kalendertage aus dem Server (`tage`, `datum`): kein `new Date()` im Client, damit
 * Server- und Browser-Render übereinstimmen.
 */
export function DashTermineListe({ zeilen, locale, dateFormat, ohnePrognose }: {
  zeilen: TerminZeile[]; locale: string; dateFormat: string; ohnePrognose: boolean
}) {
  const [fenster, setFenster] = useState<number>(TERMINE_STANDARD_TAGE)
  const [alle, setAlle] = useState(false)
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const sichtbareZeilen = imFenster(zeilen, fenster)
  const summe = summeFaellig(sichtbareZeilen)
  const oben = sichtbareZeilen.slice(0, TERMINE_MAX_SICHTBAR)
  const rest = sichtbareZeilen.slice(TERMINE_MAX_SICHTBAR)
  const gezeigt = alle ? sichtbareZeilen : oben
  const ueberfaellig = sichtbareZeilen.filter(z => z.ueberfaellig).length

  return (
    <div className="flex h-full min-h-[320px] max-h-[480px] flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Als Nächstes</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
            {summe.ausgaben > 0 ? (
              <span className="font-semibold tabular-nums text-danger">−{euro(summe.ausgaben)} fällig</span>
            ) : (
              <span className="text-muted-foreground">Keine Zahlung fällig</span>
            )}
            {summe.einnahmen > 0 && (
              <span className="text-xs font-medium tabular-nums text-success">+{euro(summe.einnahmen)} erwartet</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Zeitraum">
          {TERMINE_FENSTER.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setFenster(t); setAlle(false) }}
              aria-pressed={fenster === t}
              className={`h-10 min-w-10 rounded px-2 text-xs transition-colors sm:h-7 ${
                fenster === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t} T.
            </button>
          ))}
        </div>
      </div>

      {sichtbareZeilen.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <CalendarClock className="size-6 text-muted-foreground/60" aria-hidden />
          <p className="mt-2 text-sm font-medium">Nichts Fälliges in den nächsten {fenster} Tagen</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Keine Abbuchungen, keine ablaufenden Kündigungsfristen.</p>
        </div>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto overscroll-contain">
          {gezeigt.map(z => <Zeile key={z.id} z={z} euro={euro} dateFormat={dateFormat} />)}
          {rest.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setAlle(a => !a)}
                aria-expanded={alle}
                className="flex min-h-10 w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {alle ? 'Weniger anzeigen' : `Weitere (${rest.length})`}
                <ChevronDown className={`size-3.5 transition-transform ${alle ? 'rotate-180' : ''}`} aria-hidden />
              </button>
            </li>
          )}
        </ul>
      )}

      {(ueberfaellig > 0 || ohnePrognose) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {ohnePrognose && 'Prognose nicht verfügbar: Zahlungstermine fehlen. '}
          {ueberfaellig > 0 && `${ueberfaellig} Kündigungsfrist${ueberfaellig === 1 ? '' : 'en'} bereits verstrichen.`}
        </p>
      )}
    </div>
  )
}

function Zeile({ z, euro, dateFormat }: { z: TerminZeile; euro: (n: number) => string; dateFormat: string }) {
  const frist = z.art === 'kuendigung'
  const einnahme = (z.betrag ?? 0) > 0
  const Icon = frist ? CalendarClock : einnahme ? ArrowDownLeft : ArrowUpRight
  const iconFarbe = frist ? (z.ueberfaellig ? 'text-danger' : 'text-warning') : einnahme ? 'text-success' : 'text-danger'

  return (
    <li className="flex h-11 items-center gap-2.5">
      <span className="w-[4.75rem] shrink-0 leading-tight">
        <span className={`block text-xs font-medium ${z.ueberfaellig ? 'text-danger' : ''}`}>{relativDatum(z.tage)}</span>
        <span className="block text-[10px] text-muted-foreground tabular-nums">{kurzDatumTermin(z.datum, dateFormat)}</span>
      </span>
      <Icon className={`size-3.5 shrink-0 ${iconFarbe}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm" title={z.name}>{z.name}</span>
      {z.betrag !== null ? (
        <span className={`shrink-0 text-sm font-medium tabular-nums ${einnahme ? 'text-success' : 'text-danger'}`}>
          {einnahme ? '+' : '−'}{euro(Math.abs(z.betrag))}
        </span>
      ) : (
        <span className={`shrink-0 text-xs ${z.ueberfaellig ? 'font-medium text-danger' : 'text-warning'}`}>
          {z.ueberfaellig ? 'Frist verstrichen' : 'Kündigungsfrist'}
        </span>
      )}
    </li>
  )
}
