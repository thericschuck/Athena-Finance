import { addTage, format, monateZwischen, monatVon, parse, tagImMonat } from './datum.ts'

/**
 * Die Abbuchungstermine eines Vertrags in einem Zeitfenster. Dieselbe Logik wie die Edge Function
 * `execute-contracts` (Intervall in Monaten bzw. Tagen ab `start_date`, Abbuchungstag `billing_day`
 * oder der Starttag), nur nach vorne gerechnet statt für „heute".
 *
 * Läuft `end_date` ab, endet der Vertrag nur ohne automatische Verlängerung; mit `auto_renews`
 * läuft er im selben Rhythmus weiter (so rechnet auch das Dashboard die nächste Verlängerung).
 */

export type TerminVertrag = {
  frequency: string
  billing_day: number | null
  start_date: string
  end_date: string | null
  auto_renews: boolean
  is_active: boolean
}

const MONATE: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6, yearly: 12 }
const TAGE: Record<string, number> = { weekly: 7, biweekly: 14 }

export function termineImFenster(v: TerminVertrag, von: string, bis: string): string[] {
  if (!v.is_active || von > bis) return []
  const aktiv = (datum: string) =>
    datum >= v.start_date && datum >= von && datum <= bis && (!v.end_date || datum <= v.end_date || v.auto_renews)

  const out: string[] = []

  if (TAGE[v.frequency]) {
    const schritt = TAGE[v.frequency]
    // Erster Termin im Fenster: start_date plus ganzzahlige Vielfache des Intervalls.
    let d = v.start_date
    if (d < von) {
      const diff = Math.ceil((Date.parse(von + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86_400_000 / schritt)
      d = addTage(d, diff * schritt)
    }
    for (let i = 0; d <= bis && i < 400; i++, d = addTage(d, schritt)) {
      if (aktiv(d)) out.push(d)
    }
    return out
  }

  const intervall = MONATE[v.frequency] ?? 1
  const startMonat = monatVon(v.start_date)
  const tag = v.billing_day ?? parse(v.start_date).d
  let monat = monatVon(von)
  const letzterMonat = monatVon(bis)
  for (let i = 0; monat <= letzterMonat && i < 600; i++) {
    const abstand = monateZwischen(startMonat, monat)
    if (abstand >= 0 && abstand % intervall === 0) {
      const datum = tagImMonat(monat, tag)
      if (aktiv(datum)) out.push(datum)
    }
    const { y, m } = parse(monat + '-01')
    monat = m === 12 ? format(y + 1, 1, 1).slice(0, 7) : format(y, m + 1, 1).slice(0, 7)
  }
  return out
}
