import type { FlowTransaction, MonthlyFlowRow } from '@/lib/data/flows'
import type { ActiveAccountOption } from '@/lib/data/overview'
import type { FlowInclude } from '@/lib/finance/flow-calc'
import type { Period } from '@/lib/period'
import type { FinanceCategory } from '@/types/bank'
import type { Fenster, VergleichsModus } from './vergleich'

/**
 * Gemeinsame Formen der Analyse-Seite (analyse/page.tsx). Die Seite lädt den Kern EINMAL auf
 * dem Server (lib/data/analyse-seite.ts) und reicht ihn an die Abschnitte; die kennen nur diese
 * Typen. So lassen sich die Abschnitte unabhängig bauen, und alle sehen dieselben Zahlen.
 */

/** Drill-down-Filter aus der URL. Jeder davon schränkt die Buchungsliste (und markiert Charts) ein. */
export interface AnalyseFilter {
  /** Kategorie-ID (Haupt- oder Unterkategorie), oder `'offen'` = ohne Kategorie. */
  kat: string | null
  /** Monat `YYYY-MM`. */
  monat: string | null
  /** Tag `YYYY-MM-DD`. */
  tag: string | null
  /** Gegenpartei (Händler); verglichen über Anzeigename in Kleinbuchstaben. */
  partei: string | null
}

export interface AnalyseDaten {
  /** Heutiges Datum (YYYY-MM-DD, deutsche Zeit). */
  heute: string
  locale: string
  dateFormat: string
  periode: Period
  /** Untergrenze des Zeitraums (YYYY-MM-DD); null = Alles. */
  cutoff: string | null
  /** Zählen Anlagen und Forderungen mit (Schalter `anlage`)? */
  include: FlowInclude
  /** Alle aktiven Konten (für den Kontenfilter). */
  konten: ActiveAccountOption[]
  /** Ausgewählte Konten-IDs; leer = alle. */
  kontoIds: string[]
  filter: AnalyseFilter
  vergleich: VergleichsModus
  /** Aktuelles Monatsfenster und das Vergleichsfenster dazu (null = keins/nicht belastbar). */
  fenster: Fenster | null
  vergleichsFenster: Fenster | null
  /** Früheste Monatssumme überhaupt (YYYY-MM-01) — für „ist der Vergleich überhaupt abgedeckt". */
  fruehesterMonat: string | null
  /** Einzelbuchungen im Zeitraum (Konten und Schalter angewendet), aufsteigend nach Datum. */
  txns: FlowTransaction[]
  /**
   * Monatssummen je Konto/Art/Kategorie: mindestens die letzten 24 Monate und das Vergleichsfenster
   * (Schalter und Konten angewendet). Daraus kommen Kennzahlen, Vergleiche und Trends.
   */
  monatsZeilen: MonthlyFlowRow[]
  categories: FinanceCategory[]
}

/** Props, die jeder Abschnitt bekommt. */
export interface AnalyseAbschnittProps {
  daten: AnalyseDaten
}
