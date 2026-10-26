import { berlinTagNummer } from '../assistant/session-gruppen.ts'
import type {
  KontenGruppe,
  KontenKennzahlen,
  KontoGruppeKey,
  KontoStand,
  KontoVerlauf,
  KontoZeile,
} from '@/lib/konten/typen'

/**
 * Reine Berechnungen für die Konten-Liste: Gruppen, Summen, Frische. Ohne Supabase und ohne
 * Browser — die Seite reicht fertige Daten herein, die Tests laden die Datei direkt.
 */

export const TYP_LABELS: Record<string, string> = {
  checking: 'Girokonto',
  savings: 'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment: 'Depot',
  crypto: 'Krypto',
  cash: 'Bargeld',
  credit: 'Kreditkarte',
  other: 'Sonstiges',
}

export const GRUPPEN: { key: KontoGruppeKey; label: string; typen: string[] }[] = [
  { key: 'giro', label: 'Giro & Bargeld', typen: ['checking', 'cash'] },
  { key: 'sparen', label: 'Sparen & Bauspar', typen: ['savings', 'building_savings'] },
  { key: 'anlage', label: 'Anlage', typen: ['investment', 'crypto'] },
  { key: 'sonstige', label: 'Kredit & Sonstiges', typen: ['credit', 'other'] },
]

export function gruppeVon(type: string): KontoGruppeKey {
  return GRUPPEN.find((g) => g.typen.includes(type))?.key ?? 'sonstige'
}

/** `liquide`, `gebunden` oder keins von beiden (Kredit/Sonstiges zählt nur zum Gesamt). */
function bucketVon(type: string): 'liquide' | 'gebunden' | null {
  if (type === 'checking' || type === 'cash' || type === 'savings') return 'liquide'
  if (type === 'building_savings' || type === 'investment' || type === 'crypto') return 'gebunden'
  return null
}

const rund2 = (n: number) => Math.round(n * 100) / 100

/** Bank-Saldo gegen Buchungssumme: unter einem halben Cent ist es dasselbe. */
export function abweichungVon(saldo: number | null, buchungssumme: number | null): number | null {
  if (saldo === null || buchungssumme === null) return null
  const d = rund2(saldo - buchungssumme)
  return Math.abs(d) < 0.005 ? null : d
}

export interface KontoEingabe {
  id: string
  name: string
  type: string
  institution: string | null
  currency: string
  color: string | null
  iban: string | null
  bank_iban: string | null
  is_active: boolean
  sort_order: number
}

export interface BankInfo {
  gebucht: number
  fetchedAt: string
}

/** Baut die Zeilen der Liste aus den Rohdaten der Loader. */
export function baueKontoZeilen(eingabe: {
  konten: KontoEingabe[]
  /** Kontostand je Konto (Bank-Saldo, sonst Buchungssumme) — `computeAccountBalances`. */
  salden: Map<string, number>
  /** Summe aller Buchungen je Konto (manuell + Bank). */
  buchungssummen: Map<string, number>
  bankByIban: Map<string, BankInfo>
  /** Datum der letzten Buchung je Konto (YYYY-MM-DD). */
  letzteBuchung: Map<string, string>
  verlauf: Map<string, KontoVerlauf>
}): KontoZeile[] {
  return eingabe.konten.map((k) => {
    const bank = k.bank_iban ? eingabe.bankByIban.get(k.bank_iban) : undefined
    const istBank = Boolean(k.bank_iban)
    const saldo = eingabe.salden.get(k.id) ?? null
    const summe = eingabe.buchungssummen.get(k.id) ?? null
    const verlauf = eingabe.verlauf.get(k.id) ?? null
    const werte = verlauf?.values ?? []
    const letzte = eingabe.letzteBuchung.get(k.id)
    const stand: KontoStand | null = bank
      ? { art: 'sync', wert: bank.fetchedAt }
      : letzte
        ? { art: 'buchung', wert: letzte }
        : null
    return {
      id: k.id,
      name: k.name,
      type: k.type,
      institution: k.institution,
      currency: k.currency,
      color: k.color,
      iban: k.iban,
      bankIban: k.bank_iban,
      aktiv: k.is_active,
      sortOrder: k.sort_order,
      saldo,
      istBank,
      buchungssumme: summe,
      abweichung: bank ? abweichungVon(bank.gebucht, summe) : null,
      stand,
      verlauf,
      delta: werte.length >= 2 ? rund2(werte[werte.length - 1] - werte[0]) : null,
    }
  })
}

/** Gruppen der Liste; leere entfallen, inaktive Konten nur mit `inaktive`. */
export function gruppiereKonten(zeilen: KontoZeile[], inaktive: boolean): KontenGruppe[] {
  const sichtbar = zeilen.filter((z) => z.aktiv || inaktive)
  return GRUPPEN.map((g) => {
    const konten = sichtbar
      .filter((z) => gruppeVon(z.type) === g.key)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'))
    const eur = konten.filter((z) => z.aktiv && z.currency === 'EUR')
    return {
      key: g.key,
      label: g.label,
      konten,
      summe: rund2(eur.reduce((s, z) => s + (z.saldo ?? 0), 0)),
      fremdwaehrung: konten.filter((z) => z.aktiv && z.currency !== 'EUR').length,
    }
  }).filter((g) => g.konten.length > 0)
}

export function kontenKennzahlen(zeilen: KontoZeile[]): KontenKennzahlen {
  const aktiv = zeilen.filter((z) => z.aktiv)
  const eur = aktiv.filter((z) => z.currency === 'EUR')
  let liquide = 0
  let gebunden = 0
  let imMinus = 0
  let gesamt = 0
  let delta = 0
  let hatDelta = false
  for (const z of eur) {
    const s = z.saldo ?? 0
    gesamt += s
    const b = bucketVon(z.type)
    if (b === 'liquide') liquide += s
    else if (b === 'gebunden') gebunden += s
    if (s < 0) imMinus += -s
    if (z.delta !== null) {
      delta += z.delta
      hatDelta = true
    }
  }
  return {
    gesamt: rund2(gesamt),
    liquide: rund2(liquide),
    gebunden: rund2(gebunden),
    imMinus: rund2(imMinus),
    delta: hatDelta ? rund2(delta) : null,
    anzahlAktiv: aktiv.length,
    anzahlInaktiv: zeilen.length - aktiv.length,
    fremdwaehrung: aktiv.length - eur.length,
  }
}

/** Kalendertage zwischen zwei Zeitpunkten in Berliner Zeit (`von` ISO mit oder ohne Uhrzeit). */
export function tageSeit(von: string, heute: Date): number {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(von) ? new Date(`${von}T12:00:00Z`) : new Date(von)
  return berlinTagNummer(heute) - berlinTagNummer(d)
}

/** „heute“, „gestern“, „vor 5 Tagen“, „vor 3 Monaten“ — kurz, für die Zweitzeile. */
export function altersText(tage: number): string {
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 60) return `vor ${tage} Tagen`
  const monate = Math.round(tage / 30.4)
  return monate < 24 ? `vor ${monate} Monaten` : `vor ${Math.floor(monate / 12)} Jahren`
}

/**
 * Ab wie vielen Tagen ein Stand als „alt“ gilt: Bank-Sync läuft mehrmals täglich; ein manuelles Konto
 * (Bausparvertrag, Geschäftsanteile) bewegt sich oft nur einmal im Jahr (Zinsgutschrift) — erst danach auffällig.
 */
const ALT_AB_TAGEN = { sync: 3, buchung: 400 } as const

export interface StandAnzeige {
  text: string
  /** `alt` = auffällig (Sync liegt lange zurück, manueller Saldo wird lange nicht angefasst). */
  ton: 'ok' | 'alt'
  tage: number
}

export function standAnzeige(stand: KontoStand | null, heute: Date): StandAnzeige | null {
  if (!stand) return null
  const tage = tageSeit(stand.wert, heute)
  return {
    text: `${stand.art === 'sync' ? 'Sync' : 'Stand'} ${altersText(tage)}`,
    ton: tage > ALT_AB_TAGEN[stand.art] ? 'alt' : 'ok',
    tage,
  }
}

/**
 * Buchung, die den Saldo eines MANUELLEN Kontos auf `ziel` setzt, oder `null`, wenn er schon stimmt.
 *
 * Die Beschreibung beginnt mit „Alter Kontostand“: unified_transactions erkennt daran den
 * `anfangsbestand`, und der zählt weder als Einnahme noch als Ausgabe. Eine Saldoanpassung soll
 * Dashboard, Analyse und Sparquote nicht verfälschen (Zinsen o. ä. bucht man regulär als Einnahme).
 */
export const ANPASSUNG_BESCHREIBUNG = 'Alter Kontostand – Anpassung'

export function saldoAnpassung(
  aktuell: number,
  ziel: number,
  /** Nachkommastellen der Währung (siehe `nachkommastellen`). */
  stellen = 2,
): { type: 'income' | 'expense'; amount: number } | null {
  const faktor = 10 ** stellen
  const diff = Math.round((ziel - aktuell) * faktor) / faktor
  if (diff === 0) return null
  return { type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff) }
}

/**
 * Deutsche Eingabe -> Zahl: „1.234,56“, „1234,5“, „-12“, „1.500“ (Tausenderpunkt) und „1234.56“;
 * alles andere (leer, Buchstaben, Exponent, mehrere Kommas) ergibt `null`.
 */
export function parseDezimal(eingabe: string): number | null {
  let s = eingabe.replace(/[\s€\u00a0]/g, '').replace('\u2212', '-')
  if (s === '' || s === '-') return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  // Ohne Komma: „1.500“ (Punkt, genau drei Ziffern, ggf. mehrfach) ist ein deutscher Tausenderpunkt —
  // sonst würde 1.500 als 1,5 gelesen. „1234.56“ bleibt eine Dezimalzahl.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Krypto-Konten (BTC/ETH) führen ihren Saldo in Bruchteilen eines Cents; alles andere in Cent. */
export function nachkommastellen(waehrung: string): number {
  return waehrung === 'BTC' || waehrung === 'ETH' ? 8 : 2
}
