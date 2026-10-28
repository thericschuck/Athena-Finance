/**
 * Gemeinsame Typen der Konten-Seiten (Liste `/finance/accounts` und Detail `/finance/accounts/[id]`).
 * Rein, ohne Server-/Browser-Abhängigkeit: Loader (lib/data/konten-seite.ts), Berechnungen
 * (berechnen.ts, detail.ts), Seiten und Komponenten teilen sich dieselben Formen.
 */

export type KontoGruppeKey = 'giro' | 'sparen' | 'anlage' | 'sonstige'

/** Verlauf eines Kontos im gewählten Zeitraum (Sparkline); `first`/`last` für den Tooltip. */
export interface KontoVerlauf {
  values: number[]
  first: string
  last: string
}

/**
 * Wie frisch ein Saldo ist: bei Bankkonten der Zeitpunkt des letzten FinTS-Abrufs (`sync`, ISO mit
 * Zeitzone), bei manuellen Konten der Tag der letzten Buchung (`buchung`, YYYY-MM-DD).
 */
export interface KontoStand {
  art: 'sync' | 'buchung'
  wert: string
}

export interface KontoZeile {
  id: string
  name: string
  type: string
  institution: string | null
  currency: string
  color: string | null
  iban: string | null
  bankIban: string | null
  aktiv: boolean
  sortOrder: number
  /** Geteiltes Konto (Haushalt); `undefined`, wenn nicht geladen. */
  shared?: boolean
  /** Aktueller Kontostand; `null`, wenn es weder Bank-Saldo noch Buchungen gibt. */
  saldo: number | null
  /** Mit der Bank verknüpft (FinTS): der Saldo ist der von der Bank gemeldete. */
  istBank: boolean
  /** Summe aller Buchungen (manuell + Bank) — nur zum Abgleich mit dem Bank-Saldo. */
  buchungssumme: number | null
  /**
   * `saldo − buchungssumme` bei Bankkonten, wenn beide bekannt sind und sich unterscheiden; sonst
   * `null`. Ungleich null heißt: die Buchungen decken die Historie nicht vollständig ab (FinTS
   * liefert nur ein Zeitfenster, ein Anfangsbestand fehlt).
   */
  abweichung: number | null
  stand: KontoStand | null
  verlauf: KontoVerlauf | null
  /** Veränderung über den Zeitraum (letzter − erster Wert des Verlaufs). */
  delta: number | null
}

export interface KontenGruppe {
  key: KontoGruppeKey
  label: string
  konten: KontoZeile[]
  /** Summe der aktiven EUR-Konten der Gruppe. */
  summe: number
  /** Anzahl Konten in anderer Währung, die nicht in `summe` stehen (Krypto in BTC o. ä.). */
  fremdwaehrung: number
}

export interface KontenKennzahlen {
  /** Alle aktiven EUR-Konten. */
  gesamt: number
  /** Giro, Bargeld, Sparkonto. */
  liquide: number
  /** Bausparverträge und Anlage (Depot, Geschäftsanteile, Krypto in EUR). */
  gebunden: number
  /** Summe der negativen Salden (positive Zahl). */
  imMinus: number
  /** Summe der Zeitraum-Veränderungen der aktiven EUR-Konten; `null` ohne jede Historie. */
  delta: number | null
  anzahlAktiv: number
  anzahlInaktiv: number
  /** Aktive Konten in anderer Währung als EUR (nicht in den Summen). */
  fremdwaehrung: number
}
