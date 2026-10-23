'use client'

import { useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import { useUrlFilters } from '@/components/providers/url-filters'
import { parteiSchluessel } from '@/lib/bank/auswertung'
import type { ParteiAuswertung, ParteiZeile, Richtung } from '@/lib/analyse/gegenparteien'

/**
 * Anzeige der Top-Gegenparteien (Rechnung in AnalyseGegenparteien.tsx). Ein Klick auf eine Zeile
 * setzt den URL-Filter `partei` — die Buchungsliste am Seitenende zeigt dann nur diese Partei —
 * und scrollt dorthin. Ein zweiter Klick auf dieselbe Zeile hebt den Filter auf.
 *
 * Die aktive Partei kommt aus `useUrlFilters().get`, nicht aus `daten.filter`: so ist die Zeile
 * sofort markiert, noch bevor der Server geantwortet hat.
 */

export type RichtungsDaten = ParteiAuswertung & { monate: string[] }

function MiniVerlauf({
  zeile, monate, farbe, euro,
}: { zeile: ParteiZeile; monate: string[]; farbe: string; euro: (n: number) => string }) {
  const max = Math.max(...monate.map(m => zeile.monate[m] ?? 0), 1)
  return (
    <span className="hidden h-6 items-end gap-px sm:flex" aria-hidden>
      {monate.map(m => {
        const v = zeile.monate[m] ?? 0
        return (
          <span
            key={m}
            title={`${m}: ${euro(v)}`}
            className="w-1 rounded-sm"
            // Mindesthoehe, damit ein Monat MIT Buchung sichtbar bleibt; ohne Buchung nur ein Strich.
            style={{
              height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : '2px',
              background: v > 0 ? farbe : 'var(--muted-foreground)',
              opacity: v > 0 ? 0.6 : 0.35,
            }}
          />
        )
      })}
    </span>
  )
}

/** Scrollt zur Buchungsliste; bei „weniger Bewegung" ohne Animation. */
function zuBuchungen() {
  const ziel = document.getElementById('buchungen')
  if (!ziel) return
  const reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ziel.scrollIntoView({ behavior: reduziert ? 'auto' : 'smooth', block: 'start' })
}

export function AnalyseGegenparteienListe({
  locale, topN, richtungen,
}: { locale: string; topN: number; richtungen: Record<Richtung, RichtungsDaten> }) {
  const filters = useUrlFilters()
  const [richtung, setRichtung] = useState<Richtung>('ausgaben')
  const euro = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })
  const euro2 = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const auswertung = richtungen[richtung]
  const aktiv = filters.get('partei')
  const aktivKey = aktiv ? parteiSchluessel(aktiv) : null
  const max = auswertung.zeilen[0]?.summe ?? 0
  const farbe = richtung === 'ausgaben' ? 'var(--danger)' : 'var(--success)'

  const waehle = (z: ParteiZeile) => {
    const abwaehlen = aktivKey === z.schluessel
    filters.set('partei', abwaehlen ? null : z.name)
    if (!abwaehlen) zuBuchungen()
  }

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Top-Gegenparteien
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {auswertung.gesamtAnzahl > 0
              ? `${euro(auswertung.gesamt)} in ${auswertung.gesamtAnzahl} Buchungen · Klick filtert die Buchungsliste`
              : 'Keine Buchungen im Zeitraum'}
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Richtung">
          {([['ausgaben', 'Ausgaben'], ['einnahmen', 'Einnahmen']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRichtung(k)}
              aria-pressed={richtung === k}
              className={`h-10 rounded px-3 text-xs transition-colors sm:h-7 sm:px-2 ${
                richtung === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {auswertung.zeilen.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {auswertung.zeilen.map(z => {
            const istAktiv = aktivKey === z.schluessel
            return (
              <li key={z.schluessel}>
                <button
                  type="button"
                  onClick={() => waehle(z)}
                  aria-pressed={istAktiv}
                  title={`${z.anzahl} Buchungen · Ø ${euro2(z.schnitt)}`}
                  className={`group grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                    istAktiv ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50'
                  } ${aktivKey && !istAktiv ? 'opacity-60' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${istAktiv ? 'font-semibold' : ''}`}>{z.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(z.anteil * 100)} %
                      </span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${max > 0 ? (z.summe / max) * 100 : 0}%`, background: farbe, opacity: 0.75 }}
                      />
                    </span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                      {z.anzahl}× · Ø {euro2(z.schnitt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <MiniVerlauf zeile={z} monate={auswertung.monate} farbe={farbe} euro={euro} />
                    <span className="w-20 text-right text-sm font-medium tabular-nums">{euro(z.summe)}</span>
                  </span>
                </button>
              </li>
            )
          })}
          {auswertung.weitere && (
            <li className="flex items-baseline justify-between gap-2 px-2 pt-1.5 text-xs text-muted-foreground">
              <span>
                Weitere ({auswertung.weitere.anzahlParteien} Gegenparteien, {auswertung.weitere.anzahl}×)
                {' '}· {Math.round(auswertung.weitere.anteil * 100)} %
              </span>
              <span className="tabular-nums">{euro(auswertung.weitere.summe)}</span>
            </li>
          )}
        </ul>
      )}
      {aktiv && auswertung.zeilen.length > 0 && !auswertung.zeilen.some(z => z.schluessel === aktivKey) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Gewählte Gegenpartei „{aktiv}“ steht nicht unter den Top {topN} dieser Richtung.
        </p>
      )}
    </div>
  )
}
