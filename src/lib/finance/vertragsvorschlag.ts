import type { Frequenz, Kandidat } from './wiederkehrend.ts'

/**
 * Aus einem erkannten Muster (wiederkehrend.ts) wird ein Vertragsentwurf, der per Klick angelegt werden kann.
 * Rein, ohne Datenbank. Nichts davon ist endgültig: der Vertrag lässt sich danach wie jeder andere bearbeiten.
 */

export type Vertragsentwurf = {
  name: string
  type: string
  frequency: Frequenz
  amount: number
  billing_day: number | null
  start_date: string
  account_id: string | null
  category_id: string | null
  notes: string
}

/** Kategorien dieser Wurzel gelten als Abos: dort heißt die Unterkategorie meist schon wie der Anbieter. */
const ABO_WURZEL = /^abo/i
/** Sammelkategorien tragen keinen Anbieternamen. */
const SAMMEL = /^(sonstige|abo|tools|business|freizeit|shopping|lebenserhaltung)/i

/**
 * Der Name des Vertrags. Ist die Kategorie eine Abo-Unterkategorie mit eigenem Namen ("Vercel", "Amazon Prime", "Claude / Anthropic"),
 * nimmt der Vorschlag diesen: er ist kürzer und genau so, wie du ihn selbst benennst. Sonst der erkannte Händlername.
 */
export function vertragsName(k: Pick<Kandidat, 'bezeichnung' | 'kategorie_name' | 'kategorie_wurzel'>): string {
  const kat = k.kategorie_name?.trim()
  if (kat && k.kategorie_wurzel && ABO_WURZEL.test(k.kategorie_wurzel) && !ABO_WURZEL.test(kat) && !SAMMEL.test(kat)) return kat.slice(0, 200)
  return k.bezeichnung.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Vertragstyp aus Kategorie und Name; im Zweifel Abonnement (das ist der Zweck der Vorschläge), bei Anlagen der passende Überweisungstyp. */
export function vertragsTyp(k: Pick<Kandidat, 'bezeichnung' | 'kategorie_name' | 'kategorie_wurzel'>): string {
  const text = `${k.bezeichnung} ${k.kategorie_name ?? ''} ${k.kategorie_wurzel ?? ''}`.toLowerCase()
  if (/bauspar|schwäbisch hall|schwaebisch hall|lbs|wüstenrot|wuestenrot/.test(text)) return 'building_savings'
  if (/versicherung|haftpflicht|krankenkasse|allianz|huk|debeka/.test(text)) return 'insurance'
  if (/miete|warmmiete|kaltmiete/.test(text)) return 'rental'
  if (/strom|gas|wasser|stadtwerke|internet|telekom|vodafone|o2|kernenergie/.test(text)) return 'utility'
  if (/kredit|darlehen|tilgung/.test(text)) return 'loan'
  if (/sparplan|etf|depot/.test(text)) return 'savings_plan'
  if (k.kategorie_wurzel && ABO_WURZEL.test(k.kategorie_wurzel)) return 'subscription'
  return 'subscription'
}

export function vertragsEntwurf(
  k: Pick<Kandidat, 'bezeichnung' | 'kategorie_name' | 'kategorie_wurzel' | 'frequenz' | 'betrag' | 'tag_im_monat' | 'erste_buchung' | 'konto_id' | 'kategorie_id' | 'betrag_variabel' | 'betrag_min' | 'betrag_max' | 'anzahl'>,
): Vertragsentwurf {
  const hinweis = k.betrag_variabel
    ? `Nutzungsabhängig: zwischen ${Math.round(k.betrag_min)} und ${Math.round(k.betrag_max)} €, hier der Median.`
    : ''
  return {
    name: vertragsName(k),
    type: vertragsTyp(k),
    frequency: k.frequenz,
    amount: k.betrag,
    billing_day: k.tag_im_monat,
    start_date: k.erste_buchung,
    account_id: k.konto_id,
    category_id: k.kategorie_id,
    notes: `Aus ${k.anzahl} Buchungen erkannt. ${hinweis}`.trim(),
  }
}

/** Auf den Monat umgerechnet, damit sich Vorschläge verschiedener Intervalle zusammenzählen lassen. */
export function proMonat(betrag: number, frequenz: string): number {
  const faktor: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  return betrag * (faktor[frequenz] ?? 1)
}
