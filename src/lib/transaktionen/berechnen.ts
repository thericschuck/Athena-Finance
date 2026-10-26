/**
 * Summen und Gruppen der Transaktionen-Liste. Rein, ohne Imports.
 *
 * Fluss-Regel wie überall in der App: Umbuchungen zwischen eigenen Konten und Anfangsbestände sind
 * weder Einnahme noch Ausgabe; Anlagen und Forderungen zählen (ein Krypto-Kauf senkt das Girokonto).
 */

/** Was Summen und Gruppen von einer Zeile brauchen (Teilmenge von `UnifiedTxRow`). */
export interface SummenZeile {
  type: string
  flow_kind: string
  amount: number
  signed_amount: number
}

export const zaehltAlsFluss = (z: { flow_kind: string }) =>
  z.flow_kind !== 'umbuchung' && z.flow_kind !== 'anfangsbestand'

export interface TrefferSummen {
  anzahl: number
  einnahmen: number
  ausgaben: number
  /** einnahmen − ausgaben */
  netto: number
  /** Anzahl der Umbuchungen/Anfangsbestände unter den Treffern (stehen NICHT in den Summen). */
  ohneFluss: number
}

const rund2 = (n: number) => Math.round(n * 100) / 100

export function summiereTreffer(zeilen: readonly SummenZeile[]): TrefferSummen {
  let einnahmen = 0
  let ausgaben = 0
  let ohneFluss = 0
  for (const z of zeilen) {
    if (!zaehltAlsFluss(z)) {
      ohneFluss++
      continue
    }
    if (z.type === 'income') einnahmen += z.amount
    else if (z.type === 'expense') ausgaben += z.amount
  }
  return {
    anzahl: zeilen.length,
    einnahmen: rund2(einnahmen),
    ausgaben: rund2(ausgaben),
    netto: rund2(einnahmen - ausgaben),
    ohneFluss,
  }
}

export interface TagesGruppe<T> {
  /** YYYY-MM-DD */
  date: string
  /** Summe der Fluss-Buchungen des Tages mit Vorzeichen (Einnahmen +, Ausgaben −). */
  summe: number
  zeilen: T[]
}

/**
 * Teilt eine bereits SORTIERTE Liste in Tage (Reihenfolge bleibt). Bei einer Sortierung nach Betrag
 * ergibt Tagesgruppierung keinen Sinn — der Aufrufer gruppiert dann nicht (siehe `gruppierenSinnvoll`).
 */
export function gruppiereNachTag<T extends SummenZeile & { date: string }>(zeilen: readonly T[]): TagesGruppe<T>[] {
  const gruppen: TagesGruppe<T>[] = []
  for (const z of zeilen) {
    let g = gruppen.at(-1)
    if (!g || g.date !== z.date) {
      g = { date: z.date, summe: 0, zeilen: [] }
      gruppen.push(g)
    }
    g.zeilen.push(z)
    if (zaehltAlsFluss(z)) g.summe = rund2(g.summe + z.signed_amount)
  }
  return gruppen
}

/** Tageskopfzeilen nur bei Sortierung nach Datum. */
export function gruppierenSinnvoll(sort: string): boolean {
  return sort === 'date-desc' || sort === 'date-asc'
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONATE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']

/**
 * „Heute“, „Gestern“, sonst „Mo, 12. Okt.“ (ohne Jahr, wenn es das laufende ist, sonst „Mo, 12. Okt. 2025“).
 * `heute` ist das Berliner Datum des Aufrufers — die Funktion selbst kennt keine Zeitzone.
 */
export function tagLabel(datum: string, heute: string): string {
  if (datum === heute) return 'Heute'
  const d = new Date(`${datum}T12:00:00Z`)
  const gestern = new Date(`${heute}T12:00:00Z`)
  gestern.setUTCDate(gestern.getUTCDate() - 1)
  if (d.toISOString().slice(0, 10) === gestern.toISOString().slice(0, 10)) return 'Gestern'
  const text = `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]}`
  return datum.slice(0, 4) === heute.slice(0, 4) ? text : `${text} ${datum.slice(0, 4)}`
}

/**
 * Teile `text` an den Treffern von `suche` (ohne Beachtung der Schreibweise) in markierbare Stücke.
 * Leere Suche oder kein Treffer: ein Stück. Überlappungen entstehen nicht (es wird links nach rechts gesucht).
 */
export function markiereTreffer(text: string, suche: string | undefined): { text: string; treffer: boolean }[] {
  const q = suche?.trim()
  if (!q || q.length < 2) return [{ text, treffer: false }]
  const hay = text.toLocaleLowerCase('de-DE')
  const nadel = q.toLocaleLowerCase('de-DE')
  // Kleinschreibung kann die Länge ändern (z. B. „İ“); dann lieber nicht markieren als falsch schneiden.
  if (hay.length !== text.length) return [{ text, treffer: false }]
  const teile: { text: string; treffer: boolean }[] = []
  let pos = 0
  for (;;) {
    const i = hay.indexOf(nadel, pos)
    if (i < 0) break
    if (i > pos) teile.push({ text: text.slice(pos, i), treffer: false })
    teile.push({ text: text.slice(i, i + nadel.length), treffer: true })
    pos = i + nadel.length
  }
  if (pos < text.length) teile.push({ text: text.slice(pos), treffer: false })
  return teile.length > 0 ? teile : [{ text, treffer: false }]
}
