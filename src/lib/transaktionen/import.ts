/**
 * CSV-Import der Transaktionen: Text einlesen, Spalten erkennen, Zeilen prüfen, Duplikate finden.
 * Rein (kein React, kein Netz) und getestet in import.test.ts.
 *
 * Gegenüber dem alten Dialog behoben:
 * - Anführungszeichen: `""` im Feld und Zeilenumbrüche in Feldern zerrissen die Tabelle.
 * - Die Spalte „Betrag“ wurde per `includes` gesucht und traf bei der Sparkasse (CAMT) zuerst
 *   „Lastschrift Ursprungsbetrag“ — leer, also Betrag 0, die Zeile fiel still weg.
 * - Zweistellige Jahre (`01.02.26`, Sparkasse) kamen unverändert durch und wurden erst vom Server
 *   abgelehnt; dessen Fehlerliste zeigte der Dialog nie an.
 * - Kopfzeilen vor der Tabelle (ING schreibt mehrere Zeilen Kontoinfo davor) machten das Format
 *   „unbekannt“.
 * - Beträge wie `1234.56` machte der Bank-Parser zu 123456 (alle Punkte weg).
 * - Ungültige Zeilen verschwanden still; jetzt gibt es eine Liste mit Zeilennummer und Grund.
 */

import { CSV_BOM, parseCsvAmount } from '../csv.ts'

// ─── Kodierung ────────────────────────────────────────────────────────────────

/**
 * Bytes → Text, ohne die Kodierung zu raten: UTF-8-BOM eindeutig; sonst strikt UTF-8 versuchen,
 * scheitert das, ist es Windows-1252 (Banken, ältere Excel-Exporte). UTF-16-BOM (Excel „Unicode-Text“)
 * wird ebenfalls erkannt.
 */
export function decodeCsv(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

// ─── Tabelle lesen ────────────────────────────────────────────────────────────

/** Anzahl `sep` außerhalb von Anführungszeichen in einer Zeile. */
function zaehleTrenner(zeile: string, sep: string): number {
  let n = 0
  let inQuotes = false
  for (const c of zeile) {
    if (c === '"') inQuotes = !inQuotes
    else if (c === sep && !inQuotes) n++
  }
  return n
}

/**
 * Trenner: `;` (deutsches Excel/Banken), sonst Tab, sonst `,`. Gewählt wird der erste, der in einer der
 * ersten Zeilen mindestens zweimal vorkommt — Kommas stehen in deutschen Dateien in jedem Betrag und
 * dürfen den Strichpunkt nicht überstimmen.
 */
export function erkenneTrenner(text: string): string {
  const zeilen = text.split(/\r\n|\n|\r/).filter(z => z.trim()).slice(0, 30)
  for (const sep of [';', '\t', ',']) {
    if (zeilen.some(z => zaehleTrenner(z, sep) >= 2)) return sep
  }
  for (const sep of [';', '\t', ',']) {
    if (zeilen.some(z => zaehleTrenner(z, sep) >= 1)) return sep
  }
  return ';'
}

/**
 * Text → Zeilen aus Feldern. Zeichenweise, damit `""` (ein Anführungszeichen im Feld) und Zeilenumbrüche
 * in Anführungszeichen stimmen. Komplett leere Datensätze fallen weg; `nr` ist die Nummer des Datensatzes
 * in der Datei (1 = erste Zeile), auch wenn Leerzeilen davor stehen.
 */
export function parseCsvText(text: string, sep = erkenneTrenner(text)): { nr: number; felder: string[] }[] {
  const s = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text
  const out: { nr: number; felder: string[] }[] = []
  let felder: string[] = []
  let feld = ''
  let inQuotes = false
  let nr = 1

  const feldEnde = () => { felder.push(feld.trim()); feld = '' }
  const zeilenEnde = () => {
    feldEnde()
    if (felder.some(f => f !== '')) out.push({ nr, felder })
    felder = []
    nr++
  }

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { feld += '"'; i++ } else inQuotes = false
      } else feld += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === sep) {
      feldEnde()
    } else if (c === '\r') {
      if (s[i + 1] === '\n') i++
      zeilenEnde()
    } else if (c === '\n') {
      zeilenEnde()
    } else {
      feld += c
    }
  }
  if (feld !== '' || felder.length > 0) zeilenEnde()
  return out
}

// ─── Spalten ──────────────────────────────────────────────────────────────────

/** Kopfzeile vergleichbar machen: klein, Umlaute aufgelöst, Sternchen und Leerraum weg. */
export function normalisiereKopf(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[*]/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Spaltenindex zu einer Liste von Namen in Prioritätsreihenfolge: erst genau, dann „beginnt mit“.
 * Bewusst KEIN „enthält“ — „Lastschrift Ursprungsbetrag“ ist nicht der Betrag.
 */
function finde(kopf: string[], namen: string[]): number {
  for (const name of namen) {
    const i = kopf.findIndex(k => k === name)
    if (i >= 0) return i
  }
  for (const name of namen) {
    const i = kopf.findIndex(k => k.startsWith(name + ' ') || k.startsWith(name + '('))
    if (i >= 0) return i
  }
  return -1
}

export interface Spalten {
  datum: number
  betrag: number
  soll: number
  haben: number
  beschreibung: number
  buchungstext: number
  haendler: number
  empfaenger: number
  zahler: number
  kategorie: number
  waehrung: number
}

const DATUM = ['buchungstag', 'buchungsdatum', 'datum', 'date', 'buchung', 'bu.tag', 'valuta', 'valutadatum', 'wertstellung']
const BETRAG = ['betrag', 'umsatz', 'amount', 'umsatzbetrag']

export function findeSpalten(kopfRoh: string[]): Spalten {
  const kopf = kopfRoh.map(normalisiereKopf)
  const betrag = finde(kopf, BETRAG)
  // „Währung“ steht bei ING zweimal (nach Saldo und nach Betrag): die direkt nach dem Betrag gilt.
  let waehrung = -1
  for (let i = Math.max(betrag, 0); i < kopf.length; i++) {
    if (kopf[i] === 'waehrung' || kopf[i] === 'currency') { waehrung = i; break }
  }
  if (waehrung < 0) waehrung = finde(kopf, ['waehrung', 'currency'])
  return {
    datum: finde(kopf, DATUM),
    betrag,
    soll: finde(kopf, ['soll']),
    haben: finde(kopf, ['haben']),
    beschreibung: finde(kopf, ['verwendungszweck', 'beschreibung', 'description', 'buchungsinformationen', 'text']),
    buchungstext: finde(kopf, ['buchungstext', 'buchungsart', 'umsatztyp']),
    haendler: finde(kopf, [
      'haendler', 'merchant', 'beguenstigter/zahlungspflichtiger', 'auftraggeber/empfaenger', 'auftraggeber / beguenstigter',
      'empfaenger/auftraggeber', 'name zahlungsbeteiligter', 'name', 'beguenstigter', 'auftraggeber', 'empfaenger',
    ]),
    empfaenger: finde(kopf, ['zahlungsempfaenger', 'zahlungsempfaenger/in', 'zahlungsempfaengerin', 'glaeubigername']),
    zahler: finde(kopf, ['zahlungspflichtige', 'zahlungspflichtige/r', 'zahlungspflichtiger']),
    kategorie: finde(kopf, ['kategorie', 'category']),
    waehrung,
  }
}

/** Taugt diese Zeile als Kopfzeile? Datum UND (Betrag ODER Soll/Haben). */
function istKopf(sp: Spalten): boolean {
  return sp.datum >= 0 && (sp.betrag >= 0 || (sp.soll >= 0 && sp.haben >= 0))
}

export function formatName(kopfRoh: string[]): string {
  const k = kopfRoh.map(normalisiereKopf)
  const hat = (s: string) => k.some(x => x === s || x.startsWith(s))
  if (hat('beguenstigter/zahlungspflichtiger') && hat('buchungstag')) return 'Sparkasse'
  if (hat('auftraggeber/empfaenger') && hat('valuta')) return 'ING'
  if ((hat('buchungsdatum') || hat('buchungstag')) && (hat('zahlungsempfaenger') || hat('glaeubiger'))) return 'DKB'
  if (hat('buchungsdatum') && hat('umsatz')) return 'Raiffeisenbank'
  if (hat('datum') && hat('betrag') && (hat('haendler') || hat('kategorie'))) return 'Athena'
  return 'Allgemein'
}

// ─── Werte ────────────────────────────────────────────────────────────────────

/** Datum → `YYYY-MM-DD`, oder `null` wenn kein echtes Datum. Tag zuerst bei Punkt/Schrägstrich (deutsch). */
export function parseDatum(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  let j: number, m: number, t: number
  let mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (mt) { j = +mt[1]; m = +mt[2]; t = +mt[3] }
  else if ((mt = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[T\s,].*)?$/))) { t = +mt[1]; m = +mt[2]; j = +mt[3] }
  else if ((mt = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})(?:[T\s,].*)?$/))) { t = +mt[1]; m = +mt[2]; j = 2000 + +mt[3]; if (+mt[3] >= 70) j -= 100 }
  else if ((mt = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) { j = +mt[1]; m = +mt[2]; t = +mt[3] }
  else return null
  if (j < 1970 || j > 2100 || m < 1 || m > 12 || t < 1) return null
  if (t > new Date(Date.UTC(j, m, 0)).getUTCDate()) return null
  return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`
}

/**
 * Betrag → Zahl, oder `null` wenn nicht lesbar. Deutsch (`1.234,56`) und englisch (`1234.56`),
 * `S`/`H`-Zusatz (Soll = negativ), nachgestelltes Minus (`12,50-`), Währungszeichen.
 */
export function parseBetrag(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  let negativ = false
  if (/\s+S$/.test(s)) { negativ = true; s = s.replace(/\s+S$/, '') }
  else if (/\s+H$/.test(s)) s = s.replace(/\s+H$/, '')
  if (/-$/.test(s)) { negativ = true; s = s.slice(0, -1).trim() }
  s = s.replace(/[\s ]/g, '').replace(/^\+/, '')
  if (!/^-?[\d.,]+(EUR|€)?$/i.test(s)) return null
  const v = parseCsvAmount(s)
  // parseCsvAmount liefert bei Unlesbarem 0 — echte Nullen sehen aus wie 0, 0,00 …
  if (v === 0 && !/^-?0+([.,]0+)?(EUR|€)?$/i.test(s)) return null
  if (!Number.isFinite(v)) return null
  return negativ ? -Math.abs(v) : v
}

// ─── Zeilen ───────────────────────────────────────────────────────────────────

export interface ImportZeile {
  /** Nummer des Datensatzes in der Datei (1 = Kopfzeile oder erste Zeile). */
  nr: number
  date: string
  amount: number
  description?: string
  merchant?: string
  category_name?: string
}

export interface ZeilenFehler {
  nr: number
  grund: string
  /** Zur Anzeige: gekürzter Rohinhalt der Zeile. */
  roh: string
}

export interface LeseErgebnis {
  format: string
  zeilen: ImportZeile[]
  fehler: ZeilenFehler[]
}

export type LeseFehler = { fehler: string }

const KOPF_SUCHE_ZEILEN = 30

function kuerze(s: string, n: number): string | undefined {
  const t = s.trim()
  return t ? t.slice(0, n) : undefined
}

/** Ganze Datei → Buchungszeilen und Fehlerzeilen, oder ein Gesamtfehler (leer, Format unbekannt). */
export function leseImportText(text: string): LeseErgebnis | LeseFehler {
  const tabelle = parseCsvText(text)
  if (tabelle.length === 0) return { fehler: 'Die Datei scheint leer zu sein.' }

  let kopfIdx = -1
  let sp: Spalten | null = null
  for (let i = 0; i < Math.min(tabelle.length, KOPF_SUCHE_ZEILEN); i++) {
    const kandidat = findeSpalten(tabelle[i].felder)
    if (istKopf(kandidat)) { kopfIdx = i; sp = kandidat; break }
  }
  if (kopfIdx < 0 || !sp) {
    return {
      fehler: 'Die Spalten Datum und Betrag wurden nicht gefunden. Erwartet wird eine Kopfzeile mit z. B. „Buchungstag“/„Datum“ und „Betrag“ (Athena, Sparkasse, DKB, ING, Raiffeisenbank oder ähnlich).',
    }
  }

  const kopf = tabelle[kopfIdx].felder
  const format = formatName(kopf)
  const zeilen: ImportZeile[] = []
  const fehler: ZeilenFehler[] = []
  const feld = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '') : '')

  for (const { nr, felder } of tabelle.slice(kopfIdx + 1)) {
    const roh = felder.join(' | ').slice(0, 120)
    const date = parseDatum(feld(felder, sp.datum))
    if (!date) {
      fehler.push({ nr, grund: `Datum nicht lesbar: „${feld(felder, sp.datum) || 'leer'}“`, roh })
      continue
    }

    let amount: number | null
    if (sp.betrag >= 0) {
      amount = parseBetrag(feld(felder, sp.betrag))
    } else {
      const sollRoh = feld(felder, sp.soll)
      const habenRoh = feld(felder, sp.haben)
      // Leer heißt 0; ein NICHT lesbarer Text ist ein Fehler (vorher als 0 gewertet: ein kaputtes Soll mit
      // Haben 5 wurde als +5 gebucht).
      const soll = sollRoh === '' ? 0 : parseBetrag(sollRoh)
      const haben = habenRoh === '' ? 0 : parseBetrag(habenRoh)
      amount = (sollRoh === '' && habenRoh === '') || soll === null || haben === null ? null : haben - Math.abs(soll)
    }
    if (amount === null) {
      fehler.push({ nr, grund: `Betrag nicht lesbar: „${feld(felder, sp.betrag) || 'leer'}“`, roh })
      continue
    }
    if (amount === 0) {
      fehler.push({ nr, grund: 'Betrag ist 0', roh })
      continue
    }

    const waehrung = feld(felder, sp.waehrung).trim().toUpperCase()
    if (waehrung && waehrung !== 'EUR' && waehrung !== '€') {
      fehler.push({ nr, grund: `Währung ${waehrung} wird nicht unterstützt (nur EUR)`, roh })
      continue
    }

    // Sparkasse: „Buchungstext“ ist die Art („FOLGELASTSCHRIFT“), der Verwendungszweck der eigentliche Text.
    const beschreibung = kuerze(feld(felder, sp.beschreibung), 500) ?? kuerze(feld(felder, sp.buchungstext), 500)
    // DKB neu: Zahler und Empfänger stehen in getrennten Spalten; es zählt die Gegenseite.
    let haendler = feld(felder, sp.haendler)
    if (!haendler && (sp.empfaenger >= 0 || sp.zahler >= 0)) {
      haendler = amount < 0 ? feld(felder, sp.empfaenger) : feld(felder, sp.zahler)
      if (!haendler) haendler = feld(felder, sp.empfaenger) || feld(felder, sp.zahler)
    }

    zeilen.push({
      nr,
      date,
      amount,
      description: beschreibung,
      merchant: kuerze(haendler, 200),
      category_name: kuerze(feld(felder, sp.kategorie), 100),
    })
  }

  if (zeilen.length === 0 && fehler.length === 0) return { fehler: 'Die Datei enthält keine Buchungszeilen unter der Kopfzeile.' }
  return { format, zeilen, fehler }
}

// ─── Duplikate ────────────────────────────────────────────────────────────────

export type DuplikatStatus = 'neu' | 'vorhanden' | 'aehnlich'

export interface VorhandeneBuchung {
  /** Datum der View (bei Bankbuchungen die Wertstellung). */
  date: string
  /** Buchungstag; die CSV nennt meist den Buchungstag, die View führt die Wertstellung. */
  bookedDate?: string | null
  /** Mit Vorzeichen: Einnahme positiv, Ausgabe negativ. */
  amount: number
  description?: string | null
  merchant?: string | null
}

const cents = (n: number) => Math.round(n * 100)

/** Text vergleichbar machen: klein, nur Buchstaben und Ziffern. */
export function normalisiereText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '')
}

function texte(a: { description?: string | null; merchant?: string | null }): string[] {
  return [normalisiereText(a.description), normalisiereText(a.merchant)].filter(Boolean)
}

/** Gleich, oder einer enthält den anderen (Bank-Sync liefert oft längeren Text als die CSV), ab 5 Zeichen. */
export function textGleich(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true
      const [kurz, lang] = x.length <= y.length ? [x, y] : [y, x]
      if (kurz.length >= 5 && lang.includes(kurz)) return true
    }
  }
  return false
}

/**
 * Pro Importzeile: `vorhanden` (gleiches Datum + Betrag + Text), `aehnlich` (gleiches Datum + Betrag,
 * Text weicht ab oder fehlt) oder `neu`. Jede vorhandene Buchung zählt nur EINMAL: zwei gleiche Kaffee-
 * Käufe am selben Tag sind in der Datei zwei Zeilen, bei einer vorhandenen also eine neu.
 */
export function pruefeDuplikate(zeilen: ImportZeile[], vorhanden: VorhandeneBuchung[]): DuplikatStatus[] {
  type Eintrag = { cents: number; texte: string[]; benutzt: boolean }
  const nachTag = new Map<string, Eintrag[]>()
  const ablegen = (tag: string, e: Eintrag) => {
    const liste = nachTag.get(tag) ?? []
    if (!liste.includes(e)) liste.push(e)
    nachTag.set(tag, liste)
  }
  for (const v of vorhanden) {
    // Dasselbe Objekt unter Wertstellung UND Buchungstag: so zählt es einmal, egal welches Datum die CSV nennt
    // (bei 6,6 % der Bankbuchungen weichen beide ab — die CSV führt den Buchungstag, die View die Wertstellung).
    const e: Eintrag = { cents: cents(v.amount), texte: texte(v), benutzt: false }
    ablegen(v.date, e)
    if (v.bookedDate) ablegen(v.bookedDate, e)
  }

  const status: DuplikatStatus[] = zeilen.map(() => 'neu')

  // Durchgang 1: Datum + Betrag (mit Vorzeichen) + Text.
  zeilen.forEach((z, i) => {
    const t = texte(z)
    const treffer = (nachTag.get(z.date) ?? []).find(v => !v.benutzt && v.cents === cents(z.amount) && textGleich(t, v.texte))
    if (treffer) { treffer.benutzt = true; status[i] = 'vorhanden' }
  })

  // Durchgang 2: Datum + Betrag (Vorzeichen egal), Text abweichend.
  zeilen.forEach((z, i) => {
    if (status[i] !== 'neu') return
    const treffer = (nachTag.get(z.date) ?? []).find(v => !v.benutzt && Math.abs(v.cents) === Math.abs(cents(z.amount)))
    if (treffer) { treffer.benutzt = true; status[i] = 'aehnlich' }
  })

  // Durchgang 3: bis zu drei Tage daneben (Wochenende/Feiertag zwischen Buchung und Wertstellung), aber
  // gleicher Betrag MIT Vorzeichen und gleicher Text. Nur „ähnlich“ (nicht vorausgewählt), nie „vorhanden“.
  zeilen.forEach((z, i) => {
    if (status[i] !== 'neu') return
    const t = texte(z)
    for (let d = -3; d <= 3; d++) {
      if (d === 0) continue
      const treffer = (nachTag.get(tagVerschoben(z.date, d)) ?? []).find(
        v => !v.benutzt && v.cents === cents(z.amount) && textGleich(t, v.texte),
      )
      if (treffer) { treffer.benutzt = true; status[i] = 'aehnlich'; break }
    }
  })

  return status
}

/** Kalendertag um `delta` Tage verschoben (YYYY-MM-DD, ohne Zeitzonen-Rechnung). */
export function tagVerschoben(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Frühestes und spätestes Datum, für die Abfrage vorhandener Buchungen. */
export function datumsSpanne(zeilen: { date: string }[]): { von: string; bis: string } | null {
  if (zeilen.length === 0) return null
  let von = zeilen[0].date
  let bis = zeilen[0].date
  for (const z of zeilen) {
    if (z.date < von) von = z.date
    if (z.date > bis) bis = z.date
  }
  return { von, bis }
}

// ─── Eingabe in der Filterleiste ──────────────────────────────────────────────

/**
 * Betragsfeld der Filterleiste: `12,50`, `12.50`, `1.250,5`, leer. Gibt den Wert für die Adresszeile
 * (`12.5`, Punkt) zurück: `''` bei leerem Feld, `null` bei ungültiger Eingabe (negativ, Buchstaben).
 */
export function parseBetragFilter(eingabe: string): string | null {
  const s = eingabe.trim().replace(/\s/g, '')
  if (s === '') return ''
  if (!/^[\d.,]+$/.test(s)) return null
  const v = parseCsvAmount(s)
  if (!Number.isFinite(v) || v < 0 || v >= 1e12) return null
  if (v === 0 && !/^0+([.,]0*)?$/.test(s)) return null
  return String(v)
}
