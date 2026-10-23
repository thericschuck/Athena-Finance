'use client'

import { useMemo, useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import { berechneMuster, MUSTER_MIN_BUCHUNGEN, WOCHENTAGE } from '@/lib/bank/auswertung'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Wann geben wir Geld aus: nach Wochentag und nach Tag im Monat.
 *
 * Bewusst als einfache Balken aus Elementen statt Recharts: zwei winzige Charts ohne
 * Achsen brauchen keine Bibliothek, und die Seite laedt so kein weiteres Chunk. Hinweise
 * erscheinen nur ab MUSTER_MIN_BUCHUNGEN Ausgabenbuchungen; darunter sagt die Verteilung
 * mehr ueber den Zufall als ueber das Verhalten aus. Gerechnet wird auf `scope.buchungen`
 * ohne Umbuchungen, nach Buchungsdatum (value_date).
 */

type Mass = 'betrag' | 'anzahl'

function Balken({ werte, labels, titel, mass, euro, kurz }: {
  werte: number[]
  labels: string[]
  titel: (i: number) => string
  mass: Mass
  euro: (n: number) => string
  kurz?: boolean
}) {
  const max = Math.max(...werte, 0)
  return (
    <div className="flex h-32 items-end gap-0.5">
      {werte.map((v, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${titel(i)}: ${mass === 'betrag' ? euro(v) : `${v}×`}`}>
          <div
            className="w-full rounded-t-sm"
            style={{
              height: max > 0 && v > 0 ? `${Math.max(3, (v / max) * 100)}%` : '1px',
              background: 'var(--chart-cat-1)',
              opacity: v > 0 ? 0.85 : 0.3,
            }}
          />
          <span className={`text-[10px] text-muted-foreground ${kurz ? 'hidden sm:block' : ''}`}>
            {kurz && i % 5 !== 0 && i !== werte.length - 1 ? '' : labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

export function BankMuster({ daten, scope }: BankAbschnittProps) {
  const [mass, setMass] = useState<Mass>('betrag')
  const euro = (n: number) => fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: 0 })
  const m = useMemo(() => berechneMuster(scope.buchungen, daten.eigeneIbans), [scope.buchungen, daten.eigeneIbans])

  const wochentag = mass === 'betrag' ? m.wochentagSumme : m.wochentagAnzahl
  const tag = mass === 'betrag' ? m.tagSumme : m.tagAnzahl

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Ausgabenmuster
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.anzahl} Ausgabenbuchungen{m.anzahl > 0 ? ` · ${euro(m.summe)}` : ''} · ohne Umbuchungen
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Maß">
          {([['betrag', 'Betrag'], ['anzahl', 'Anzahl']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMass(k)}
              aria-pressed={mass === k}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                mass === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!m.genug ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Zu wenig Daten für ein Muster: {m.anzahl} von mindestens {MUSTER_MIN_BUCHUNGEN} Ausgabenbuchungen.
          Wähle einen längeren Zeitraum oder hebe den Monatsfilter auf.
        </p>
      ) : (
        <>
          {m.hinweise.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {m.hinweise.map(h => <li key={h}>{h}</li>)}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">Nach Wochentag</p>
              <Balken
                werte={wochentag}
                labels={WOCHENTAGE.map(w => w.slice(0, 2))}
                titel={i => WOCHENTAGE[i]}
                mass={mass}
                euro={euro}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">Nach Tag im Monat</p>
              <Balken
                werte={tag}
                labels={tag.map((_, i) => String(i + 1))}
                titel={i => `${i + 1}. des Monats`}
                mass={mass}
                euro={euro}
                kurz
              />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Große Einzelbeträge (Miete, Versicherungen) prägen die Betragsansicht; „Anzahl“ zeigt das Alltagsverhalten.
            Alle Bankbuchungen ohne Umbuchungen zwischen eigenen Konten — Anlagen (z. B. Kraken) zählen mit.
          </p>
        </>
      )}
    </div>
  )
}
