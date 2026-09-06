import {
  type Tarif,
  estFuerZvE,
  estRoh,
  eur,
  grenzsteuersatz,
  kirchensteuer,
  satzAufNaechste,
  solidaritaetszuschlag,
  zone,
} from './tarif.ts'

/**
 * Die Steuerposition eines Jahres aus fertig geladenen Zahlen.
 *
 * Reine Funktion: alles, was aus der Datenbank kommt, wird hereingegeben. Das
 * ist der Grund, warum sie testbar ist -- und warum es nur EINE Umsetzung
 * dieser Rechnung gibt und nicht je eine in SQL und in der App.
 */

export type Steuerprofil = {
  /** Bruttojahreslohn aus den Einstellungen. null = nicht gepflegt. */
  bruttoJahreslohn: number | null
  /** Wann der Bruttolohn zuletzt gesetzt wurde -- ein alter Wert ist ein Risiko. */
  bruttoStand: string | null
  /** Anteil des Bruttolohns, der als Vorsorgeaufwand abziehbar ist. */
  vorsorgeAnteilPct: number
  /** Kirchensteuersatz in Prozent. 0 = kein Mitglied. */
  kirchensteuerPct: number
  /**
   * Netto-Quote fuer den Fall, dass kein Brutto gepflegt ist: Netto = Brutto x
   * Quote. Nur eine Groessenordnung, deshalb einstellbar.
   */
  nettoQuote: number
}

export type SteuerEingaben = {
  /** Das angefragte Jahr. */
  jahr: number
  /** Der Tarif, mit dem gerechnet wird -- nicht zwingend der des Jahres. */
  tarif: Tarif
  betriebseinnahmen: number
  betriebsausgaben: number
  /** Summe der Buchungen mit Rolle 'lohn' im Jahr. Netto, wie es ankommt. */
  lohnNettoImJahr: number
  /** Wie viele Monate des Jahres schon Lohn enthalten -- fuer die Hochrechnung. */
  monateMitLohn: number
  profil: Steuerprofil
  /** Betriebseinnahmen des Vorjahres, fuer die Kleinunternehmergrenze. */
  umsatzVorjahr: number | null
  /** Stand des Ruecklage-Sparziels. null = kein Sparziel angelegt. */
  ruecklageIst: number | null
  /** Einnahmen in Kategorien ohne steuerliche Rolle. */
  unzugeordnet: { kategorie: string; betrag: number }[]
}

export type Quelle = 'gerechnet' | 'geschaetzt'

export type Steuerposition = {
  jahr: number
  tarif: { jahr: number; quelle: string; geprueft_am: string; hinweis: string | null }
  betrieb: { einnahmen: number; ausgaben: number; gewinn: number }
  lohn: { brutto: number; quelle: Quelle; erlaeuterung: string }
  zve: {
    betrag: number
    zone: number
    quelle: Quelle
    abzuege: { werbungskosten: number; vorsorge: number; sonderausgaben: number }
  }
  steuer: {
    einkommensteuer: number
    kirchensteuer: number
    solidaritaetszuschlag: number
    gesamt: number
    quelle: Quelle
  }
  grenzsteuersatz: {
    naechster_euro_pct: number
    naechste_1000_pct: number
    von_1000_bleiben: number
  }
  gewinn_kostet: { steuer: number, erlaeuterung: string }
  kleinunternehmer: {
    umsatz_laufend: number
    grenze_laufend: number
    umsatz_vorjahr: number | null
    grenze_vorjahr: number
    status: 'gruen' | 'gelb' | 'rot' | 'unbekannt'
    abstand_laufend: number
  }
  ruecklage: { soll: number; ist: number | null; luecke: number | null }
  unzugeordnet: { kategorie: string; betrag: number }[]
  warnungen: string[]
}

export function berechneSteuerposition(e: SteuerEingaben): Steuerposition {
  const warnungen: string[] = []
  const { tarif, profil } = e

  // ── Tarifjahr ──────────────────────────────────────────────────────────────
  const tarifHinweis = tarif.jahr !== e.jahr
    ? `Fuer ${e.jahr} ist kein geprueftes Tarifjahr hinterlegt. Gerechnet wurde mit dem Tarif ${tarif.jahr}.`
    : null
  if (tarifHinweis) warnungen.push(tarifHinweis)

  // ── Betrieb ────────────────────────────────────────────────────────────────
  // Einnahmen-Ueberschuss-Rechnung nach § 4 Abs. 3 EStG: was im Jahr zugeflossen
  // bzw. abgeflossen ist. Genau das liefern die Buchungen.
  const gewinn = eur(e.betriebseinnahmen - e.betriebsausgaben)

  // ── Lohn ───────────────────────────────────────────────────────────────────
  let bruttoLohn: number
  let lohnQuelle: Quelle
  let lohnErlaeuterung: string

  if (profil.bruttoJahreslohn !== null) {
    bruttoLohn = profil.bruttoJahreslohn
    lohnQuelle = 'gerechnet'
    lohnErlaeuterung = profil.bruttoStand
      ? `Bruttojahreslohn aus den Einstellungen, Stand ${profil.bruttoStand}.`
      : 'Bruttojahreslohn aus den Einstellungen.'
  } else {
    // Kein Brutto gepflegt: aus dem Netto hochrechnen. Das ist bewusst grob --
    // Netto in Brutto zurueckzurechnen braucht die Lohnsteuertabelle, die
    // Beitragssaetze und die Bemessungsgrenzen. Die Zahl reicht, um zu sehen,
    // in welcher Zone man liegt, und nicht mehr.
    const nettoAufsJahr = e.monateMitLohn > 0
      ? (e.lohnNettoImJahr / e.monateMitLohn) * 12
      : 0
    bruttoLohn = eur(nettoAufsJahr / profil.nettoQuote)
    lohnQuelle = 'geschaetzt'
    lohnErlaeuterung =
      `Kein Bruttolohn hinterlegt. Geschaetzt aus ${eur(e.lohnNettoImJahr)} EUR Netto in ` +
      `${e.monateMitLohn} Monaten, aufs Jahr gerechnet und durch eine Netto-Quote von ` +
      `${profil.nettoQuote} geteilt.`
    if (e.monateMitLohn > 0) {
      warnungen.push(
        'Der Bruttolohn ist geschaetzt. Fuer eine belastbare Aussage zum Grenzsteuersatz gehoert ' +
        'er in die Einstellungen -- das ist die eine Zahl, die die App nicht aus den Buchungen lesen kann.',
      )
    }
  }

  if (profil.bruttoStand) {
    const alterTage = Math.floor(
      (Date.parse(`${e.jahr}-12-31`) - Date.parse(profil.bruttoStand)) / 86_400_000,
    )
    if (alterTage > 400) {
      warnungen.push(
        `Der hinterlegte Bruttolohn ist vom ${profil.bruttoStand} und damit aelter als ein Jahr. ` +
        'Nach einer Gehaltserhoehung rechnet die Engine sonst mit dem alten Wert weiter.',
      )
    }
  }

  // ── Zu versteuerndes Einkommen ─────────────────────────────────────────────
  // Bewusst eine Schaetzung, und zwar an genau einer Stelle: die
  // Vorsorgeaufwendungen. Die echten Beitraege zu Renten-, Kranken- und
  // Pflegeversicherung haengen an Beitragssaetzen und Bemessungsgrenzen, die
  // die App nicht kennt. Alles andere hier ist gesetzlich fest.
  const werbungskosten = bruttoLohn > 0 ? tarif.werbungskostenpauschale : 0
  const vorsorge = eur(bruttoLohn * (profil.vorsorgeAnteilPct / 100))
  const sonderausgaben = tarif.sonderausgabenpauschale
  const zve = Math.max(0, eur(bruttoLohn - werbungskosten - vorsorge + gewinn - sonderausgaben))

  // ── Steuer ─────────────────────────────────────────────────────────────────
  const est = estFuerZvE(zve, tarif)
  const kist = kirchensteuer(est, profil.kirchensteuerPct)
  const soli = solidaritaetszuschlag(est, tarif)
  if (soli.unsicher) {
    warnungen.push(
      'Die Soli-Freigrenze dieses Jahres ist nicht hinterlegt und die Einkommensteuer ist hoch ' +
      'genug, dass Solidaritaetszuschlag anfallen koennte. Er ist hier mit 0 angesetzt.',
    )
  }

  // ── Grenzbetrachtung ───────────────────────────────────────────────────────
  const grenzPct = grenzsteuersatz(zve, tarif)
  const naechste1000Pct = satzAufNaechste(zve, 1000, tarif)
  // Auf den Zuschlag-Anteil aufsetzen: Kirchensteuer bemisst sich an der
  // Einkommensteuer, hebt den effektiven Satz also mit an.
  const zuschlagFaktor = 1 + profil.kirchensteuerPct / 100
  const effektivPct = naechste1000Pct * zuschlagFaktor
  const von1000Bleiben = eur(1000 - 1000 * (effektivPct / 100))

  // Was der Gewinn wirklich kostet: die Differenz zur Steuer ohne ihn. Das ist
  // die ehrlichere Zahl als "Gewinn x Grenzsteuersatz", weil ein Gewinn oft
  // ueber eine Zonengrenze hinweg reicht.
  const estOhneGewinn = estRoh(Math.max(0, zve - gewinn), tarif)
  const steuerAufGewinn = eur(Math.max(0, (estRoh(zve, tarif) - estOhneGewinn) * zuschlagFaktor))

  // ── Kleinunternehmer § 19 UStG ─────────────────────────────────────────────
  // Zwei Grenzen, und die Vorjahresgrenze entscheidet, ob man im laufenden Jahr
  // ueberhaupt noch Kleinunternehmer ist.
  const umsatzLaufend = eur(e.betriebseinnahmen)
  const abstandLaufend = eur(tarif.kleinunternehmer_laufend - umsatzLaufend)
  let kuStatus: 'gruen' | 'gelb' | 'rot' | 'unbekannt'
  if (e.umsatzVorjahr === null) {
    kuStatus = 'unbekannt'
  } else if (e.umsatzVorjahr > tarif.kleinunternehmer_vorjahr || umsatzLaufend > tarif.kleinunternehmer_laufend) {
    kuStatus = 'rot'
  } else if (
    e.umsatzVorjahr > tarif.kleinunternehmer_vorjahr * 0.8 ||
    umsatzLaufend > tarif.kleinunternehmer_laufend * 0.8
  ) {
    kuStatus = 'gelb'
  } else {
    kuStatus = 'gruen'
  }
  if (kuStatus === 'rot') {
    warnungen.push(
      'Eine der Kleinunternehmergrenzen ist ueberschritten. Damit wird Umsatzsteuer faellig -- ' +
      'die rechnet diese Engine nicht.',
    )
  }

  // ── Ruecklage ──────────────────────────────────────────────────────────────
  const soll = steuerAufGewinn
  const luecke = e.ruecklageIst === null ? null : eur(Math.max(0, soll - e.ruecklageIst))
  if (e.ruecklageIst === null && soll > 0) {
    warnungen.push(
      `Es gibt kein Ruecklage-Sparziel fuer ${e.jahr}, die Steuer auf den Gewinn liegt aber bei ` +
      `${soll} EUR.`,
    )
  }

  if (e.unzugeordnet.length > 0) {
    const summe = eur(e.unzugeordnet.reduce((s, u) => s + u.betrag, 0))
    warnungen.push(
      `${summe} EUR Einnahmen liegen in Kategorien ohne steuerliche Rolle und sind in dieser ` +
      'Rechnung NICHT enthalten. Solange die Zuordnung fehlt, ist der Gewinn zu niedrig.',
    )
  }

  return {
    jahr: e.jahr,
    tarif: {
      jahr: tarif.jahr,
      quelle: tarif.quelle,
      geprueft_am: tarif.geprueft_am,
      hinweis: tarifHinweis,
    },
    betrieb: { einnahmen: eur(e.betriebseinnahmen), ausgaben: eur(e.betriebsausgaben), gewinn },
    lohn: { brutto: bruttoLohn, quelle: lohnQuelle, erlaeuterung: lohnErlaeuterung },
    zve: {
      betrag: zve,
      zone: zone(zve, tarif),
      quelle: 'geschaetzt',
      abzuege: { werbungskosten, vorsorge, sonderausgaben },
    },
    steuer: {
      einkommensteuer: est,
      kirchensteuer: kist,
      solidaritaetszuschlag: soli.betrag,
      gesamt: eur(est + kist + soli.betrag),
      quelle: 'geschaetzt',
    },
    grenzsteuersatz: {
      naechster_euro_pct: Math.round(grenzPct * zuschlagFaktor * 100) / 100,
      naechste_1000_pct: Math.round(effektivPct * 100) / 100,
      von_1000_bleiben: von1000Bleiben,
    },
    gewinn_kostet: {
      steuer: steuerAufGewinn,
      erlaeuterung:
        'Differenz zwischen der Steuer mit und ohne den Gewinn -- nicht Gewinn mal Grenzsteuersatz, ' +
        'weil ein Gewinn ueber eine Zonengrenze hinweg reichen kann.',
    },
    kleinunternehmer: {
      umsatz_laufend: umsatzLaufend,
      grenze_laufend: tarif.kleinunternehmer_laufend,
      umsatz_vorjahr: e.umsatzVorjahr === null ? null : eur(e.umsatzVorjahr),
      grenze_vorjahr: tarif.kleinunternehmer_vorjahr,
      status: kuStatus,
      abstand_laufend: abstandLaufend,
    },
    ruecklage: { soll, ist: e.ruecklageIst, luecke },
    unzugeordnet: e.unzugeordnet,
    warnungen,
  }
}
