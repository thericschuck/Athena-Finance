'use client'

import { useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import { ringSegmente, type Posten } from '@/lib/dashboard/aufteilung'

/**
 * Aufteilung des Vermögens als Ring, jeder Posten mit seinem Namen (Konto, Depot, Krypto) statt
 * einer Sammelposition „Konten".
 *
 * Reines SVG statt Recharts: der alte Ring zeigte beim Überfahren einen Recharts-Tooltip nur mit
 * dem Betrag und ohne Namen („was ist das?"), saß in einer 144-px-Fläche und wurde dort
 * abgeschnitten. Jetzt wandert die Auskunft in die MITTE des Rings: Name, Betrag und Anteil des
 * Postens unter dem Zeiger (oder Fokus/Antippen), alle anderen Segmente treten zurück. Ring und
 * Legende teilen sich den Zustand — wer über eine Legendenzeile fährt, sieht das Segment, und
 * umgekehrt. Das funktioniert auch per Tippen und Tastatur.
 *
 * Die Mitte zeigt ohne Auswahl die Summe der Posten. Konten im Minus kann ein Ring nicht zeigen;
 * sie stehen darunter, damit die Summe nicht stillschweigend von der Net-Worth-Zahl abweicht.
 */

const FARBEN = [1, 2, 3, 4, 5, 6].map(n => `var(--chart-cat-${n})`)
const farbe = (i: number) => FARBEN[i % FARBEN.length]

const GROESSE = 152
const MITTE = GROESSE / 2
const RADIUS = 60
const STRICH = 20
const UMFANG = 2 * Math.PI * RADIUS
/** Lücke zwischen den Segmenten in Bogenlänge (px). */
const LUECKE = 2

const ART_LABEL: Record<Posten['art'], string> = { konto: 'Konto', depot: 'Depot', krypto: 'Krypto' }

type Props = {
  posten: Posten[]
  total: number
  /** Summe der Konten im Minus und Kreditkonten (≤ 0), nicht im Ring. */
  minus: number
  locale: string
}

export function PortfolioDonut({ posten, total, minus, locale }: Props) {
  const [aktiv, setAktiv] = useState<string | null>(null)
  const fmt = (n: number) => fmtCurrency(n, 'EUR', locale)
  if (total <= 0 || posten.length === 0) return null

  const segmente = ringSegmente(posten)
  const gewaehlt = posten.find(p => p.key === aktiv) ?? null
  const prozent = (v: number) => {
    const p = (v / total) * 100
    return `${p.toLocaleString(locale, { maximumFractionDigits: p < 10 ? 1 : 0 })} %`
  }
  // Antippen schaltet um (kein Hover auf dem Handy); Fahren/Fokus setzt nur.
  const umschalten = (key: string) => setAktiv(a => (a === key ? null : key))

  return (
    <div className="h-full rounded-lg border border-border bg-card p-4 sm:p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Aufteilung</p>

      <div className="flex flex-col items-center gap-4">
        <div className="relative shrink-0" style={{ width: GROESSE, height: GROESSE }}>
          <svg
            width={GROESSE} height={GROESSE} viewBox={`0 0 ${GROESSE} ${GROESSE}`}
            role="img" aria-label={`Aufteilung: ${posten.map(p => `${p.label} ${prozent(p.value)}`).join(', ')}`}
            className="-rotate-90"
            onMouseLeave={() => setAktiv(null)}
          >
            {/* Spur: zeigt den Ring auch dort, wo ein Segment zurücktritt. */}
            <circle cx={MITTE} cy={MITTE} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={STRICH} opacity={0.35} />
            {posten.map((p, i) => {
              const s = segmente[i]
              const laenge = Math.max(0, s.anteil * UMFANG - (posten.length > 1 ? LUECKE : 0))
              const an = aktiv === null || aktiv === p.key
              return (
                <circle
                  key={p.key}
                  cx={MITTE} cy={MITTE} r={RADIUS} fill="none"
                  stroke={farbe(i)} strokeWidth={aktiv === p.key ? STRICH + 4 : STRICH}
                  strokeDasharray={`${laenge} ${UMFANG - laenge}`}
                  strokeDashoffset={-s.start * UMFANG}
                  opacity={an ? 1 : 0.28}
                  className="cursor-pointer transition-[opacity,stroke-width] duration-150 focus-visible:outline-none"
                  tabIndex={0}
                  aria-label={`${p.label}: ${fmt(p.value)}, ${prozent(p.value)}`}
                  onMouseEnter={() => setAktiv(p.key)}
                  onFocus={() => setAktiv(p.key)}
                  onBlur={() => setAktiv(null)}
                  onClick={() => umschalten(p.key)}
                />
              )
            })}
          </svg>

          {/* Mitte: ohne Auswahl die Summe, sonst der Posten unter dem Zeiger. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
            {gewaehlt ? (
              <>
                <p className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">{gewaehlt.label}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight">{fmt(gewaehlt.value)}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {prozent(gewaehlt.value)} · {ART_LABEL[gewaehlt.art]}
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground">Gesamt</p>
                <p className="text-sm font-bold tabular-nums leading-tight">
                  {total >= 100_000 ? `${(total / 1000).toFixed(0)}k` : fmt(total).replace(' €', '€')}
                </p>
              </>
            )}
          </div>
        </div>

        <ul className="w-full space-y-0.5" onMouseLeave={() => setAktiv(null)}>
          {posten.map((p, i) => (
            <li key={p.key}>
              <button
                type="button"
                onMouseEnter={() => setAktiv(p.key)}
                onFocus={() => setAktiv(p.key)}
                onBlur={() => setAktiv(null)}
                onClick={() => umschalten(p.key)}
                aria-pressed={aktiv === p.key}
                className={`flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-muted/50 ${
                  aktiv === p.key ? 'bg-muted/60' : ''
                }`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: farbe(i) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{p.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{prozent(p.value)}</span>
                <span className="w-20 text-right text-xs font-semibold tabular-nums">{fmt(p.value)}</span>
              </button>
            </li>
          ))}
        </ul>

        {minus < 0 && (
          <p className="w-full border-t border-border pt-2 text-xs text-muted-foreground">
            Nicht im Ring: Konten im Minus{' '}
            <span className="font-medium tabular-nums text-danger">−{fmt(Math.abs(minus))}</span>
          </p>
        )}
      </div>
    </div>
  )
}
