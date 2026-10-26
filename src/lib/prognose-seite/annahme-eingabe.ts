/**
 * Eine Betragsregel und eine Prüfung für das Annahmen-Formular — dieselbe Funktion im Browser (Sofort-
 * Rückmeldung) und in der Server-Action. Beträge in deutscher Schreibweise („1.500“ = 1500,
 * „1.234,56“, „12,5“) über `parseDezimal`; vorher wurde nur das Komma ersetzt, „1.500“ war 1,5 €
 * und „1.500,00“ wurde als ungültig verworfen.
 */
import { parseDezimal } from '../konten/berechnen.ts'

export const ANNAHME_ARTEN_LISTE = ['lohn', 'betriebseinnahme', 'betriebsausgabe', 'einnahme', 'ausgabe'] as const
export type AnnahmeArtEingabe = typeof ANNAHME_ARTEN_LISTE[number]

export type AnnahmeRoh = {
  label: string
  art: string
  von: string
  bis: string
  betrag: string
  brutto: string
}

export type AnnahmeGeprueft = {
  label: string
  art: AnnahmeArtEingabe
  von: string
  bis: string | null
  betrag: number
  brutto: number | null
}

const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/
export const MAX_ANNAHME_BETRAG = 10_000_000

export function pruefeAnnahme(roh: AnnahmeRoh): { ok: true; wert: AnnahmeGeprueft } | { ok: false; fehler: string } {
  const label = roh.label.trim()
  if (!label) return { ok: false, fehler: 'Bitte eine Bezeichnung eintragen.' }
  if (label.length > 80) return { ok: false, fehler: 'Die Bezeichnung darf höchstens 80 Zeichen haben.' }
  const art = ANNAHME_ARTEN_LISTE.find(a => a === roh.art)
  if (!art) return { ok: false, fehler: 'Bitte eine Art wählen.' }
  if (!MONAT.test(roh.von)) return { ok: false, fehler: 'Bitte den ersten Monat wählen (JJJJ-MM).' }
  const bisText = roh.bis.trim()
  if (bisText && !MONAT.test(bisText)) return { ok: false, fehler: 'Der letzte Monat ist ungültig (JJJJ-MM).' }
  if (bisText && bisText < roh.von) return { ok: false, fehler: 'Der letzte Monat liegt vor dem ersten.' }

  const betrag = parseDezimal(roh.betrag.trim())
  if (betrag === null) return { ok: false, fehler: 'Bitte einen Betrag eintragen (z. B. 1.500 oder 1.234,56).' }
  if (betrag < 0) return { ok: false, fehler: 'Der Betrag ist immer positiv; ob es eine Einnahme oder Ausgabe ist, bestimmt die Art.' }
  if (betrag > MAX_ANNAHME_BETRAG) return { ok: false, fehler: 'Der Betrag ist zu groß.' }

  let brutto: number | null = null
  if (art === 'lohn' && roh.brutto.trim()) {
    brutto = parseDezimal(roh.brutto.trim())
    if (brutto === null || brutto < 0 || brutto > MAX_ANNAHME_BETRAG) return { ok: false, fehler: 'Das Brutto ist ungültig.' }
    brutto = Math.round(brutto * 100) / 100
  }
  return {
    ok: true,
    wert: { label, art, von: roh.von, bis: bisText || null, betrag: Math.round(betrag * 100) / 100, brutto },
  }
}
