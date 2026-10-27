/**
 * Erste Schritte fuer neue Nutzer — reine Regeln, ohne Supabase und ohne React.
 *
 * Die Schritte werden aus Zaehlwerten abgeleitet (nichts wird extra gespeichert): sie haken sich
 * von selbst ab, sobald die Daten da sind. Die Entscheidung, WANN das Dashboard die Checkliste
 * zeigt, ist bewusst eng gefasst, damit sich die Ansicht eines Nutzers mit Daten nie aendert:
 *  - 'voll':  gar nichts vorhanden -> die Checkliste ersetzt das Dashboard.
 *  - 'karte': Daten da, aber noch kein Konto oder noch keine Buchung -> kompakte Karte oben.
 *  - 'aus':   Konto UND Buchungen vorhanden -> nichts Zusaetzliches.
 */

export type ErsteSchritteZaehler = {
  konten: number
  /** Mindestens ein Konto mit IBAN (also ueber FinTS anbindbar bzw. angebunden). */
  bankVerbunden: boolean
  buchungen: number
  /** Kategorien im Haushalt/Eigene. */
  kategorien: number
  vertraege: number
  sparziele: number
  athenaChats: number
  /** Alles uebrige, was Vermoegen zaehlt: Depots, Krypto, Inventar, Schulden. */
  anlagen: number
}

export const LEERE_ZAEHLER: ErsteSchritteZaehler = {
  konten: 0, bankVerbunden: false, buchungen: 0, kategorien: 0, vertraege: 0, sparziele: 0, athenaChats: 0, anlagen: 0,
}

export type SchrittId = 'konto' | 'buchungen' | 'kategorien' | 'planung' | 'athena'

export type Schritt = {
  id: SchrittId
  titel: string
  text: string
  href: string
  aktion: string
  erledigt: boolean
  optional: boolean
}

export function ersteSchritte(z: ErsteSchritteZaehler): Schritt[] {
  const hatKonto = z.konten > 0
  return [
    {
      id: 'konto',
      titel: 'Konto anlegen oder Bank verbinden',
      text: 'Ein Konto ist die Basis: Salden, Buchungen und der Vermögensverlauf hängen daran. Eine Bank verbindest du in den Einstellungen, ein Konto legst du von Hand an.',
      href: '/finance/accounts',
      aktion: hatKonto ? 'Konten ansehen' : 'Konto anlegen',
      erledigt: hatKonto,
      optional: false,
    },
    {
      id: 'buchungen',
      titel: 'Erste Buchungen erfassen oder importieren',
      text: 'Über den Bank-Sync, einen CSV-Import oder von Hand. Erst mit Buchungen füllen sich Monat, Analyse und Prognose.',
      href: '/finance/transactions',
      aktion: z.buchungen > 0 ? 'Buchungen ansehen' : 'Buchungen hinzufügen',
      erledigt: z.buchungen > 0,
      optional: false,
    },
    {
      id: 'kategorien',
      titel: 'Kategorien prüfen',
      text: 'Kategorien sortieren Einnahmen und Ausgaben. Lege eigene an oder passe sie an, bevor du viele Buchungen einsortierst.',
      href: '/finance/categories',
      aktion: 'Kategorien öffnen',
      erledigt: z.kategorien > 0,
      optional: false,
    },
    {
      id: 'planung',
      titel: 'Vertrag oder Sparziel anlegen',
      text: 'Verträge und Abos speisen die Fixkosten und die Prognose, Sparziele zeigen, ob du rechtzeitig ankommst.',
      href: z.vertraege > 0 ? '/finance/goals' : '/finance/contracts',
      aktion: z.vertraege > 0 ? 'Sparziel anlegen' : 'Vertrag anlegen',
      erledigt: z.vertraege > 0 || z.sparziele > 0,
      optional: false,
    },
    {
      id: 'athena',
      titel: 'Athena ausprobieren',
      text: 'Athena liest deine Finanzdaten und beantwortet Fragen dazu. Geändert wird nur, was du bestätigst.',
      href: '/assistant',
      aktion: 'Athena öffnen',
      erledigt: z.athenaChats > 0,
      optional: true,
    },
  ]
}

export function fortschritt(schritte: Schritt[]): { erledigt: number; gesamt: number; prozent: number } {
  const relevant = schritte.filter(s => !s.optional)
  const erledigt = relevant.filter(s => s.erledigt).length
  const gesamt = relevant.length
  return { erledigt, gesamt, prozent: gesamt === 0 ? 0 : Math.round((erledigt / gesamt) * 100) }
}

/** Naechster offener Schritt (Pflichtschritte zuerst), oder null, wenn alles erledigt ist. */
export function naechsterSchritt(schritte: Schritt[]): Schritt | null {
  return schritte.find(s => !s.erledigt && !s.optional) ?? schritte.find(s => !s.erledigt) ?? null
}

export type EinstiegsAnsicht = 'voll' | 'karte' | 'aus'

/** Nichts da: kein Konto, keine Buchung, keine Anlage, kein Vertrag, kein Sparziel. */
export function istDatenlos(z: ErsteSchritteZaehler): boolean {
  return z.konten === 0 && z.buchungen === 0 && z.anlagen === 0 && z.vertraege === 0 && z.sparziele === 0
}

export function einstiegsAnsicht(z: ErsteSchritteZaehler): EinstiegsAnsicht {
  if (istDatenlos(z)) return 'voll'
  if (z.konten === 0 || z.buchungen === 0) return 'karte'
  return 'aus'
}
