'use client'

import { useMemo, useState } from 'react'
import { fmtCurrency } from '@/lib/format'
import {
  berechneMuster, musterMindestens, WOCHENTAGE,
  type MusterRichtung,
} from '@/lib/bank/auswertung'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Wann kommt Geld rein, wann geht es raus: nach Wochentag und nach Tag im Monat.
 *
 * Ausgaben sind rot, Einnahmen grün (Theme-Tokens --danger / --success), mit einem Schalter
 * dazwischen. Bewusst einfache Balken aus Elementen statt Recharts: zwei kleine Charts ohne
 * Achsen brauchen keine Bibliothek. Statt des Browser-Tooltips steht die Detailzeile über dem
 * Chart fest und folgt dem Zeiger — so bleibt sie auch auf dem Handy per Tippen lesbar.
 *
 * Hinweise erscheinen nur ab einer Mindestzahl Buchungen (musterMindestens); darunter sagt die
 * Verteilung mehr über den Zufall als über das Verhalten. Gerechnet wird auf `scope.buchungen`
 * ohne Umbuchungen, nach Buchungsdatum (value_date).
 */

type Mass = 'betrag' | 'anzahl'

const FARBE: Record<MusterRichtung, string> = { ausgaben: 'var(--danger)', einnahmen: 'var(--success)' }
const TAGE_MIT_LABEL = new Set([1, 5, 10, 15, 20, 25, 31])

interface BalkenProps {
  titel: string
  eintraege: { label: string; name: string; betrag: number; anzahl: number }[]
  mass: Mass
  richtung: MusterRichtung
  summe: number
  euro: (n: number) => string
  /** Beschriftung der Balken: bei wenigen Balken mit Wert, bei vielen nur ausgewählte Tage. */
  mitWert?: boolean
}

function Balken({ titel, eintraege, mass, richtung, summe, euro, mitWert }: BalkenProps) {
  const [aktiv, setAktiv] = useState<number | null>(null)
  const wert = (e: BalkenProps['eintraege'][number]) => (mass === 'betrag' ? e.betrag : e.anzahl)
  const max = Math.max(...eintraege.map(wert), 0)
  const spitze = max > 0 ? eintraege.findIndex(e => wert(e) === max) : -1
  const farbe = FARBE[richtung]
  const zeige = aktiv ?? spitze
  const z = zeige >= 0 ? eintraege[zeige] : null

  return (
    <div>
      <div className="mb-2 flex min-h-[2.25rem] items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{titel}</p>
        {z && (
          <p className="text-right text-xs leading-tight" aria-live="polite">
            <span className="font-medium text-foreground">{z.name}</span>
            <span className="block text-muted-foreground tabular-nums">
              {euro(z.betrag)} · {z.anzahl}× · {summe > 0 ? Math.round((z.betrag / summe) * 100) : 0} %
              {aktiv === null && <span className="ml-1 text-muted-foreground/60">· Spitze</span>}
            </span>
          </p>
        )}
      </div>

      <div
        className="relative flex h-36 items-end gap-1 border-b border-border"
        onMouseLeave={() => setAktiv(null)}
      >
        {/* Hilfslinie bei der Haelfte: ohne Achse ein Maßstab fuer das Auge. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" aria-hidden />
        {eintraege.map((e, i) => {
          const v = wert(e)
          const hoch = max > 0 && v > 0 ? Math.max(4, (v / max) * 100) : 0
          const hervor = i === (aktiv ?? spitze)
          return (
            <button
              key={e.label + i}
              type="button"
              onMouseEnter={() => setAktiv(i)}
              onFocus={() => setAktiv(i)}
              onBlur={() => setAktiv(null)}
              onClick={() => setAktiv(a => (a === i ? null : i))}
              aria-label={`${e.name}: ${euro(e.betrag)}, ${e.anzahl} Buchungen`}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end focus-visible:outline-none"
            >
              {mitWert && v > 0 && (
                <span className="mb-0.5 hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground sm:block">
                  {mass === 'betrag' ? euro(v) : `${v}×`}
                </span>
              )}
              <span
                className="w-full rounded-t-sm transition-opacity"
                style={{
                  height: hoch > 0 ? `${hoch}%` : '2px',
                  background: hoch > 0 ? farbe : 'var(--border)',
                  opacity: hoch === 0 ? 1 : hervor ? 1 : 0.5,
                }}
              />
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex gap-1" aria-hidden>
        {eintraege.map((e, i) => (
          <span key={e.label + i} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
            {mitWert || TAGE_MIT_LABEL.has(i + 1) ? e.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Kachel({ label, wert, hinweis, farbe }: { label: string; wert: string; hinweis?: string; farbe: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: farbe }}>{wert}</p>
      {hinweis && <p className="text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  )
}

export function BankMuster({ daten, scope }: BankAbschnittProps) {
  const [richtung, setRichtung] = useState<MusterRichtung>('ausgaben')
  const [mass, setMass] = useState<Mass>('betrag')
  const euro = (n: number) => fmtCurrency(n, 'EUR', daten.locale, { fractionDigits: 0 })
  const m = useMemo(
    () => berechneMuster(scope.buchungen, daten.eigeneIbans, richtung),
    [scope.buchungen, daten.eigeneIbans, richtung],
  )
  const farbe = FARBE[richtung]
  const nomen = richtung === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'

  const wochentage = WOCHENTAGE.map((w, i) => ({
    label: w.slice(0, 2), name: w, betrag: m.wochentagSumme[i], anzahl: m.wochentagAnzahl[i],
  }))
  const tage = m.tagSumme.map((b, i) => ({
    label: String(i + 1), name: `${i + 1}. des Monats`, betrag: b, anzahl: m.tagAnzahl[i],
  }))

  const spitzeWochentag = m.summe > 0
    ? wochentage.reduce((b, e) => (e.betrag > b.betrag ? e : b), wochentage[0])
    : null
  const spitzeTag = m.summe > 0 ? tage.reduce((b, e) => (e.betrag > b.betrag ? e : b), tage[0]) : null
  const anfang = m.summe > 0 ? m.tagSumme.slice(0, 5).reduce((s, v) => s + v, 0) / m.summe : 0
  const wochenende = m.summe > 0 ? (m.wochentagSumme[5] + m.wochentagSumme[6]) / m.summe : 0
  const pct = (x: number) => `${Math.round(x * 100)} %`

  const umschalter = <T extends string>(
    label: string, werte: readonly (readonly [T, string])[], aktuell: T, setze: (w: T) => void,
    aktivFarbe?: (w: T) => string | undefined,
  ) => (
    <div className="flex rounded-md border border-border p-0.5" role="group" aria-label={label}>
      {werte.map(([k, text]) => {
        const an = aktuell === k
        const f = aktivFarbe?.(k)
        return (
          <button
            key={k}
            type="button"
            onClick={() => setze(k)}
            aria-pressed={an}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              an ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={an && f ? { boxShadow: `inset 0 -2px 0 ${f}` } : undefined}
          >
            {text}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {richtung === 'ausgaben' ? 'Ausgabenmuster' : 'Einnahmenmuster'}
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span className="text-lg font-semibold tabular-nums" style={{ color: farbe }}>
              {m.anzahl > 0 ? euro(m.summe) : '—'}
            </span>
            <span>
              {m.anzahl} {m.anzahl === 1 ? 'Buchung' : 'Buchungen'}
              {m.anzahl > 0 ? ` · Ø ${euro(m.summe / m.anzahl)}` : ''}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {umschalter('Richtung', [['ausgaben', 'Ausgaben'], ['einnahmen', 'Einnahmen']] as const, richtung, setRichtung, w => FARBE[w])}
          {umschalter('Maß', [['betrag', 'Betrag'], ['anzahl', 'Anzahl']] as const, mass, setMass)}
        </div>
      </div>

      {!m.genug ? (
        <p className="mt-4 rounded-md bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          Zu wenig Daten für ein Muster: {m.anzahl} von mindestens {musterMindestens(richtung)} Buchungen.
          <span className="block text-xs">Wähle einen längeren Zeitraum oder hebe den Monatsfilter auf.</span>
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {spitzeWochentag && (
              <Kachel label="Stärkster Wochentag" wert={spitzeWochentag.name}
                hinweis={`${pct(spitzeWochentag.betrag / m.summe)} der ${nomen}`} farbe={farbe} />
            )}
            {spitzeTag && (
              <Kachel label="Stärkster Tag im Monat" wert={spitzeTag.name}
                hinweis={`${euro(spitzeTag.betrag)} gesamt`} farbe={farbe} />
            )}
            <Kachel label="1. bis 5. des Monats" wert={pct(anfang)} hinweis={`der ${nomen}`} farbe={farbe} />
            <Kachel label="Am Wochenende" wert={pct(wochenende)} hinweis={`der ${nomen}`} farbe={farbe} />
          </div>

          {m.hinweise.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {m.hinweise.map(h => <li key={h}>{h}</li>)}
            </ul>
          )}

          <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Balken titel="Nach Wochentag" eintraege={wochentage} mass={mass} richtung={richtung}
              summe={m.summe} euro={euro} mitWert />
            <Balken titel="Nach Tag im Monat" eintraege={tage} mass={mass} richtung={richtung}
              summe={m.summe} euro={euro} />
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground/70">
            Große Einzelbeträge (Miete, Versicherungen, Lohn) prägen die Betragsansicht; „Anzahl“ zeigt das Alltagsverhalten.
            Alle Bankbuchungen ohne Umbuchungen zwischen eigenen Konten — Anlagen (z. B. Kraken) zählen mit.
          </p>
        </>
      )}
    </div>
  )
}
