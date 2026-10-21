import { berechneSteuerposition, type SteuerEingaben, type Steuerposition } from '../tax/position.ts'
import { eur } from '../tax/tarif.ts'
import { monatVon, parse, tageImMonat } from './datum.ts'
import { lohnImMonat, summeImMonat, type Annahme } from './annahmen.ts'

/**
 * Steuerprognose für ein Jahr: Hochrechnung aus dem Ist-Stand plus Annahmen, durch dieselbe
 * Engine gerechnet wie die Steuerseite (`berechneSteuerposition`) — es gibt keine zweite
 * Steuerrechnung. Das Ergebnis ist eine SCHÄTZUNG, kein Steuerbescheid.
 *
 * Hochrechnung je Monat des Zieljahrs mit einem Gewicht: vergangene Monate 0 (stehen im Ist-Stand),
 * der laufende Monat mit seinem noch offenen Anteil (seine bisherigen Buchungen stehen schon im
 * Ist-Stand), künftige Monate 1. Offene Monate bekommen die Laufrate (Durchschnitt pro Monat aus
 * dem Ist-Stand) und darauf die Annahmen.
 *
 * Gezeigt werden zwei Rechnungen nebeneinander: `basis` (nur Laufrate) und `szenario` (mit
 * Annahmen). Der Unterschied ist das, was die Annahmen steuerlich kosten.
 */

export type Laufrate = {
  /** Pro Monat, aus dem Ist-Stand hochgerechnet. */
  betriebseinnahmen: number
  betriebsausgaben: number
  lohnNetto: number
}

export type SteuerPrognoseEingaben = {
  jahr: number
  /** Heute, `YYYY-MM-DD`. */
  heute: string
  /**
   * Die Eingaben der Steuerseite für das Zieljahr: Ist-Stand bis heute, Tarif, Profil, Rücklage.
   * Für ein künftiges Jahr stehen Einnahmen und Ausgaben dort auf 0.
   */
  istStand: SteuerEingaben
  laufrate: Laufrate
  annahmen: Annahme[]
}

export type Hochrechnung = {
  betriebseinnahmen: number
  betriebsausgaben: number
  gewinn: number
  lohnNetto: number
  lohnBrutto: number | null
}

export type SteuerPrognose = {
  jahr: number
  basis: { position: Steuerposition; hochrechnung: Hochrechnung }
  szenario: { position: Steuerposition; hochrechnung: Hochrechnung }
  /** Was die Annahmen an Steuer (Einkommensteuer, Kirchensteuer, Soli) zusätzlich kosten. */
  mehrsteuer: number
  /** Empfehlung für die Steuerrücklage nach Szenario. */
  ruecklage: {
    soll: number
    ist: number | null
    luecke: number | null
    /** Pro Monat bis Jahresende, damit die Lücke geschlossen wird; null ohne Rücklage-Ziel. */
    proMonat: number | null
    monateBisJahresende: number
  }
  hinweise: string[]
}

/** Gewicht eines Monats im Zieljahr: 0 vergangen, Restanteil im laufenden Monat, 1 künftig. */
function gewichtDesMonats(jahr: number, monat: number, heute: string): number {
  const h = parse(heute)
  if (jahr > h.y) return 1
  if (jahr < h.y) return 0
  if (monat > h.m) return 1
  if (monat < h.m) return 0
  const dim = tageImMonat(h.y, h.m)
  return (dim - h.d) / dim
}

function hochrechnen(
  e: SteuerPrognoseEingaben,
  annahmen: Annahme[],
): { eingaben: SteuerEingaben; hochrechnung: Hochrechnung } {
  const { jahr, heute, istStand, laufrate } = e
  const profil = istStand.profil
  const bruttoMonatProfil = profil.bruttoJahreslohn !== null ? profil.bruttoJahreslohn / 12 : null
  // Brutto nur dann selbst rechnen, wenn es eine belastbare Quelle gibt; sonst schätzt die Engine
  // aus dem Netto wie auf der Steuerseite.
  const brauchtBrutto = bruttoMonatProfil !== null || annahmen.some(a => a.art === 'lohn' && a.brutto !== null)

  let einnahmen = istStand.betriebseinnahmen
  let ausgaben = istStand.betriebsausgaben
  let lohnNetto = istStand.lohnNettoImJahr
  let lohnBrutto = 0

  for (let m = 1; m <= 12; m++) {
    const monat = `${jahr}-${String(m).padStart(2, '0')}`
    const gewicht = gewichtDesMonats(jahr, m, heute)

    const lohnA = lohnImMonat(annahmen, monat)
    const nettoMonat = lohnA ? lohnA.betrag : laufrate.lohnNetto
    lohnNetto += nettoMonat * gewicht
    einnahmen += (laufrate.betriebseinnahmen + summeImMonat(annahmen, 'betriebseinnahme', monat)) * gewicht
    ausgaben += (laufrate.betriebsausgaben + summeImMonat(annahmen, 'betriebsausgabe', monat)) * gewicht

    if (brauchtBrutto) {
      const bruttoAlt = bruttoMonatProfil ?? laufrate.lohnNetto / profil.nettoQuote
      const bruttoNeu = lohnA?.brutto ?? bruttoMonatProfil ?? nettoMonat / profil.nettoQuote
      lohnBrutto += bruttoAlt * (1 - gewicht) + bruttoNeu * gewicht
    }
  }

  einnahmen = eur(einnahmen)
  ausgaben = eur(ausgaben)
  lohnNetto = eur(lohnNetto)

  const eingaben: SteuerEingaben = {
    ...istStand,
    betriebseinnahmen: einnahmen,
    betriebsausgaben: ausgaben,
    lohnNettoImJahr: lohnNetto,
    // Das Jahr ist vollständig hochgerechnet; die Engine soll nicht ein zweites Mal aufs Jahr rechnen.
    monateMitLohn: lohnNetto > 0 ? 12 : 0,
    profil: { ...profil, bruttoJahreslohn: brauchtBrutto ? eur(lohnBrutto) : profil.bruttoJahreslohn },
  }
  return {
    eingaben,
    hochrechnung: {
      betriebseinnahmen: einnahmen,
      betriebsausgaben: ausgaben,
      gewinn: eur(einnahmen - ausgaben),
      lohnNetto,
      lohnBrutto: brauchtBrutto ? eur(lohnBrutto) : null,
    },
  }
}

export function berechneSteuerPrognose(e: SteuerPrognoseEingaben): SteuerPrognose {
  const basis = hochrechnen(e, [])
  const szenario = hochrechnen(e, e.annahmen)
  const posBasis = berechneSteuerposition(basis.eingaben)
  const posSzenario = berechneSteuerposition(szenario.eingaben)

  const h = parse(e.heute)
  const monateBisJahresende = e.jahr > h.y ? 12 : Math.max(1, 12 - h.m + 1)
  const { soll, ist, luecke } = posSzenario.ruecklage

  const hinweise: string[] = [
    'Das ist eine Schätzung und kein Steuerbescheid. Vorsorgeaufwendungen, Kinderfreibeträge und weitere Abzüge kennt die App nicht genau.',
    'Die Lohnsteuer wird schon vom Gehalt abgezogen; zu zahlen ist am Ende die Differenz zur Gesamtsteuer, vor allem durch den Gewinn aus dem Gewerbe.',
  ]
  if (e.annahmen.length === 0) hinweise.push('Es sind keine Annahmen eingetragen: Basis und Szenario sind identisch.')
  if (e.jahr > h.y) {
    hinweise.push(`Für ${e.jahr} wird mit der Laufrate des laufenden Jahres gerechnet, nicht mit bekannten Buchungen.`)
  }
  if (monatVon(e.heute) > `${e.jahr}-12`) hinweise.push('Das Jahr ist abgelaufen: es gilt der Ist-Stand.')

  return {
    jahr: e.jahr,
    basis: { position: posBasis, hochrechnung: basis.hochrechnung },
    szenario: { position: posSzenario, hochrechnung: szenario.hochrechnung },
    mehrsteuer: eur(posSzenario.steuer.gesamt - posBasis.steuer.gesamt),
    ruecklage: {
      soll,
      ist,
      luecke,
      proMonat: luecke === null ? null : eur(luecke / monateBisJahresende),
      monateBisJahresende,
    },
    hinweise,
  }
}

export type JahresSumme = { betriebseinnahmen: number; betriebsausgaben: number; lohnNetto: number }

/**
 * Laufrate pro Monat für die Hochrechnung. Ab drei verstrichenen Monaten trägt der Ist-Stand des
 * laufenden Jahres; davor wäre er zu dünn und das Vorjahr (durch 12) die bessere Grundlage.
 * Der Lohn wird nur durch die Monate geteilt, in denen schon Lohn eingegangen ist (wie auf der
 * Steuerseite).
 */
export function laufrateAus(
  ist: SteuerEingaben,
  vorjahr: JahresSumme | null,
  heute: string,
): { rate: Laufrate; quelle: string } {
  const h = parse(heute)
  const verstrichen = (h.m - 1) + h.d / tageImMonat(h.y, h.m)
  if (verstrichen >= 3 || !vorjahr) {
    const n = Math.max(verstrichen, 1)
    return {
      rate: {
        betriebseinnahmen: eur(ist.betriebseinnahmen / n),
        betriebsausgaben: eur(ist.betriebsausgaben / n),
        lohnNetto: ist.monateMitLohn > 0 ? eur(ist.lohnNettoImJahr / ist.monateMitLohn) : 0,
      },
      quelle: `Durchschnitt der ersten ${Math.round(verstrichen * 10) / 10} Monate ${h.y}`,
    }
  }
  return {
    rate: {
      betriebseinnahmen: eur(vorjahr.betriebseinnahmen / 12),
      betriebsausgaben: eur(vorjahr.betriebsausgaben / 12),
      lohnNetto: eur(vorjahr.lohnNetto / 12),
    },
    quelle: `Durchschnitt ${h.y - 1} (das laufende Jahr ist noch zu jung)`,
  }
}
