'use client'

import { useMemo, useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import { useUrlFilters } from '@/components/providers/url-filters'
import { gegenparteien, parteiSchluessel, type ParteiZeile, type Richtung } from '@/lib/bank/auswertung'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Top-Gegenparteien nach Summe, Ausgaben und Einnahmen getrennt umschaltbar.
 *
 * Gerechnet wird auf `scope.buchungen` (Zeitraum, Konto, Monat) ohne Umbuchungen. Der Filter
 * `partei` und die Kategorie schraenken die Liste hier bewusst NICHT ein: sonst bliebe nach dem
 * Klick nur die gewaehlte Partei uebrig und man koennte nicht mehr zu einer anderen wechseln.
 * Ein Klick setzt `partei` in der URL (Buchungsliste filtert), erneuter Klick hebt auf.
 *
 * Hinweis: die Summen kommen aus den Rohbuchungen und kennen kein Anlage/Forderung-Merkmal —
 * sie koennen daher von Einnahmen/Ausgaben in den Kennzahlen abweichen, die aus den Flows kommen.
 */

const TOP_N = 10
const MAX_MONATE = 12

function MiniVerlauf({ zeile, monate, euro }: { zeile: ParteiZeile; monate: string[]; euro: (n: number) => string }) {
  const max = Math.max(...monate.map(m => zeile.monate[m] ?? 0), 1)
  return (
    <span className="hidden h-5 items-end gap-px sm:flex" aria-hidden>
      {monate.map(m => {
        const v = zeile.monate[m] ?? 0
        return (
          <span
            key={m}
            title={`${m}: ${euro(v)}`}
            className="w-1 rounded-sm bg-muted-foreground/40"
            // Mindesthoehe, damit ein Monat MIT Buchung sichtbar bleibt; ohne Buchung nur ein Strich.
            style={{ height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : '2px', opacity: v > 0 ? 1 : 0.4 }}
          />
        )
      })}
    </span>
  )
}

export function BankGegenparteien({ daten, scope }: BankAbschnittProps) {
  const filters = useUrlFilters()
  const [richtung, setRichtung] = useState<Richtung>('ausgaben')
  const euro = (n: number) => fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: 0 })
  const euro2 = (n: number) => fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: 2 })

  const auswertung = useMemo(
    () => gegenparteien(scope.buchungen, daten.eigeneIbans, richtung, TOP_N),
    [scope.buchungen, daten.eigeneIbans, richtung],
  )

  // Monatsachse fuer die Mini-Verlaeufe: die letzten Monate, in denen irgendeine der gezeigten
  // Parteien Buchungen hat — nicht der ganze Zeitraum, sonst werden die Balken unlesbar schmal.
  const monate = useMemo(() => {
    const set = new Set<string>()
    for (const z of auswertung.zeilen) for (const m of Object.keys(z.monate)) set.add(m)
    return [...set].sort().slice(-MAX_MONATE)
  }, [auswertung.zeilen])

  const aktiv = filters.get('partei')
  const aktivKey = aktiv ? parteiSchluessel(aktiv) : null
  const max = auswertung.zeilen[0]?.summe ?? 0
  const farbe = richtung === 'ausgaben' ? 'var(--danger)' : 'var(--success)'

  const waehle = (z: ParteiZeile) => filters.set('partei', aktivKey === z.schluessel ? null : z.name)

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
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
              className={`rounded px-2 py-1 text-xs transition-colors ${
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
                  className={`group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors ${
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
                    <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
                      {z.anzahl}× · Ø {euro2(z.schnitt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <MiniVerlauf zeile={z} monate={monate} euro={euro} />
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
      <p className="mt-3 text-[11px] text-muted-foreground/80">
        Alle Bankbuchungen ohne Umbuchungen zwischen eigenen Konten — Anlagen (z. B. Kraken) und
        Forderungen zählen hier mit und können von den Kennzahlen oben abweichen.
      </p>
      {aktiv && !auswertung.zeilen.some(z => z.schluessel === aktivKey) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Gewählte Gegenpartei „{aktiv}“ steht nicht unter den Top {TOP_N} dieser Richtung.
        </p>
      )}
    </div>
  )
}
