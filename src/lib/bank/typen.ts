import type { BankBalance, BankTransaction, FinanceCategory } from '@/types/bank'
import type { FlowInclude, FlowRow } from '@/lib/finance/flow-calc'
import type { Period } from '@/lib/period'

/**
 * Gemeinsame Formen der Bankdaten-Seite (analyse/banking). Die Seite laedt alles EINMAL auf
 * dem Server (lib/data/bank-seite.ts) und reicht es an die Abschnitte weiter; die Abschnitte
 * kennen nur diese beiden Typen. So lassen sie sich unabhaengig bauen und testen.
 */

export type BankFlowZeile = FlowRow & { month: string; account_id: string | null }

/** Alles, was die Seite geladen hat — ungefiltert, so wie es in der Datenbank steht. */
export interface BankSeitenDaten {
  /** Heutiges Datum (YYYY-MM-DD, deutsche Zeit). */
  heute: string
  locale: string
  dateFormat: string
  /** Gewaehlter Zeitraum und seine Untergrenze (YYYY-MM-DD; null = Alles). */
  periode: Period
  cutoff: string | null
  /** Ausgewaehlter Monat `YYYY-MM`, Konto (IBAN), Gegenpartei und Kategoriefilter aus der URL. */
  monat: string | null
  konto: string | null
  partei: string | null
  /** Kategorie-ID, oder `'offen'` fuer „ohne Kategorie". */
  kat: string | null
  /** Zaehlen Anlagen und Forderungen mit (Schalter `anlage`)? */
  include: FlowInclude
  /** Letzter gebuchter Saldo je Konto (inkl. verknuepfter `account_id`). */
  balances: BankBalance[]
  /** ALLE Bankbuchungen des Nutzers, neueste zuerst (bis 5.000). */
  transactions: BankTransaction[]
  categories: FinanceCategory[]
  /** Monatssummen aus `monthly_flows` fuer Quelle bank_sync, alle Monate und Konten. */
  flowRows: BankFlowZeile[]
  /** IBANs der eigenen Konten, normalisiert (grossgeschrieben, ohne Leerzeichen). */
  eigeneIbans: string[]
}

/**
 * Auf Zeitraum, Konto und Monat zugeschnittene Sichten. Einmal berechnet (lib/bank/scope.ts)
 * und an alle Abschnitte gereicht, damit sie dieselbe Zahl sehen.
 */
export interface BankScope {
  /** Buchungen im Zeitraum, fuer das gewaehlte Konto, und — falls gewaehlt — im Monat. */
  buchungen: BankTransaction[]
  /** Wie `buchungen`, aber ohne Monatsfilter (der Monatschart muss alle Monate zeigen). */
  buchungenOhneMonat: BankTransaction[]
  /**
   * Fuer die Buchungsliste: Konto und Monat, aber NICHT der Zeitraum — dort ist die komplette
   * Historie samt Suche der Zweck (bewusst so seit der alten Seite).
   */
  liste: BankTransaction[]
  /** Flow-Zeilen im Zeitraum fuer das Konto (+ Monat). */
  flows: BankFlowZeile[]
  flowsOhneMonat: BankFlowZeile[]
  /** Account-ID des gewaehlten Kontos, falls vorhanden. */
  kontoAccountId: string | null
}

/** Props, die jeder Abschnitt der Seite bekommt. */
export interface BankAbschnittProps {
  daten: BankSeitenDaten
  scope: BankScope
}
