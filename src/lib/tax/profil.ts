import type { Steuerprofil } from './position.ts'

/**
 * Das Steuerprofil liegt als EIN jsonb-Wert unter dem user_settings-Schluessel
 * `tax_profile` -- kein eigenes Schema, weil user_settings genau dafuer da ist.
 *
 * Der Preis dafuer: was aus der Spalte kommt, ist beliebiges JSON. Deshalb
 * liest es nur diese Funktion, und zwar defensiv. Ein kaputter oder halb
 * gefuellter Wert darf nie dazu fuehren, dass eine Steuerrechnung mit NaN
 * weiterlaeuft.
 */

export type Steuerprofil2 = Steuerprofil & {
  /** Kleinunternehmer nach § 19 UStG -- steuert nur, ob die Grenzen ueberwacht werden. */
  kleinunternehmer: boolean
}

export const STEUERPROFIL_STANDARD: Steuerprofil2 = {
  bruttoJahreslohn: null,
  bruttoStand: null,
  // Ueberschlag fuer den abziehbaren Vorsorgeaufwand: Rentenversicherung voll,
  // Kranken- und Pflegeversicherung im Rahmen der Basisabsicherung. Zusammen
  // liegt das in der Groessenordnung von 19 % des Bruttolohns. Einstellbar,
  // weil es die groesste Unsicherheit der ganzen Rechnung ist.
  vorsorgeAnteilPct: 19,
  kirchensteuerPct: 0,
  // Nur der Notnagel, wenn kein Bruttolohn gepflegt ist: Netto = Brutto x Quote.
  nettoQuote: 0.75,
  kleinunternehmer: true,
}

function zahl(wert: unknown, standard: number, min: number, max: number): number {
  const n = typeof wert === 'string' ? Number(wert) : wert
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return standard
  return n
}

export function leseSteuerprofil(rohwert: unknown): Steuerprofil2 {
  if (rohwert === null || typeof rohwert !== 'object' || Array.isArray(rohwert)) {
    return { ...STEUERPROFIL_STANDARD }
  }
  const o = rohwert as Record<string, unknown>

  const brutto = o.brutto_jahreslohn
  const bruttoZahl = typeof brutto === 'string' ? Number(brutto) : brutto
  const bruttoJahreslohn =
    typeof bruttoZahl === 'number' && Number.isFinite(bruttoZahl) && bruttoZahl > 0
      ? bruttoZahl
      : null

  const stand = o.brutto_stand
  // Nur ein Datum in ISO-Form durchlassen -- der Wert landet in Meldetexten
  // und im Vergleich "aelter als ein Jahr".
  const bruttoStand =
    typeof stand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stand) && !Number.isNaN(Date.parse(stand))
      ? stand
      : null

  return {
    bruttoJahreslohn,
    bruttoStand: bruttoJahreslohn === null ? null : bruttoStand,
    vorsorgeAnteilPct: zahl(o.vorsorge_anteil_pct, STEUERPROFIL_STANDARD.vorsorgeAnteilPct, 0, 50),
    kirchensteuerPct: zahl(o.kirchensteuer_pct, STEUERPROFIL_STANDARD.kirchensteuerPct, 0, 12),
    // Eine Quote von 0 waere eine Division durch null in der Lohn-Schaetzung.
    nettoQuote: zahl(o.netto_quote, STEUERPROFIL_STANDARD.nettoQuote, 0.3, 1),
    kleinunternehmer: typeof o.kleinunternehmer === 'boolean'
      ? o.kleinunternehmer
      : STEUERPROFIL_STANDARD.kleinunternehmer,
  }
}

/** Die Form, in der das Profil in user_settings.value geschrieben wird. */
export function schreibeSteuerprofil(p: Steuerprofil2): Record<string, unknown> {
  return {
    brutto_jahreslohn: p.bruttoJahreslohn,
    brutto_stand: p.bruttoStand,
    vorsorge_anteil_pct: p.vorsorgeAnteilPct,
    kirchensteuer_pct: p.kirchensteuerPct,
    netto_quote: p.nettoQuote,
    kleinunternehmer: p.kleinunternehmer,
  }
}
