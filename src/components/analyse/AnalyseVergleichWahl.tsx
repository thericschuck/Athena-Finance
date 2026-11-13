'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import {
  VERGLEICH_STANDARD, parseVergleich, vergleichBelastbar, vergleichsFenster,
  type VergleichsModus,
} from '@/lib/analyse/vergleich'
import type { Period } from '@/lib/period'

/**
 * Umschalter „vs. Vorperiode | vs. Vorjahr | aus" fuer den Vergleich der Kennzahlen.
 *
 * Der Modus steht im URL-Parameter `vergleich`; der Standard (Vorperiode) wird NICHT in die URL
 * geschrieben, damit Links ohne Parameter dasselbe zeigen wie die Voreinstellung.
 *
 * Verfuegbarkeit wird je Modus aus Zeitraum und Historie bestimmt, NICHT aus
 * `daten.vergleichsFenster`: das ist bei „aus" immer null und sagte nichts darueber, ob der
 * Vergleich ueberhaupt moeglich waere. Ein Modus ist deaktiviert, wenn es dazu kein Fenster gibt
 * (Alles, eine Woche) oder die Historie das Fenster nicht abdeckt (sonst waere jede Differenz nur
 * fehlende Daten, siehe vergleichBelastbar). „aus" geht immer.
 *
 * Bekommt genau die fuenf Felder, die er braucht, NICHT das `daten`-Objekt der Seite: das enthaelt alle Buchungen und den
 * Scope mit Mitglieder-IDs und IBANs, und alles, was an eine Client-Komponente geht, landet im Browser (AUDIT.md C3).
 */

export interface AnalyseVergleichWahlProps {
  /** Modus laut Server (Standard, solange die URL keinen `vergleich` setzt). */
  vergleich: VergleichsModus
  periode: Period
  /** Untergrenze des Zeitraums (YYYY-MM-DD); null = Alles. */
  cutoff: string | null
  /** Heutiges Datum (YYYY-MM-DD, deutsche Zeit). */
  heute: string
  /** Fruehester Monat mit Daten (YYYY-MM-01); null = keine Buchung. */
  fruehesterMonat: string | null
}

const MODI: { modus: VergleichsModus; label: string; kurz: string }[] = [
  { modus: 'vorperiode', label: 'vs. Vorperiode', kurz: 'Vorperiode' },
  { modus: 'vorjahr', label: 'vs. Vorjahr', kurz: 'Vorjahr' },
  { modus: 'aus', label: 'aus', kurz: 'aus' },
]

export function AnalyseVergleichWahl({ vergleich, periode, cutoff, heute, fruehesterMonat }: AnalyseVergleichWahlProps) {
  const filters = useUrlFilters()
  // Optimistischer Wert: der Klick wird sofort markiert, noch bevor der Server geantwortet hat.
  const aktiv = parseVergleich(filters.get('vergleich') ?? vergleich)

  const grund = (modus: VergleichsModus): string | null => {
    if (modus === 'aus') return null
    if (periode === '1W') return 'Für eine Woche gibt es keinen Vergleich (zu kleine Zahlen).'
    if (!cutoff) return 'Für „Alles" gibt es keinen Vergleich: es fehlt die Zeit davor.'
    const f = vergleichsFenster(periode, cutoff, heute, modus)
    if (!vergleichBelastbar(f, fruehesterMonat)) {
      return `Die Daten reichen nicht weit genug zurück für den Vergleich mit ${modus === 'vorjahr' ? 'dem Vorjahr' : 'der Vorperiode'}.`
    }
    return null
  }

  const gruende = MODI.map(m => grund(m.modus))
  const keinVergleichMoeglich = gruende[0] !== null && gruende[1] !== null

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div role="group" aria-label="Vergleich der Kennzahlen" className="flex rounded-md bg-muted p-0.5">
        {MODI.map((m, i) => {
          const gesperrt = gruende[i] !== null
          const an = aktiv === m.modus
          return (
            <button
              key={m.modus}
              type="button"
              aria-pressed={an}
              disabled={gesperrt}
              title={gruende[i] ?? undefined}
              onClick={() => filters.set('vergleich', m.modus === VERGLEICH_STANDARD ? null : m.modus)}
              className={`min-h-10 whitespace-nowrap rounded px-3 text-xs font-medium transition-colors sm:min-h-8 ${
                an ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      {keinVergleichMoeglich && (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {periode === '1W' ? 'kein Vergleich bei 1 Woche' : cutoff ? 'zu wenig Historie' : 'kein Vergleich bei Alles'}
        </span>
      )}
    </div>
  )
}
