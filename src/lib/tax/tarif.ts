/**
 * Einkommensteuertarif nach § 32a EStG.
 *
 * Reine Funktionen, keine Datenbank: die Koeffizienten kommen als `Tarif`
 * herein und stehen in der Tabelle `tax_tariffs`. Der Grund steht in der
 * Migration -- der Tarif aendert sich jaehrlich, und fuer 2027 gibt es noch
 * keine veroeffentlichte Fassung.
 */

export type Tarif = {
  jahr: number
  grundfreibetrag: number
  zone2_bis: number
  zone2_faktor: number
  zone2_konstante: number
  zone3_bis: number
  zone3_faktor: number
  zone3_konstante: number
  zone3_sockel: number
  zone4_bis: number
  zone4_satz: number
  zone4_abzug: number
  zone5_satz: number
  zone5_abzug: number
  werbungskostenpauschale: number
  sonderausgabenpauschale: number
  /** NULL in der Tabelle = nicht geprueft. Dann wird kein Soli gerechnet. */
  soli_freigrenze: number | null
  kleinunternehmer_vorjahr: number
  kleinunternehmer_laufend: number
  quelle: string
  geprueft_am: string
}

/** Auf Cent runden. Fuer Geldbetraege, die weitergerechnet werden. */
export function eur(betrag: number): number {
  return Math.round(betrag * 100) / 100
}

/**
 * Der Tarif als durchgehende Funktion, OHNE die Abrundung des Steuerbetrags.
 *
 * Die braucht es getrennt, weil § 32a den Steuerbetrag auf volle Euro abrundet
 * -- und ueber eine Abrundung kann man nicht ableiten. Ein Grenzsteuersatz aus
 * gerundeten Werten waere je nach Startpunkt 0 % oder 100 %. Fuer angezeigte
 * Betraege gilt `estFuerZvE`, fuer jede Steigung diese Funktion hier.
 */
export function estRoh(zvE: number, tarif: Tarif): number {
  if (zvE <= tarif.grundfreibetrag) return 0

  if (zvE <= tarif.zone2_bis) {
    const y = (zvE - tarif.grundfreibetrag) / 10_000
    return (tarif.zone2_faktor * y + tarif.zone2_konstante) * y
  }

  if (zvE <= tarif.zone3_bis) {
    const z = (zvE - tarif.zone2_bis) / 10_000
    return (tarif.zone3_faktor * z + tarif.zone3_konstante) * z + tarif.zone3_sockel
  }

  if (zvE <= tarif.zone4_bis) {
    return tarif.zone4_satz * zvE - tarif.zone4_abzug
  }

  return tarif.zone5_satz * zvE - tarif.zone5_abzug
}

/**
 * Die tarifliche Einkommensteuer, wie sie im Bescheid stehen wuerde:
 * zu versteuerndes Einkommen auf volle Euro abgerundet, Steuerbetrag ebenfalls
 * (§ 32a Abs. 1 Satz 2).
 */
export function estFuerZvE(zvE: number, tarif: Tarif): number {
  return Math.floor(estRoh(Math.floor(Math.max(0, zvE)), tarif))
}

/**
 * Grenzsteuersatz in Prozent: was der naechste Euro kostet.
 *
 * Das ist die Kernzahl der ganzen Engine. Sie ist deutlich belastbarer als die
 * absolute Steuerlast, weil sie sich durch geschaetzte Abzuege nur veraendert,
 * wenn diese eine Zonengrenze ueberschreiten.
 */
export function grenzsteuersatz(zvE: number, tarif: Tarif): number {
  const basis = Math.max(0, zvE)
  return (estRoh(basis + 1, tarif) - estRoh(basis, tarif)) * 100
}

/**
 * Effektiver Satz auf die naechsten `betrag` Euro -- die Zahl, die zaehlt, wenn
 * ein Auftrag ueber eine Zonengrenze hinweg reicht. Bei 1.000 EUR an der Grenze
 * zwischen zwei Zonen liegt sie zwischen den beiden Grenzsteuersaetzen.
 */
export function satzAufNaechste(zvE: number, betrag: number, tarif: Tarif): number {
  if (betrag <= 0) return 0
  const basis = Math.max(0, zvE)
  return ((estRoh(basis + betrag, tarif) - estRoh(basis, tarif)) / betrag) * 100
}

/** Kirchensteuer auf die tarifliche Einkommensteuer. 0 wenn kein Mitglied. */
export function kirchensteuer(est: number, prozent: number): number {
  return eur(est * (prozent / 100))
}

/**
 * Solidaritaetszuschlag: 5,5 % der Einkommensteuer, aber erst oberhalb der
 * Freigrenze und dort abgemildert -- hoechstens 11,9 % des Betrags, um den die
 * Steuer die Freigrenze uebersteigt (§ 4 SolZG).
 *
 * Ist die Freigrenze des Jahres nicht hinterlegt, wird NICHT geraten: der
 * Zuschlag ist dann 0 und `unsicher` sagt, ob das ueberhaupt eine Rolle spielen
 * koennte. Bei einer Einkommensteuer im vierstelligen Bereich liegt man so weit
 * unter jeder Freigrenze der letzten Jahre, dass 0 nicht nur bequem, sondern
 * richtig ist.
 */
export function solidaritaetszuschlag(
  est: number,
  tarif: Tarif,
): { betrag: number; unsicher: boolean } {
  if (tarif.soli_freigrenze === null) {
    return { betrag: 0, unsicher: est > 15_000 }
  }
  if (est <= tarif.soli_freigrenze) return { betrag: 0, unsicher: false }
  return {
    betrag: eur(Math.min(0.055 * est, 0.119 * (est - tarif.soli_freigrenze))),
    unsicher: false,
  }
}

/**
 * Welche Zone ein zu versteuerndes Einkommen trifft. Nur fuer die Erklaerung
 * gegenueber dem Nutzer -- gerechnet wird immer mit der Formel.
 */
export function zone(zvE: number, tarif: Tarif): 1 | 2 | 3 | 4 | 5 {
  if (zvE <= tarif.grundfreibetrag) return 1
  if (zvE <= tarif.zone2_bis) return 2
  if (zvE <= tarif.zone3_bis) return 3
  if (zvE <= tarif.zone4_bis) return 4
  return 5
}
