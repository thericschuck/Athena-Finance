/**
 * Reine Logik der Buchungsformulare (Hinzufügen/Bearbeiten): Art (Ausgabe/Einnahme/Umbuchung),
 * Betrag und Datum. Eine Regel für Browser UND Server Action, damit beide dasselbe lesen.
 *
 * Schnittstelle zur Action bleibt das Feld `amount` mit VORZEICHEN: negativ = Ausgabe, positiv = Einnahme
 * (bei Umbuchung egal, es zählt der Betrag). Der Browser baut das Vorzeichen aus dem Umschalter ein.
 */
import { parseDezimal } from '../konten/berechnen.ts'

export type BuchungsArt = 'expense' | 'income' | 'transfer'

/** Obergrenze wie in lib/api/schemas (MAX_AMOUNT). */
export const MAX_BETRAG = 1e12

/** Kalendertag (YYYY-MM-DD) in Berliner Zeit — nie `toISOString()` (UTC, nachts ein Tag daneben). */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt)
}

/**
 * Liest einen Betrag. Maschinenformat („-1234.56“, „1.234“ = 1,234) gilt zuerst, damit der vom Browser
 * kanonisch gesendete Wert nie als deutscher Tausenderpunkt missverstanden wird; sonst gilt die deutsche
 * Schreibweise („1.234,56“, „12,5“, „1.500“ = 1500) über `parseDezimal`. Ungültig → null.
 */
export function betragAusEingabe(text: string): number | null {
  const s = text.trim().replace('−', '-')
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return parseDezimal(s)
}

/**
 * Liest, was ein MENSCH ins Betragsfeld tippt: deutsche Schreibweise zuerst („1.500“ = 1500, „12,5“,
 * „1.234,56“; „1234.56“ bleibt eine Dezimalzahl). Nur der Browser nutzt das — zum Server geht danach
 * der kanonische Wert (`betragMitVorzeichen`), den `betragAusEingabe` eindeutig liest. Vorher galt für
 * beides dieselbe „Maschinenformat zuerst“-Regel, und „1.500“ wurde als 1,50 € gebucht.
 */
export function betragAusNutzereingabe(text: string): number | null {
  return parseDezimal(text.trim())
}

/** Kanonischer Text einer Zahl (Punkt, höchstens 8 Nachkommastellen, nie Exponent). */
export function kanonisch(n: number): string {
  const t = n.toFixed(8).replace(/\.?0+$/, '')
  return t === '-0' || t === '' ? '0' : t
}

/** Betrag fürs Eingabefeld: deutsches Komma, mindestens zwei Nachkommastellen („12,50“). */
export function betragFuerFeld(betrag: number): string {
  const [ganz, nach = ''] = kanonisch(Math.abs(betrag)).split('.')
  return `${ganz},${nach.padEnd(2, '0')}`
}

/** Wert für das Feld `amount` der Action: Betrag aus dem Feld (immer als positiv gelesen) mit Vorzeichen der Art. */
export function betragMitVorzeichen(text: string, art: BuchungsArt): string | null {
  const n = betragAusNutzereingabe(text)
  if (n === null) return null
  const b = Math.abs(n)
  return kanonisch(art === 'expense' ? -b : b)
}

/** Aus dem vorzeichenbehafteten Wert (Action): Typ und gespeicherter, positiver Betrag. */
export function typUndBetrag(
  wert: number,
  istUmbuchung: boolean,
): { type: BuchungsArt; amount: number } {
  return {
    type: istUmbuchung ? 'transfer' : wert >= 0 ? 'income' : 'expense',
    amount: Math.abs(wert),
  }
}

/** Art einer gespeicherten Buchung (unbekannte Typen zählen nach Vorzeichen-Regel als Einnahme). */
export function artAusTyp(type: string): BuchungsArt {
  return type === 'expense' ? 'expense' : type === 'transfer' ? 'transfer' : 'income'
}

export type BuchungsEingabe = {
  betragText: string
  art: BuchungsArt
  date: string
  accountId: string
  transferTo: string
}

/** Prüft die Eingabe vor dem Senden; Meldung oder null. Gleiche Regeln prüft die Action nochmals. */
export function pruefeBuchung(e: BuchungsEingabe): string | null {
  const n = betragAusNutzereingabe(e.betragText)
  if (e.betragText.trim() === '') return 'Betrag eingeben.'
  if (n === null || Math.abs(n) > MAX_BETRAG) return 'Betrag ist ungültig (z. B. 12,50).'
  if (n === 0) return 'Der Betrag darf nicht 0 sein.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Datum wählen.'
  if (!e.accountId) return 'Konto wählen.'
  if (e.art === 'transfer') {
    if (!e.transferTo) return 'Zielkonto wählen.'
    if (e.transferTo === e.accountId) return 'Quell- und Zielkonto müssen verschieden sein.'
  }
  return null
}
