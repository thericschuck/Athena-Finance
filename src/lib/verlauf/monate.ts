/**
 * Rechenlogik der Monatsübersicht (Verlauf → Monatsübersicht).
 * Reine Funktionen ohne Imports, damit `node --test` sie direkt laden kann.
 *
 * Eingabe sind die Zeilen der View `monthly_flow_totals`. Die Sparquote rechnet wie überall
 * (siehe lib/finance/flow-calc) nur auf Konsum: Geld, das in Anlagen fließt, ist Sparen und
 * keine Konsumausgabe.
 */

/** Zeile von `monthly_flow_totals`; `month` ist der erste Tag des Monats (YYYY-MM-DD). */
export type MonatRow = {
  month: string
  income: number
  expense: number
  echt_income: number
  echt_expense: number
  anlage_income: number
  anlage_expense: number
  forderung_income: number
  forderung_expense: number
  tx_count: number
}

export type MonatSumme = Omit<MonatRow, 'month'>

const LEER: MonatSumme = {
  income: 0, expense: 0, echt_income: 0, echt_expense: 0,
  anlage_income: 0, anlage_expense: 0, forderung_income: 0, forderung_expense: 0, tx_count: 0,
}

/**
 * Sparquote in Prozent auf Konsum-Basis. `null` ohne Konsum-Einnahmen: die Quote ist dann
 * nicht definiert, und „0 %" würde eine ausgeglichene Bilanz behaupten.
 */
export function sparquote(s: Pick<MonatSumme, 'echt_income' | 'echt_expense'>): number | null {
  if (!(s.echt_income > 0)) return null
  return Math.round(((s.echt_income - s.echt_expense) / s.echt_income) * 100)
}

export function summiere(rows: MonatRow[]): MonatSumme {
  const t = { ...LEER }
  for (const r of rows) {
    t.income += r.income
    t.expense += r.expense
    t.echt_income += r.echt_income
    t.echt_expense += r.echt_expense
    t.anlage_income += r.anlage_income
    t.anlage_expense += r.anlage_expense
    t.forderung_income += r.forderung_income
    t.forderung_expense += r.forderung_expense
    t.tx_count += r.tx_count
  }
  return t
}

const jahrVon = (month: string) => Number(month.slice(0, 4))
const monatVon = (month: string) => Number(month.slice(5, 7))

export type JahrGruppe = {
  jahr: number
  /** Monate des Jahres, jüngster zuerst. */
  monate: MonatRow[]
  summe: MonatSumme
  sparquote: number | null
}

/** Jahre absteigend, darin die Monate absteigend. Die Summe gilt immer für das ganze Jahr. */
export function jahresGruppen(rows: MonatRow[]): JahrGruppe[] {
  const byJahr = new Map<number, MonatRow[]>()
  for (const r of rows) {
    const j = jahrVon(r.month)
    const list = byJahr.get(j)
    if (list) list.push(r)
    else byJahr.set(j, [r])
  }
  return [...byJahr.entries()]
    .sort(([a], [b]) => b - a)
    .map(([jahr, list]) => {
      const monate = [...list].sort((a, b) => b.month.localeCompare(a.month))
      const summe = summiere(monate)
      return { jahr, monate, summe, sparquote: sparquote(summe) }
    })
}

/**
 * Eine Seite der Tabelle, gezählt in Monaten (nicht in Jahren). Die Jahressumme bleibt dabei
 * die des ganzen Jahres: sonst würde die Summe beim Blättern plötzlich kleiner, obwohl das
 * Jahr dasselbe ist. Jahre ohne Monat auf dieser Seite entfallen.
 */
export function seite(gruppen: JahrGruppe[], page: number, size: number): JahrGruppe[] {
  const start = Math.max(0, page) * size
  const ende = start + size
  const out: JahrGruppe[] = []
  let pos = 0
  for (const g of gruppen) {
    const von = Math.max(0, start - pos)
    const bis = Math.min(g.monate.length, ende - pos)
    if (bis > von) out.push({ ...g, monate: g.monate.slice(von, bis) })
    pos += g.monate.length
  }
  return out
}

// ─── Kennzahlen ─────────────────────────────────────────────────────────────────────────

export type MonatsWert = { month: string; wert: number }

export type Kennzahlen = {
  /** Anzahl der tatsächlich eingerechneten Monate (kann unter 12 liegen). */
  monate: number
  /** Sparquote über die Summe des Fensters, nicht Mittel der Monatsquoten: ein Monat mit
   *  winzigen Einnahmen soll den Wert nicht verzerren. */
  durchschnittSparquote: number | null
  bester: MonatsWert | null
  schlechtester: MonatsWert | null
  /** Median der Konsumausgaben im Fenster; `null` ohne Monate. */
  medianKonsum: number | null
}

export function median(werte: number[]): number | null {
  if (werte.length === 0) return null
  const s = [...werte].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Erster Tag (YYYY-MM-DD) des Monats, der `n` Monate vor dem Monat von `heute` liegt. */
function monatsErster(heute: string, n: number): string {
  const d = new Date(Date.UTC(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1 - n, 1))
  return d.toISOString().split('T')[0]
}

/**
 * Kennzahlen über die letzten `fenster` ABGESCHLOSSENEN Kalendermonate (Standard 12).
 *
 * Der laufende Monat zählt nicht: mit 80 € Einnahmen und 2.131 € Konsum am 23. ergab er eine
 * „schwächste Sparquote" von −2.564 % und zog Durchschnitt und Median mit. Das Fenster ist
 * nach Kalendermonaten geschnitten und nicht nach Zeilen — hat die View Lücken, reichten 12
 * Zeilen sonst weit über ein Jahr zurück.
 */
export function kennzahlen(rows: MonatRow[], fenster = 12, heute: string = new Date().toISOString().split('T')[0]): Kennzahlen {
  const ab = monatsErster(heute, fenster)
  const bis = monatsErster(heute, 0)
  const neu = [...rows]
    .filter(r => r.month.slice(0, 10) >= ab && r.month.slice(0, 10) < bis)
    .sort((a, b) => b.month.localeCompare(a.month))
  let bester: MonatsWert | null = null
  let schlechtester: MonatsWert | null = null
  for (const r of neu) {
    const q = sparquote(r)
    if (q === null) continue
    // Strikt größer/kleiner: bei Gleichstand gewinnt der jüngere Monat (Liste läuft absteigend).
    if (!bester || q > bester.wert) bester = { month: r.month, wert: q }
    if (!schlechtester || q < schlechtester.wert) schlechtester = { month: r.month, wert: q }
  }
  return {
    monate: neu.length,
    durchschnittSparquote: sparquote(summiere(neu)),
    bester,
    schlechtester,
    medianKonsum: median(neu.map(r => r.echt_expense)),
  }
}

// ─── Vorjahresvergleich ─────────────────────────────────────────────────────────────────

export type Vorjahr = {
  /** Änderung gegenüber dem gleichen Monat des Vorjahres (positiv = mehr). */
  income: number
  expense: number
  /** Prozent; `null`, wenn der Vorjahreswert 0 war. */
  incomePct: number | null
  expensePct: number | null
}

export function monatsIndex(rows: MonatRow[]): Map<string, MonatRow> {
  return new Map(rows.map(r => [r.month.slice(0, 7), r]))
}

/** `null`, wenn es den Vormonat des Vorjahres nicht gibt (z. B. im ersten Jahr). */
export function vorjahresVergleich(index: Map<string, MonatRow>, row: MonatRow): Vorjahr | null {
  const key = `${String(jahrVon(row.month) - 1).padStart(4, '0')}-${row.month.slice(5, 7)}`
  const alt = index.get(key)
  if (!alt) return null
  const pct = (neu: number, vor: number) => (vor > 0 ? ((neu - vor) / vor) * 100 : null)
  return {
    income: row.income - alt.income,
    expense: row.expense - alt.expense,
    incomePct: pct(row.income, alt.income),
    expensePct: pct(row.expense, alt.expense),
  }
}

// ─── Heatmap ────────────────────────────────────────────────────────────────────────────

export type HeatmapZeile = {
  jahr: number
  /** Index 0 = Januar. `null` = Monat fehlt oder ohne Einnahmen (Quote nicht definiert). */
  quoten: (number | null)[]
}

export function heatmapZeilen(rows: MonatRow[]): HeatmapZeile[] {
  const byJahr = new Map<number, (number | null)[]>()
  for (const r of rows) {
    const j = jahrVon(r.month)
    let z = byJahr.get(j)
    if (!z) {
      z = Array<number | null>(12).fill(null)
      byJahr.set(j, z)
    }
    const m = monatVon(r.month)
    if (m >= 1 && m <= 12) z[m - 1] = sparquote(r)
  }
  return [...byJahr.entries()].sort(([a], [b]) => b - a).map(([jahr, quoten]) => ({ jahr, quoten }))
}

/** Quote, ab der die Farbe voll gesättigt ist; darüber/darunter ändert sich nichts mehr. */
export const HEAT_CAP = 50

/**
 * Farbe einer Heatmap-Zelle: Theme-Token plus Deckkraft. `null` bei genau 0 % (neutral).
 * Die Deckkraft bleibt ≤ 0,65, damit der Text auf der Zelle lesbar bleibt.
 */
export function heatFarbe(quote: number): { token: 'success' | 'danger'; alpha: number } | null {
  if (quote === 0) return null
  const anteil = Math.min(Math.abs(quote), HEAT_CAP) / HEAT_CAP
  return { token: quote > 0 ? 'success' : 'danger', alpha: Math.round((0.12 + 0.53 * anteil) * 100) / 100 }
}

// ─── Chart ──────────────────────────────────────────────────────────────────────────────

export type BalkenPunkt = { month: string; income: number; expense: number }

/** Aufsteigend für die Zeitachse. */
export function balkenPunkte(rows: MonatRow[]): BalkenPunkt[] {
  return [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({ month: r.month.slice(0, 7), income: r.income, expense: r.expense }))
}

/** Die jüngsten `monate` Punkte; `null` = alle. */
export function letzteMonate<T>(punkte: T[], monate: number | null): T[] {
  return monate === null ? punkte : punkte.slice(-monate)
}
