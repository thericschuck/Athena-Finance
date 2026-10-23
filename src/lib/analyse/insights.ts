import { monthlySeries, INCLUDE_ALL } from '../finance/flow-calc.ts'
import type { FlowRow } from '../finance/flow-calc.ts'
import { fmtCurrency } from '../format.ts'
import { monatPlus } from './vergleich.ts'
import { parteiAnzeigename, parteiSchluesselVon } from './gegenparteien.ts'
import { UNBEKANNT } from '../bank/auswertung.ts'

/**
 * Auffälligkeiten der Analyse-Seite: feste Regeln, die aus den Zahlen, die die Seite ohnehin lädt,
 * kurze Hinweise machen („Reisen +340 % gegenüber deinem Schnitt"). Kein LLM, deterministisch,
 * gleiche Eingabe = gleiche Hinweise. Vorbild für Ton und Struktur: `lib/reminders/regeln.ts`.
 *
 * Leitgedanke: lieber schweigen als raten. Jede Regel hat eine Mindesthistorie (zu wenige
 * Vergleichsmonate = kein Schnitt) und eine Mindestbetragsschwelle (Prozente auf Kleinstbeträgen
 * sind Rauschen). Alle Schwellen stehen unten als benannte Konstanten.
 *
 * Monate ohne Daten: `monthly_flows` liefert keine Nullzeilen, und die Historie beginnt nicht vor
 * dem ersten Import. Ein Monat zählt deshalb nur dann als Vergleichsmonat, wenn es für ihn
 * irgendeine Zeile gibt („Datenmonat"). Fehlt eine Kategorie in einem Datenmonat, sind das echte 0 €;
 * ein Monat ganz ohne Zeilen wird dagegen nie als „0 € Ausgaben" gewertet.
 *
 * Freitexte aus Bankdaten (Händler, Verwendungszweck) kommen nur als Anzeigetext vor: bereinigt,
 * gekürzt und nie als Anweisung oder HTML. Sie landen im Hinweistext, nicht in der Logik.
 *
 * Keine Imports außer relativen .ts-Dateien, damit `node --test` die Datei direkt lädt.
 */

// ── Schwellen ────────────────────────────────────────────────────────────────

/** Vergleichsmonate vor dem betrachteten Monat. */
export const SCHNITT_MONATE = 6
/** Mindestens so viele Datenmonate im Schnitt, sonst schweigen die Schnitt-Regeln. */
export const MIN_VERGLEICHSMONATE = 4

/** Regel 1: Kategorie gegen eigenen Median. */
export const KAT_MIN_BETRAG = 100        // Monatsausgabe mindestens
export const KAT_MIN_SCHNITT = 30        // Median mindestens (sonst ist „+x %" sinnlos)
export const KAT_MIN_ABWEICHUNG = 75     // absolute Abweichung in EUR
export const KAT_FAKTOR_ZU_HOCH = 1.5    // >= 150 % des Schnitts
export const KAT_FAKTOR_ZU_NIEDRIG = 0.5 // <= 50 % des Schnitts

/** Regel 2: Gesamtausgaben/-einnahmen. */
export const GESAMT_MIN_ABWEICHUNG = 150
export const GESAMT_ANTEIL = 0.2         // +-20 %

/** Regel 3: neue Gegenpartei. */
export const PARTEI_FENSTER_TAGE = 30
export const PARTEI_MIN_HISTORIE_TAGE = 90 // Daten müssen so weit zurückreichen, sonst ist „neu" nicht belegbar
export const PARTEI_MIN_BETRAG = 100

/** Regel 4: einzelne große Buchung. */
/** Regel 4 meldet nur Buchungen der letzten Tage — eine Auffaelligkeit von vor elf Monaten ist keine Neuigkeit. */
export const BUCHUNG_MAX_ALTER_TAGE = 45
export const BUCHUNG_MIN_ANZAHL = 8       // Buchungen der Kategorie im Zeitraum
export const BUCHUNG_FAKTOR = 3           // > 3x Median
export const BUCHUNG_MIN_BETRAG = 150
export const BUCHUNG_MAX_HINWEISE = 2

/** Regel 5: Sparquote. */
export const SPAR_MIN_EINNAHMEN = 500     // Einnahmen des Monats mindestens
export const SPAR_MIN_PUNKTE = 15         // Prozentpunkte Abstand zum Schnitt

/** Regel 6: Rekord. */
export const REKORD_MIN_MONATE = 6        // „seit mindestens 6 Monaten"
export const REKORD_MIN_BETRAG = 300

// ── Typen ────────────────────────────────────────────────────────────────────

export type HinweisTon = 'positiv' | 'neutral' | 'warnend'

/** URL-Filter, den ein Klick auf den Hinweis setzt (nicht genannte bleiben unberührt). */
export interface HinweisZiel {
  label: string
  filter: { kat?: string | null; monat?: string | null; tag?: string | null; partei?: string | null }
}

export interface Hinweis {
  /** Stabil: gleiche Lage = gleicher Schlüssel (Regel + Monat/Objekt). */
  key: string
  ton: HinweisTon
  titel: string
  text: string
  /** Grobe Rangzahl: Betragsgröße x Abweichung. Nur zum Sortieren. */
  relevanz: number
  ziel: HinweisZiel | null
}

export interface InsightMonatsZeile extends FlowRow {
  month: string
}

export interface InsightBuchung {
  id: string
  date: string
  type: 'income' | 'expense'
  amount: number
  flow_kind: string
  category_id: string | null
  category_name: string | null
  root_category_id: string | null
  root_category_name: string | null
  description: string | null
  merchant: string | null
}

export interface InsightEingabe {
  /** YYYY-MM-DD */
  heute: string
  locale: string
  /** Untergrenze des Zeitraums (YYYY-MM-DD); null = Alles. Bestimmt, welche Filter-Ziele greifen. */
  cutoff: string | null
  monatsZeilen: InsightMonatsZeile[]
  txns: InsightBuchung[]
  /**
   * Früheste Monatssumme überhaupt (YYYY-MM-01). Dieser Monat ist meist unvollständig (Import
   * mitten im Monat) und geht deshalb weder in einen Schnitt noch in einen Rekordvergleich ein.
   */
  fruehesterMonat?: string | null
  /** IDs der Hauptkategorien vom Typ `neutral` (z. B. Transfers): keine Konsumausgabe, also nie Gegenstand von Regel 1 und 4. */
  neutraleKategorien?: Iterable<string>
}

// ── Hilfen ───────────────────────────────────────────────────────────────────

export function median(werte: number[]): number {
  if (werte.length === 0) return 0
  const s = [...werte].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const eur = (n: number, locale: string) => fmtCurrency(n, 'EUR', locale)
const glatt = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Steuerzeichen raus, Leerraum glätten, kürzen. Nur zur Anzeige als Text gedacht. */
export function kurzText(roh: string, max = 32): string {
  const s = glatt(roh.replace(/[\u0000-\u001f\u007f<>]/g, ' '))
  return s.length > max ? `${s.slice(0, max).trimEnd()} …` : s
}

function monatName(monat: string, locale: string): string {
  const [j, m] = monat.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, 1)).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' })
}

const prozent = (faktor: number) => Math.round((faktor - 1) * 100)
const vorzeichen = (p: number) => (p > 0 ? `+${p}` : `${p}`)

function tagePlus(datum: string, n: number): string {
  const [j, m, t] = datum.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10)
}

/** Ganze Tage von `datum` bis `heute` (beide YYYY-MM-DD, UTC-Kalendertage). */
function tageSeit(datum: string, heute: string): number {
  const t = (x: string) => { const [j, m, d] = x.split('-').map(Number); return Date.UTC(j, m - 1, d) }
  return Math.round((t(heute) - t(datum)) / 86_400_000)
}

/** Ziel nur, wenn der Monat im geladenen Zeitraum liegt — sonst zeigte die Liste „nichts". */
function monatsFilter(monat: string, cutoff: string | null): boolean {
  return cutoff === null || monat >= `${cutoff.slice(0, 7)}-01`
}

function zeilenArt(r: FlowRow): boolean {
  return r.flow_kind === 'echt' || r.flow_kind === 'anlage' || r.flow_kind === 'forderung'
}

const zahl = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Regeln ───────────────────────────────────────────────────────────────────

/** Regeln 1, 2, 5, 6: alles, was an den Monatssummen hängt. */
function monatsRegeln(e: InsightEingabe): Hinweis[] {
  const out: Hinweis[] = []
  const letzter = monatPlus(e.heute, -1) // letzter voller Monat, YYYY-MM-01
  const letzterKey = letzter.slice(0, 7)
  const zeilen = e.monatsZeilen.filter(zeilenArt)
  const erster = e.fruehesterMonat ? e.fruehesterMonat.slice(0, 7) : null
  const neutral = new Set(e.neutraleKategorien ?? [])
  const serie = monthlySeries(zeilen, INCLUDE_ALL)
  const aktuell = serie.find(s => s.month.slice(0, 7) === letzterKey)
  if (!aktuell) return out // für den letzten vollen Monat gibt es keine Daten: schweigen

  // Datenmonate in den SCHNITT_MONATE davor.
  // Der unvollständige Startmonat der Historie fällt heraus; die Mindestzahl wird danach geprüft.
  const basisMonate = Array.from({ length: SCHNITT_MONATE }, (_, i) => monatPlus(letzter, -(i + 1)).slice(0, 7))
    .filter(m => erster === null || m > erster)
  const basisSerie = serie.filter(s => basisMonate.includes(s.month.slice(0, 7)))
  if (basisSerie.length < MIN_VERGLEICHSMONATE) return out
  const basisKeys = basisSerie.map(s => s.month.slice(0, 7))
  const locale = e.locale
  const name = monatName(letzter, locale)
  const mitMonat = monatsFilter(letzter, e.cutoff)
  const monatZiel: HinweisZiel | null = mitMonat ? { label: `Buchungen ${name}`, filter: { monat: letzterKey } } : null

  // Regel 1: Hauptkategorie gegen eigenen Median
  const proKat = new Map<string, { name: string; monate: Map<string, number> }>()
  for (const r of zeilen) {
    const id = r.root_category_id ?? r.category_id ?? null
    if (!id || neutral.has(id)) continue // „Ohne Kategorie" ist keine Auffälligkeit, sondern Aufräumarbeit
    const ex = zahl(r.expense)
    if (ex === 0) continue
    let k = proKat.get(id)
    if (!k) {
      k = { name: r.root_category_name ?? r.category_name ?? 'Kategorie', monate: new Map() }
      proKat.set(id, k)
    }
    const mk = r.month.slice(0, 7)
    k.monate.set(mk, (k.monate.get(mk) ?? 0) + ex)
  }
  for (const [id, k] of proKat) {
    const jetzt = k.monate.get(letzterKey) ?? 0
    const schnitt = median(basisKeys.map(m => k.monate.get(m) ?? 0))
    if (schnitt < KAT_MIN_SCHNITT) continue
    const diff = jetzt - schnitt
    if (Math.abs(diff) < KAT_MIN_ABWEICHUNG) continue
    const faktor = jetzt / schnitt
    const hoch = faktor >= KAT_FAKTOR_ZU_HOCH && jetzt >= KAT_MIN_BETRAG
    const niedrig = faktor <= KAT_FAKTOR_ZU_NIEDRIG
    if (!hoch && !niedrig) continue
    out.push({
      key: `kat-${hoch ? 'ueber' : 'unter'}:${letzterKey}:${id}`,
      ton: hoch ? 'warnend' : 'positiv',
      titel: `${k.name} ${vorzeichen(prozent(faktor))} % gegenüber deinem Schnitt`,
      text: `${name}: ${eur(jetzt, locale)} Ausgaben, dein Median der ${basisKeys.length} Monate davor liegt bei ${eur(schnitt, locale)}.`,
      relevanz: Math.abs(diff) * (1 + Math.min(Math.abs(faktor - 1), 2)),
      ziel: mitMonat ? { label: `${k.name} im ${name}`, filter: { kat: id, monat: letzterKey } } : null,
    })
  }

  // Regel 2: Gesamtausgaben / Einnahmen
  const gesamt = (felde: 'expense' | 'income', label: string, hochTon: HinweisTon, tiefTon: HinweisTon) => {
    const jetzt = aktuell[felde]
    const schnitt = median(basisSerie.map(s => s[felde]))
    if (schnitt <= 0) return
    const diff = jetzt - schnitt
    if (Math.abs(diff) < GESAMT_MIN_ABWEICHUNG || Math.abs(diff) / schnitt < GESAMT_ANTEIL) return
    const hoch = diff > 0
    out.push({
      key: `gesamt-${felde}-${hoch ? 'ueber' : 'unter'}:${letzterKey}`,
      ton: hoch ? hochTon : tiefTon,
      titel: `${label} ${vorzeichen(prozent(jetzt / schnitt))} % gegenüber deinem Schnitt`,
      text: `${name}: ${eur(jetzt, locale)}, dein Median der ${basisSerie.length} Monate davor liegt bei ${eur(schnitt, locale)}.`,
      relevanz: Math.abs(diff) * (1 + Math.min(Math.abs(jetzt / schnitt - 1), 2)),
      ziel: monatZiel,
    })
  }
  gesamt('expense', 'Gesamtausgaben', 'warnend', 'positiv')
  gesamt('income', 'Einnahmen', 'positiv', 'warnend')
  const ausgabenGemeldet = out.some(h => h.key.startsWith('gesamt-expense'))

  // Regel 5: Sparquote (nur Konsum-Basis, wie überall)
  if (aktuell.savingsRate !== null && aktuell.echt.income >= SPAR_MIN_EINNAHMEN) {
    const raten = basisSerie.map(s => s.savingsRate).filter((r): r is number => r !== null)
    if (raten.length >= MIN_VERGLEICHSMONATE) {
      const schnitt = median(raten)
      const diff = aktuell.savingsRate - schnitt
      if (Math.abs(diff) >= SPAR_MIN_PUNKTE) {
        const besser = diff > 0
        out.push({
          key: `sparquote-${besser ? 'besser' : 'schlechter'}:${letzterKey}`,
          ton: besser ? 'positiv' : 'warnend',
          titel: `Sparquote ${besser ? 'deutlich über' : 'deutlich unter'} deinem Schnitt`,
          text: `${name}: ${aktuell.savingsRate} % gespart, im Median der ${raten.length} Monate davor waren es ${Math.round(schnitt)} %.`,
          relevanz: (Math.abs(diff) / 100) * aktuell.echt.income * (1 + Math.min(Math.abs(diff) / 50, 2)),
          ziel: monatZiel,
        })
      }
    }
  }

  // Regel 6: Rekord bei den Monatsausgaben (wenn Regel 2 dasselbe schon sagt, nicht doppelt)
  if (!ausgabenGemeldet && aktuell.expense >= REKORD_MIN_BETRAG) {
    const frueher = serie.filter(s => s.month.slice(0, 7) < letzterKey && (erster === null || s.month.slice(0, 7) > erster)).sort((a, b) => b.month.localeCompare(a.month))
    for (const richtung of ['hoch', 'tief'] as const) {
      let n = 0
      for (const s of frueher) {
        const schlaegt = richtung === 'hoch' ? aktuell.expense > s.expense : aktuell.expense < s.expense
        if (!schlaegt) break
        n += 1
      }
      if (n < REKORD_MIN_MONATE) continue
      const ganz = n === frueher.length
      out.push({
        key: `rekord-${richtung}:${letzterKey}`,
        ton: richtung === 'hoch' ? 'warnend' : 'positiv',
        titel: `${richtung === 'hoch' ? 'Höchste' : 'Niedrigste'} Monatsausgaben ${ganz ? 'seit Beginn deiner Daten' : `seit ${n} Monaten`}`,
        text: `${name}: ${eur(aktuell.expense, locale)} Ausgaben${ganz ? `, so ${richtung === 'hoch' ? 'viel' : 'wenig'} wie in keinem der ${n} Monate davor` : ''}.`,
        relevanz: aktuell.expense * 0.3,
        ziel: monatZiel,
      })
    }
  }
  return out
}

/**
 * Gegenpartei einer Buchung: Name und Schlüssel kommen aus der gemeinsamen Normalisierung
 * (gegenparteien.ts), damit der Filter `partei` überall dieselben Buchungen trifft. `name` ist der
 * Anzeigename (der Wert, der in die URL kommt), `anzeige` die gekürzte, bereinigte Textfassung.
 * Ohne erkennbare Partei („Unbekannt") gibt es keinen Hinweis.
 */
export function parteiVon(t: Pick<InsightBuchung, 'merchant' | 'description'>): { name: string; schluessel: string; anzeige: string } | null {
  const name = parteiAnzeigename(t)
  if (!name || name === UNBEKANNT) return null
  return { name, schluessel: parteiSchluesselVon(t), anzeige: kurzText(name, 40) }
}

/** Regel 3 und 4: Einzelbuchungen (nur echte Konsumbuchungen; Anlage/Forderung sind Bewegungen, keine Ausgabe-Überraschung). */
function buchungsRegeln(e: InsightEingabe, schonKat: Set<string>): Hinweis[] {
  const out: Hinweis[] = []
  const locale = e.locale
  const ausgaben = e.txns.filter(t => t.type === 'expense' && t.flow_kind === 'echt' && t.amount > 0)
  if (ausgaben.length === 0) return out

  // Regel 3: neue Gegenpartei. „Neu" ist nur belegbar, wenn die Daten weit genug zurückreichen.
  const grenze = tagePlus(e.heute, -PARTEI_FENSTER_TAGE)
  const reichweite = tagePlus(e.heute, -PARTEI_MIN_HISTORIE_TAGE)
  const fruehestes = ausgaben.reduce((m, t) => (t.date < m ? t.date : m), ausgaben[0].date)
  const historieOk = fruehestes <= reichweite && (e.cutoff === null || e.cutoff <= reichweite)
  if (historieOk) {
    const parteien = new Map<string, { name: string; partei: string; erste: string; summe: number; anzahl: number }>()
    for (const t of ausgaben) {
      const p = parteiVon(t)
      if (!p) continue
      const z = parteien.get(p.schluessel)
      if (!z) parteien.set(p.schluessel, { name: p.anzeige, partei: p.name, erste: t.date, summe: t.amount, anzahl: 1 })
      else {
        if (t.date < z.erste) z.erste = t.date
        z.summe += t.amount
        z.anzahl += 1
      }
    }
    for (const [schluessel, z] of parteien) {
      if (z.erste < grenze || z.erste > e.heute || z.summe < PARTEI_MIN_BETRAG) continue
      out.push({
        key: `partei-neu:${schluessel}`,
        ton: 'neutral',
        titel: `Neue Gegenpartei: ${z.name}`,
        text: `Erste Buchung am ${z.erste.slice(8, 10)}.${z.erste.slice(5, 7)}., bisher ${eur(z.summe, locale)} in ${z.anzahl} ${z.anzahl === 1 ? 'Buchung' : 'Buchungen'}; in den Monaten davor kam sie nicht vor.`,
        relevanz: z.summe * 1.5,
        ziel: { label: `Buchungen von ${z.name}`, filter: { partei: z.partei } },
      })
    }
  }

  // Regel 4: ungewöhnlich große Einzelbuchung, gemessen am Median der eigenen Hauptkategorie
  const neutral = new Set(e.neutraleKategorien ?? [])
  const proKat = new Map<string, InsightBuchung[]>()
  for (const t of ausgaben) {
    const id = t.root_category_id ?? t.category_id
    if (!id || neutral.has(id)) continue
    const l = proKat.get(id)
    if (l) l.push(t)
    else proKat.set(id, [t])
  }
  const kandidaten: Hinweis[] = []
  for (const [id, liste] of proKat) {
    if (liste.length < BUCHUNG_MIN_ANZAHL) continue
    const med = median(liste.map(t => t.amount))
    if (med <= 0) continue
    // Die Basis (Median) kommt aus allen Buchungen der Kategorie, gemeldet wird nur die juengste Grosse.
    const jung = liste.filter(t => tageSeit(t.date, e.heute) <= BUCHUNG_MAX_ALTER_TAGE)
    if (jung.length === 0) continue
    const groesste = jung.reduce((m, t) => (t.amount > m.amount ? t : m), jung[0])
    if (groesste.amount < BUCHUNG_MIN_BETRAG || groesste.amount <= BUCHUNG_FAKTOR * med) continue
    // Steckt dieselbe Kategorie im selben Monat schon in Regel 1, wäre das doppelt gemeldet.
    if (schonKat.has(`${id}:${groesste.date.slice(0, 7)}`)) continue
    const katName = groesste.root_category_name ?? groesste.category_name ?? 'Kategorie'
    const wer = parteiVon(groesste)
    kandidaten.push({
      key: `buchung-gross:${groesste.id}`,
      ton: 'neutral',
      titel: `Große Buchung in ${katName}: ${eur(groesste.amount, locale)}`,
      text: `${wer ? `${wer.anzeige}, ` : ''}${groesste.date.slice(8, 10)}.${groesste.date.slice(5, 7)}.: ${Math.round(groesste.amount / med)}-mal so viel wie die typische Buchung dieser Kategorie (Median ${eur(med, locale)}).`,
      relevanz: groesste.amount * (1 + Math.min(groesste.amount / med / BUCHUNG_FAKTOR, 2)),
      ziel: { label: 'Buchung ansehen', filter: { kat: id, tag: groesste.date } },
    })
  }
  kandidaten.sort((a, b) => b.relevanz - a.relevanz)
  out.push(...kandidaten.slice(0, BUCHUNG_MAX_HINWEISE))
  return out
}

/** Alle Hinweise, nach Relevanz absteigend (bei Gleichstand nach Schlüssel, damit die Reihenfolge stabil bleibt). */
export function berechneHinweise(e: InsightEingabe): Hinweis[] {
  const monat = monatsRegeln(e)
  const schonKat = new Set(
    monat
      .filter(h => h.key.startsWith('kat-'))
      .map(h => {
        const [, m, id] = h.key.split(':')
        return `${id}:${m}`
      }),
  )
  return [...monat, ...buchungsRegeln(e, schonKat)].sort(
    (a, b) => b.relevanz - a.relevanz || a.key.localeCompare(b.key),
  )
}
