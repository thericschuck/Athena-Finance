'use client'

import { useMemo, useState } from 'react'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'
import type { CategoryDatum } from '@/lib/analyseData'
import { ModeSwitch } from './ModeSwitch'

/**
 * War ein divergierendes recharts-Balkendiagramm um die Null: Einnahmen nach
 * rechts, Ausgaben nach links, Höhe `anzahl * 36px`. Zwei Probleme — die Karte
 * wuchs mit jeder Kategorie ins Unendliche (bei 25 Kategorien über 900px, neben
 * einem 290px hohen Monatsvergleich), und jede Zeile durfte nur die Hälfte der
 * Breite nutzen, weil die andere Hälfte für das jeweils andere Vorzeichen
 * freigehalten wurde.
 *
 * Jetzt: eine Seite zur Zeit (Umschalter im Kopf), die Top-8 als Rangliste mit
 * voller Balkenbreite, der Rest gebündelt und auf Klick aufklappbar. Nebenbei
 * fällt recharts hier komplett weg — die Karte ist reines CSS und braucht den
 * dynamischen Import (KategorienChart-impl.tsx) nicht mehr.
 */

/** Zeilen, die ohne Aufklappen sichtbar sind. */
const TOP_N = 8

type Side = 'ausgaben' | 'einnahmen'

const SIDE_OPTIONS: readonly { value: Side; label: string }[] = [
  { value: 'ausgaben',  label: 'Ausgaben' },
  { value: 'einnahmen', label: 'Einnahmen' },
]

interface Row { name: string; amount: number; share: number }

export function KategorienChart({ data }: { data: CategoryDatum[] }) {
  const { locale } = useSettings()
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  const [side, setSide]         = useState<Side>('ausgaben')
  const [expanded, setExpanded] = useState(false)

  const color = side === 'ausgaben' ? 'var(--chart-expense)' : 'var(--chart-income)'

  const { rows, total } = useMemo(() => {
    // `value` trägt das Vorzeichen (siehe CategoryDatum): negativ = Ausgabe.
    const raw = data
      .filter(d => (side === 'ausgaben' ? d.value < 0 : d.value > 0))
      .map(d => ({ name: d.name, amount: Math.abs(d.value) }))
      .sort((a, b) => b.amount - a.amount)

    const sum = raw.reduce((s, r) => s + r.amount, 0)
    return {
      rows: raw.map(r => ({ ...r, share: sum > 0 ? (r.amount / sum) * 100 : 0 })),
      total: sum,
    }
  }, [data, side])

  const hidden = Math.max(0, rows.length - TOP_N)

  // Ohne Aufklappen: Top-8 plus eine Sammelzeile, damit die Summe der Karte
  // trotz Kürzung weiter aufgeht.
  const visible: Row[] = useMemo(() => {
    if (expanded || hidden === 0) return rows
    const top  = rows.slice(0, TOP_N)
    const rest = rows.slice(TOP_N)
    const restAmount = rest.reduce((s, r) => s + r.amount, 0)
    return [
      ...top,
      {
        name: `Sonstige (${rest.length})`,
        amount: restAmount,
        share: total > 0 ? (restAmount / total) * 100 : 0,
      },
    ]
  }, [rows, expanded, hidden, total])

  // Balkenlänge relativ zur größten Einzelkategorie, nicht zur Summe: sonst
  // wären bei vielen kleinen Posten alle Balken kaum sichtbar.
  const maxAmount = Math.max(...visible.map(r => r.amount), 1)

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-medium text-foreground">
          {side === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} nach Kategorie
        </h2>
        <ModeSwitch value={side} options={SIDE_OPTIONS} onChange={v => { setSide(v); setExpanded(false) }} />
      </div>

      <p className="text-xs text-muted-foreground mb-3 tabular-nums">
        {rows.length} {rows.length === 1 ? 'Kategorie' : 'Kategorien'} · {fmt(total)} gesamt
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Keine {side === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} im gewählten Zeitraum.
        </p>
      ) : (
        <ul className={`space-y-1 ${expanded ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
          {visible.map(r => (
            <li
              key={r.name}
              className="grid grid-cols-[minmax(3.5rem,7rem)_minmax(0,1fr)_auto] items-center gap-2.5"
            >
              <span className="truncate text-xs text-foreground" title={r.name}>{r.name}</span>
              <span className="h-1.5 rounded-full bg-muted overflow-hidden">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${(r.amount / maxAmount) * 100}%`, backgroundColor: color, opacity: 0.8 }}
                />
              </span>
              <span className="text-xs tabular-nums whitespace-nowrap text-right">
                <span className="text-foreground">{fmt(r.amount)}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {r.share.toFixed(r.share < 10 ? 1 : 0)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-2.5 self-start text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? 'Weniger anzeigen' : `Alle ${rows.length} Kategorien anzeigen`}
        </button>
      )}
    </div>
  )
}
