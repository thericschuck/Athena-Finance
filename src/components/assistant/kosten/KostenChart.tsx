'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { anzeigeReihenfolge, tooltipSortierer } from '@/lib/chart-reihenfolge'
import { formatUsd } from '@/lib/assistant/cost'
import { formatTokensKompakt, type KostenTag } from '@/lib/assistant/kosten'
import { cn } from '@/lib/utils'

/**
 * Gestapeltes Tagesbalken-Chart der Athena-Kosten. Ein Chart, zwei Sichten:
 * Tokens (Eingabe / Cache-Lesen / Cache-Schreiben / Ausgabe) oder Kosten nach Modell.
 * Automatische Läufe liegen in beiden Sichten als eigene Reihe obenauf. Farben sind
 * Theme-Tokens (--chart-cat-N), Legende und Tooltip folgen derselben Reihenfolge.
 */

type Sicht = 'tokens' | 'kosten'
type Serie = { key: string; label: string; farbe: string }

const TOKEN_SERIEN: Serie[] = [
  { key: 'eingabe', label: 'Eingabe', farbe: 'var(--chart-cat-1)' },
  { key: 'cacheLesen', label: 'Cache-Lesen', farbe: 'var(--chart-cat-2)' },
  { key: 'cacheSchreiben', label: 'Cache-Schreiben', farbe: 'var(--chart-cat-3)' },
  { key: 'ausgabe', label: 'Ausgabe', farbe: 'var(--chart-cat-4)' },
]
const AUTO_SERIE: Serie = { key: 'auto', label: 'Automatisch', farbe: 'var(--chart-muted-1)' }
const MODELL_FARBEN = ['var(--chart-cat-1)', 'var(--chart-cat-2)', 'var(--chart-cat-3)', 'var(--chart-cat-4)', 'var(--chart-cat-5)']

function tagLabel(tag: string): string {
  return `${tag.slice(8, 10)}.${tag.slice(5, 7)}.`
}

export default function KostenChart({
  tage,
  modelle,
  mitAuto,
}: {
  tage: KostenTag[]
  /** Modelle mit Preis, nach Kosten absteigend (bestimmt Farbe und Stapelreihenfolge). */
  modelle: string[]
  mitAuto: boolean
}) {
  const [sicht, setSicht] = useState<Sicht>('kosten')

  const serien = useMemo<Serie[]>(() => {
    const basis =
      sicht === 'tokens'
        ? TOKEN_SERIEN
        : modelle.map((m, i) => ({ key: m, label: m, farbe: MODELL_FARBEN[i % MODELL_FARBEN.length] }))
    return mitAuto ? [...basis, AUTO_SERIE] : basis
  }, [sicht, modelle, mitAuto])

  const daten = useMemo(
    () =>
      tage.map((t) => {
        const zeile: Record<string, number | string> = { tag: t.tag }
        if (sicht === 'tokens') {
          zeile.eingabe = t.eingabe
          zeile.cacheLesen = t.cacheLesen
          zeile.cacheSchreiben = t.cacheSchreiben
          zeile.ausgabe = t.ausgabe
          zeile.auto = t.auto.tokens
        } else {
          for (const m of modelle) zeile[m] = t.kostenNachModell[m] ?? 0
          zeile.auto = t.auto.kosten
        }
        return zeile
      }),
    [tage, modelle, sicht],
  )

  const fmt = (v: number) => (sicht === 'tokens' ? formatTokensKompakt(v) : formatUsd(v))
  const reihenfolge = anzeigeReihenfolge(serien.map((s) => s.key)) // oben zuerst
  const legende = anzeigeReihenfolge(serien)
  const labelVon = (key: string) => serien.find((s) => s.key === key)?.label ?? key
  // Etwa sechs Beschriftungen auf der X-Achse, egal ob 30 oder 90 Tage.
  const xIntervall = Math.max(0, Math.ceil(tage.length / 6) - 1)

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {sicht === 'tokens' ? 'Tokens je Tag' : 'Kosten ≈ je Tag, nach Modell'}
        </p>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Darstellung">
          {(['tokens', 'kosten'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSicht(s)}
              aria-pressed={sicht === s}
              className={cn(
                'min-h-10 rounded px-3 text-xs transition-colors sm:min-h-8',
                sicht === s ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'tokens' ? 'Tokens' : 'Kosten'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daten} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tag"
              tickFormatter={(t: string) => tagLabel(t)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              interval={xIntervall}
            />
            <YAxis
              width={48}
              tickFormatter={(v: number) => fmt(v)}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              itemSorter={tooltipSortierer(reihenfolge)}
              labelFormatter={(t) => tagLabel(String(t))}
              formatter={(v, name) => [fmt(Number(v)), labelVon(String(name))]}
            />
            {serien.map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.farbe} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {legende.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: s.farbe }} />
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
