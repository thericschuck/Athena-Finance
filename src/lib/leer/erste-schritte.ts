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
  /** Eigene FinTS-Bankverbindungen (Einstellungen -> Integrationen). */
  bankVerbindungen: number
  /** Eigene Boersen-Verbindungen (Kraken Spot/Futures, API-Schluessel). */
  kryptoKonten: number
  /** Krypto-Assets im Scope (von Hand erfasst oder per Boerse gespiegelt). */
  kryptoAssets: number
  /** Depots und Wertgegenstaende im Scope. */
  depots: number
  inventar: number
  /** Der Nutzer ist Eigentuemer seines Haushalts und hat noch kein weiteres Mitglied: Einladen ist moeglich. */
  partnerEinladbar: boolean
  /** Es gibt bereits ein weiteres Haushaltsmitglied. */
  partnerVorhanden: boolean
}

export const LEERE_ZAEHLER: ErsteSchritteZaehler = {
  konten: 0, bankVerbunden: false, buchungen: 0, kategorien: 0, vertraege: 0, sparziele: 0, athenaChats: 0, anlagen: 0,
  bankVerbindungen: 0, kryptoKonten: 0, kryptoAssets: 0, depots: 0, inventar: 0, partnerEinladbar: false, partnerVorhanden: false,
}

export type SchrittId =
  | 'konto' | 'buchungen' | 'kategorien' | 'planung'
  | 'bank' | 'krypto' | 'depot' | 'haushalt' | 'athena'

/** Grundlagen zaehlen zum Fortschritt; Anbindungen und mehr sind optional und erscheinen darunter. */
export type SchrittGruppe = 'grundlagen' | 'anbindungen'

export type Schritt = {
  id: SchrittId
  gruppe: SchrittGruppe
  titel: string
  text: string
  href: string
  aktion: string
  erledigt: boolean
  optional: boolean
}

/** Direktlinks in die Einstellungen (Reiter per ?tab=, siehe settings/page.tsx). */
export const EINSTELLUNGEN_INTEGRATIONEN = '/settings?tab=integrationen'
export const EINSTELLUNGEN_HAUSHALT = '/settings?tab=haushalt'

export function ersteSchritte(z: ErsteSchritteZaehler): Schritt[] {
  const hatKonto = z.konten > 0
  const bankDa = z.bankVerbindungen > 0 || z.bankVerbunden
  const kryptoDa = z.kryptoKonten > 0 || z.kryptoAssets > 0
  const depotDa = z.depots > 0 || z.inventar > 0
  const schritte: Schritt[] = [
    {
      id: 'konto',
      gruppe: 'grundlagen',
      titel: 'Konto anlegen',
      text: 'Ein Konto ist die Basis: Salden, Buchungen und der Vermögensverlauf hängen daran. Du legst es von Hand an oder verbindest weiter unten deine Bank.',
      href: '/finance/accounts',
      aktion: hatKonto ? 'Konten ansehen' : 'Konto anlegen',
      erledigt: hatKonto,
      optional: false,
    },
    {
      id: 'buchungen',
      gruppe: 'grundlagen',
      titel: 'Erste Buchungen erfassen oder importieren',
      text: 'Über den Bank-Sync, einen CSV-Import oder von Hand. Erst mit Buchungen füllen sich Monat, Analyse und Prognose.',
      href: '/finance/transactions',
      aktion: z.buchungen > 0 ? 'Buchungen ansehen' : 'Buchungen hinzufügen',
      erledigt: z.buchungen > 0,
      optional: false,
    },
    {
      id: 'kategorien',
      gruppe: 'grundlagen',
      titel: 'Kategorien prüfen',
      text: 'Kategorien sortieren Einnahmen und Ausgaben. Lege eigene an oder passe sie an, bevor du viele Buchungen einsortierst.',
      href: '/finance/categories',
      aktion: 'Kategorien öffnen',
      erledigt: z.kategorien > 0,
      optional: false,
    },
    {
      id: 'planung',
      gruppe: 'grundlagen',
      titel: 'Vertrag oder Sparziel anlegen',
      text: 'Verträge und Abos speisen die Fixkosten und die Prognose, Sparziele zeigen, ob du rechtzeitig ankommst.',
      href: z.vertraege > 0 ? '/finance/goals' : '/finance/contracts',
      aktion: z.vertraege > 0 ? 'Sparziel anlegen' : 'Vertrag anlegen',
      erledigt: z.vertraege > 0 || z.sparziele > 0,
      optional: false,
    },
    {
      id: 'bank',
      gruppe: 'anbindungen',
      titel: 'Bank verbinden',
      text: 'Per FinTS holt die App Salden und Umsätze automatisch. Zugangsdaten trägst du selbst ein; sie werden verschlüsselt gespeichert und nie wieder angezeigt.',
      href: EINSTELLUNGEN_INTEGRATIONEN,
      aktion: bankDa ? 'Bankverbindungen ansehen' : 'Bank verbinden',
      erledigt: bankDa,
      optional: true,
    },
    {
      id: 'krypto',
      gruppe: 'anbindungen',
      titel: 'Krypto-Konto verbinden',
      text: 'Verbinde Kraken mit einem API-Schlüssel (nur lesend) für Salden, Kurse und Handelshistorie, oder erfasse Krypto-Assets von Hand.',
      href: z.kryptoKonten > 0 ? '/crypto' : EINSTELLUNGEN_INTEGRATIONEN,
      aktion: z.kryptoKonten > 0 ? 'Krypto ansehen' : 'Krypto verbinden',
      erledigt: kryptoDa,
      optional: true,
    },
    {
      id: 'depot',
      gruppe: 'anbindungen',
      titel: 'Depot oder Wertgegenstände erfassen',
      text: 'Fondsdepots und Sachwerte wie Uhren oder Kunst gehören zum Gesamtbild deines Vermögens.',
      href: z.depots > 0 ? '/inventar' : '/depot',
      aktion: z.depots > 0 ? 'Wertgegenstände anlegen' : 'Depot anlegen',
      erledigt: depotDa,
      optional: true,
    },
  ]
  // Partner einladen: nur fuer den Eigentuemer eines Haushalts. Wer selbst Mitglied ist (eingeladen wurde) oder
  // keinen Haushalt hat, sieht den Schritt nicht. Ist schon ein Partner da, steht er abgehakt da.
  if (z.partnerEinladbar || z.partnerVorhanden) {
    schritte.push({
      id: 'haushalt',
      gruppe: 'anbindungen',
      titel: 'Partner zum Haushalt einladen',
      text: 'Gemeinsame Konten, Verträge und Ziele in einer Ansicht. Du lädst per Link ein, jeder behält seinen eigenen Login und seine eigenen Steuerdaten.',
      href: EINSTELLUNGEN_HAUSHALT,
      aktion: z.partnerVorhanden ? 'Haushalt ansehen' : 'Partner einladen',
      erledigt: z.partnerVorhanden,
      optional: true,
    })
  }
  schritte.push({
    id: 'athena',
    gruppe: 'anbindungen',
    titel: 'Athena ausprobieren',
    text: 'Athena liest deine Finanzdaten und beantwortet Fragen dazu. Geändert wird nur, was du bestätigst.',
    href: '/assistant',
    aktion: 'Athena öffnen',
    erledigt: z.athenaChats > 0,
    optional: true,
  })
  return schritte
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
