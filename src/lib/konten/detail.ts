/**
 * Auswertung der Konto-Detailseite — vorher inline in `finance/accounts/[id]/page.tsx`. Rein: die
 * Seite reicht die Buchungen herein, hier entstehen Kennzahlen, Monats- und Kategorie-Summen,
 * gefilterte/sortierte/seitenweise Tabellenzeilen. Ohne Imports, damit `node --test` die Datei lädt.
 */

/** Was die Auswertung von einer Buchung braucht (Teilmenge der Zeile aus unified_transactions). */
export interface DetailBuchung {
  id: string
  date: string
  type: string
  amount: number
  flow_kind: string
  category_id: string | null
  category_name: string | null
  category_color: string | null
  description: string | null
  merchant: string | null
}

export interface MonatsSumme {
  month: string
  income: number
  /** Negativ, damit die Balken unter der Nulllinie liegen. */
  expense: number
  net: number
}

export interface KategorieSumme {
  name: string
  color: string | null
  total: number
}

export interface GegenparteiSumme {
  name: string
  total: number
  anzahl: number
}

/** Eine einzelne Buchung für die „Größte …“-Listen. */
export interface GrosseBuchung {
  id: string
  date: string
  betrag: number
  titel: string
}

export interface SaldoSpanne {
  tiefst: { date: string; balance: number }
  hoechst: { date: string; balance: number }
}

export interface DetailFilter {
  /** Erster Tag des Zeitraums (YYYY-MM-DD) oder `null` für „Alles“. */
  cutoff: string | null
  /** YYYY-MM — per Klick auf eine Säule im Monatschart. */
  month?: string
  q?: string
  /** Kategorie-ID oder `none`. */
  cat?: string
  /** income | expense | transfer */
  txtype?: string
  /** `date-desc` (Standard) | `date-asc` | `amount-desc` | `amount-asc` */
  sort?: string
  /** 1-basiert. */
  seite?: number
  proSeite?: number
}

export const SEITENGROESSE = 50

/** Umbuchungen und Anfangsbestände sind keine Einnahme/Ausgabe; Anlagen und Forderungen schon. */
export const zaehltAlsFluss = (t: { flow_kind: string }) =>
  t.flow_kind !== 'umbuchung' && t.flow_kind !== 'anfangsbestand'

export interface DetailErgebnis<T extends DetailBuchung> {
  /** Buchungen im Zeitraum (ohne Monatsfilter). */
  imZeitraum: T[]
  einnahmen: number
  ausgaben: number
  netto: number
  /** Gültiger Monatsfilter oder `null` (ein Monat außerhalb des Zeitraums wird verworfen). */
  aktiverMonat: string | null
  /** Buchungen im Zeitraum, ggf. auf den Monat eingegrenzt. */
  imMonat: T[]
  monate: MonatsSumme[]
  topKategorien: KategorieSumme[]
  kategorienMax: number
  genutzteKategorien: string[]
  /** Empfänger/Absender mit den höchsten Ausgaben (Fluss, ohne Umbuchungen), im gewählten Monat bzw. Zeitraum. */
  gegenparteien: GegenparteiSumme[]
  groessteAusgaben: GrosseBuchung[]
  groessteEinnahmen: GrosseBuchung[]
  /** Ø Einnahmen/Ausgaben je Kalendermonat mit Buchungen im Zeitraum; `null` ohne Monate. */
  proMonat: { einnahmen: number; ausgaben: number; monate: number } | null
  /** Nach Suche/Kategorie/Typ gefiltert und sortiert — alle Seiten. */
  tabelle: T[]
  /** Nur die aktuelle Seite. */
  seitenZeilen: T[]
  seite: number
  seiten: number
  gefiltert: boolean
}

/** Name für Listen: Empfänger, sonst Beschreibung, sonst „Ohne Bezeichnung“; eine Zeile, gekürzt. */
export function buchungsTitel(t: { merchant: string | null; description: string | null }): string {
  const roh = (t.merchant?.trim() || t.description?.trim() || 'Ohne Bezeichnung').replace(/\s+/g, ' ')
  return roh.length > 48 ? `${roh.slice(0, 47).trimEnd()}…` : roh
}

/**
 * Tiefster und höchster Stand eines Verlaufs; bei Gleichstand der jüngste Tag (der aktuellere Stand ist
 * der, an den man sich erinnert). `null` bei weniger als zwei Punkten — eine Spanne gibt es dann nicht.
 */
export function saldoSpanne(punkte: { snapshot_date: string; balance: number }[]): SaldoSpanne | null {
  if (punkte.length < 2) return null
  let tiefst = punkte[0]
  let hoechst = punkte[0]
  for (const p of punkte) {
    if (p.balance <= tiefst.balance) tiefst = p
    if (p.balance >= hoechst.balance) hoechst = p
  }
  return {
    tiefst: { date: tiefst.snapshot_date, balance: tiefst.balance },
    hoechst: { date: hoechst.snapshot_date, balance: hoechst.balance },
  }
}

export function rechneDetail<T extends DetailBuchung>(alle: T[], f: DetailFilter): DetailErgebnis<T> {
  const imZeitraum = f.cutoff ? alle.filter((t) => t.date >= f.cutoff!) : alle

  let einnahmen = 0
  let ausgaben = 0
  for (const t of imZeitraum) {
    if (!zaehltAlsFluss(t)) continue
    if (t.type === 'income') einnahmen += t.amount
    else if (t.type === 'expense') ausgaben += t.amount
  }

  const monateImZeitraum = new Set(imZeitraum.map((t) => t.date.slice(0, 7)))
  const aktiverMonat = f.month && monateImZeitraum.has(f.month) ? f.month : null
  const imMonat = aktiverMonat ? imZeitraum.filter((t) => t.date.slice(0, 7) === aktiverMonat) : imZeitraum

  const monatMap = new Map<string, { income: number; expense: number }>()
  for (const t of imZeitraum) {
    if ((t.type !== 'income' && t.type !== 'expense') || !zaehltAlsFluss(t)) continue
    const key = t.date.slice(0, 7)
    const e = monatMap.get(key) ?? { income: 0, expense: 0 }
    if (t.type === 'income') e.income += t.amount
    else e.expense -= t.amount
    monatMap.set(key, e)
  }
  const monate: MonatsSumme[] = [...monatMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.income + v.expense }))

  const katMap = new Map<string, KategorieSumme>()
  for (const t of imMonat) {
    if (t.type !== 'expense' || !zaehltAlsFluss(t)) continue
    const key = t.category_id ?? '__none__'
    const e = katMap.get(key) ?? { name: t.category_name ?? 'Ohne Kategorie', color: t.category_color, total: 0 }
    e.total += t.amount
    katMap.set(key, e)
  }
  const topKategorien = [...katMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)

  // Gegenparteien und größte Einzelbuchungen: nur Fluss (keine Umbuchungen/Anfangsbestände), im gewählten
  // Monat bzw. Zeitraum — dieselbe Basis wie die Kategorien.
  const gegenMap = new Map<string, GegenparteiSumme>()
  for (const t of imMonat) {
    if (t.type !== 'expense' || !zaehltAlsFluss(t)) continue
    const name = buchungsTitel({ merchant: t.merchant, description: null })
    if (name === 'Ohne Bezeichnung') continue
    const e = gegenMap.get(name.toLowerCase()) ?? { name, total: 0, anzahl: 0 }
    e.total += t.amount
    e.anzahl += 1
    gegenMap.set(name.toLowerCase(), e)
  }
  const gegenparteien = [...gegenMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  const flussBuchungen = imMonat.filter((t) => zaehltAlsFluss(t) && (t.type === 'income' || t.type === 'expense'))
  const gross = (typ: 'income' | 'expense'): GrosseBuchung[] =>
    flussBuchungen
      .filter((t) => t.type === typ)
      .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((t) => ({ id: t.id, date: t.date, betrag: t.amount, titel: buchungsTitel(t) }))
  const groessteAusgaben = gross('expense')
  const groessteEinnahmen = gross('income')

  const proMonat = monate.length > 0
    ? {
        einnahmen: monate.reduce((s, m) => s + m.income, 0) / monate.length,
        ausgaben: -monate.reduce((s, m) => s + m.expense, 0) / monate.length,
        monate: monate.length,
      }
    : null

  const genutzteKategorien = [...new Set(imMonat.map((t) => t.category_id).filter((x): x is string => Boolean(x)))]

  const needle = (f.q ?? '').trim().toLowerCase()
  let tabelle = imMonat
  if (needle) {
    tabelle = tabelle.filter(
      (t) =>
        (t.description ?? '').toLowerCase().includes(needle) ||
        (t.merchant ?? '').toLowerCase().includes(needle),
    )
  }
  if (f.cat) {
    tabelle = f.cat === 'none' ? tabelle.filter((t) => t.category_id === null) : tabelle.filter((t) => t.category_id === f.cat)
  }
  if (f.txtype) tabelle = tabelle.filter((t) => t.type === f.txtype)

  // „Nach Betrag“ heißt nach Größe, nicht nach Vorzeichen: 700 € Ausgabe und 700 € Einnahme sind beide
  // „groß“ — wer die größten Posten sucht, will sie beide oben sehen. Gleiche Werte: stabil nach Datum.
  const [feld, richtung] = (f.sort ?? 'date-desc').split('-')
  tabelle = [...tabelle].sort((a, b) => {
    const cmp = feld === 'amount' ? a.amount - b.amount || a.date.localeCompare(b.date) : a.date.localeCompare(b.date)
    return richtung === 'asc' ? cmp : -cmp
  })

  const proSeite = Math.max(1, f.proSeite ?? SEITENGROESSE)
  const seiten = Math.max(1, Math.ceil(tabelle.length / proSeite))
  const seite = Math.min(Math.max(1, Math.floor(f.seite ?? 1) || 1), seiten)

  return {
    imZeitraum,
    einnahmen,
    ausgaben,
    netto: einnahmen - ausgaben,
    aktiverMonat,
    imMonat,
    monate,
    topKategorien,
    kategorienMax: topKategorien[0]?.total ?? 0,
    genutzteKategorien,
    gegenparteien,
    groessteAusgaben,
    groessteEinnahmen,
    proMonat,
    tabelle,
    seitenZeilen: tabelle.slice((seite - 1) * proSeite, seite * proSeite),
    seite,
    seiten,
    gefiltert: Boolean(needle || f.cat || f.txtype),
  }
}
