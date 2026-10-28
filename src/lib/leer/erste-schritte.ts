/**
 * Checkliste "Erste Schritte" - reine Regeln, ohne Supabase und ohne React.
 *
 * Die Schritte werden aus Zaehlwerten abgeleitet (nichts wird extra gespeichert): sie haken sich
 * von selbst ab, sobald die Daten da sind. Gespeichert wird nur ein Vermerk je Nutzer
 * (user_settings 'onboarding_checkliste'): 'ausgeblendet' (weggeklickt) oder 'fertig' (alle Schritte erledigt).
 * Mit Vermerk laufen keine Zaehl-Abfragen mehr. Entscheidung: 'fertig' bleibt fertig, auch wenn spaeter
 * ein neuer Schritt hinzukommt (z. B. der Partner-Schritt) - die Checkliste kehrt nie von selbst zurueck;
 * wiederholen kann der Nutzer sie in den Einstellungen (Darstellung).
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
  konten: 0, bankVerbunden: false, buchungen: 0, kategorien: 0, vertraege: 0, sparziele: 0, athenaChats: 0,
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
/** Oeffnet den Chat mit vorbefuelltem Kennenlern-Text (Parameter wertet der Assistent aus). */
export const ATHENA_KENNENLERNEN_HREF = '/assistant?start=kennenlernen'

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
    titel: 'Athena kennenlernen',
    text: 'Athena stellt dir ein paar gezielte Fragen zu deiner Lage, damit ihre Antworten besser werden. Der Text steht schon im Eingabefeld, du schickst ihn nur ab.',
    href: ATHENA_KENNENLERNEN_HREF,
    aktion: 'Athena kennenlernen',
    erledigt: z.athenaChats > 0,
    optional: true,
  })
  return schritte
}

/** Fortschritt ueber ALLE sichtbaren Schritte (auch die optionalen): 100 % = alles abgehakt = Karte verschwindet. */
export function fortschritt(schritte: Schritt[]): { erledigt: number; gesamt: number; prozent: number } {
  const erledigt = schritte.filter(s => s.erledigt).length
  const gesamt = schritte.length
  return { erledigt, gesamt, prozent: gesamt === 0 ? 0 : Math.round((erledigt / gesamt) * 100) }
}

/** Naechster offener Schritt (Pflichtschritte zuerst), oder null, wenn alles erledigt ist. */
export function naechsterSchritt(schritte: Schritt[]): Schritt | null {
  return schritte.find(s => !s.erledigt && !s.optional) ?? schritte.find(s => !s.erledigt) ?? null
}

export const CHECKLISTE_KEY = 'onboarding_checkliste'
export type ChecklisteFlag = 'ausgeblendet' | 'fertig'

/** Liest den gespeicherten Vermerk (unbekannte Werte zaehlen als "kein Vermerk"). */
export function checklisteFlag(wert: unknown): ChecklisteFlag | null {
  return wert === 'ausgeblendet' || wert === 'fertig' ? wert : null
}

export type ChecklisteAnsicht = {
  schritte: Schritt[]
  naechster: Schritt
  fortschritt: { erledigt: number; gesamt: number; prozent: number }
  /** Noch gar nichts da (kein Konto, keine Buchung): freundlicher Einstieg statt "Erste Schritte". */
  willkommen: boolean
}

/**
 * Was das Dashboard zeigt. Mit Vermerk braucht es keine Zaehler (`null`); ohne Vermerk muss `zaehler`
 * da sein, sonst gibt es nichts anzuzeigen ('fertig'). Alle Schritte erledigt -> 'fertig'.
 */
export function checklisteStatus(
  zaehler: ErsteSchritteZaehler | null,
  flag: ChecklisteFlag | null,
): 'ausgeblendet' | 'fertig' | ChecklisteAnsicht {
  if (flag) return flag
  if (!zaehler) return 'fertig'
  const schritte = ersteSchritte(zaehler)
  const naechster = naechsterSchritt(schritte)
  if (!naechster) return 'fertig'
  return {
    schritte, naechster, fortschritt: fortschritt(schritte),
    willkommen: zaehler.konten === 0 && zaehler.buchungen === 0,
  }
}

/**
 * 'fertig' wird nur im Scope 'ich' vermerkt und nur, wenn die Zaehler wirklich alles erledigt zeigen:
 * der Blick in 'Gemeinsam' oder 'Partner' darf keine fremde Vollstaendigkeit vortaeuschen.
 */
export function sollFertigVermerken(zaehler: ErsteSchritteZaehler, scope: string, flag: ChecklisteFlag | null): boolean {
  return flag === null && scope === 'ich' && checklisteStatus(zaehler, null) === 'fertig'
}
