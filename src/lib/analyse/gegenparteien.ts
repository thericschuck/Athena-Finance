import type { FlowTransaction } from '../data/flows.ts'
import { parteiName, parteiSchluessel } from '../bank/auswertung.ts'
import type { ParteiAuswertung, ParteiZeile, Richtung } from '../bank/auswertung.ts'

/**
 * Gegenparteien der Analyse-Seite. Anders als auf der Bankseite (BankTransaction mit Vorzeichen)
 * arbeiten wir hier auf `FlowTransaction`: der Betrag ist immer positiv, die Richtung steht in
 * `type`. Die Namensregeln (Leerraum glaetten, Gross-/Kleinschreibung angleichen, Kurztext aus
 * dem Verwendungszweck, „Unbekannt") kommen unveraendert aus lib/bank/auswertung — so heisst
 * dieselbe Partei auf beiden Seiten gleich und der Filter `partei` passt ueberall.
 *
 * Umbuchungen zwischen eigenen Konten fehlen schon in `unified_transactions` (counts_in_flow),
 * hier ist also nichts mehr auszusortieren. Anlagen/Forderungen sind nur dabei, wenn der Schalter
 * `anlage` an ist — der Loader holt sie dann gar nicht erst, `daten.txns` ist die Wahrheit.
 */

export type { ParteiAuswertung, ParteiZeile, Richtung }

/** Anzeigename der Gegenpartei einer Buchung: Haendler, sonst Kurztext des Zwecks, sonst „Unbekannt". */
export function parteiVon(tx: Pick<FlowTransaction, 'merchant' | 'description'>): string {
  return parteiName({ counterpart_name: tx.merchant, description: tx.description })
}

/**
 * EINE gemeinsame Normalisierung fuer den URL-Filter `partei`: Anzeigename (`parteiAnzeigename`)
 * und Vergleichsschluessel (`parteiSchluessel`). Wer `partei` setzt (Gegenparteien, Insights) nimmt
 * den Anzeigenamen, die Buchungsliste vergleicht ueber den Schluessel — so treffen alle dieselben
 * Buchungen.
 */
export const parteiAnzeigename = parteiVon
export { parteiSchluessel }

/** Vergleichsschluessel einer Buchung — dieselbe Partei in jeder Schreibweise ergibt denselben. */
export function parteiSchluesselVon(tx: Pick<FlowTransaction, 'merchant' | 'description'>): string {
  return parteiSchluessel(parteiVon(tx))
}

export function gegenparteien(
  buchungen: readonly FlowTransaction[],
  richtung: Richtung,
  topN = 10,
): ParteiAuswertung {
  const typ = richtung === 'ausgaben' ? 'expense' : 'income'
  const nach = new Map<string, ParteiZeile & { namen: Map<string, number> }>()
  let gesamt = 0
  let gesamtAnzahl = 0

  for (const t of buchungen) {
    if (t.type !== typ || !(t.amount > 0)) continue
    const name = parteiVon(t)
    const key = parteiSchluessel(name)
    let z = nach.get(key)
    if (!z) {
      z = { name, schluessel: key, summe: 0, anzahl: 0, anteil: 0, schnitt: 0, monate: {}, namen: new Map() }
      nach.set(key, z)
    }
    z.summe += t.amount
    z.anzahl += 1
    z.namen.set(name, (z.namen.get(name) ?? 0) + 1)
    const monat = t.date.slice(0, 7)
    z.monate[monat] = (z.monate[monat] ?? 0) + t.amount
    gesamt += t.amount
    gesamtAnzahl += 1
  }

  const alle = [...nach.values()]
    .map(z => {
      // Haeufigste Schreibweise als Anzeigename; der Filter vergleicht ueber den Schluessel.
      const name = [...z.namen.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return {
        name, schluessel: z.schluessel, summe: z.summe, anzahl: z.anzahl, monate: z.monate,
        anteil: gesamt > 0 ? z.summe / gesamt : 0,
        schnitt: z.summe / z.anzahl,
      } satisfies ParteiZeile
    })
    // Bei gleicher Summe nach Name, damit die Reihenfolge nicht vom Zufall der Eingabe abhaengt.
    .sort((a, b) => b.summe - a.summe || a.name.localeCompare(b.name, 'de'))

  const zeilen = alle.slice(0, topN)
  const rest = alle.slice(topN)
  const restSumme = rest.reduce((s, z) => s + z.summe, 0)
  const weitere = rest.length === 0 ? null : {
    anzahlParteien: rest.length,
    summe: restSumme,
    anzahl: rest.reduce((s, z) => s + z.anzahl, 0),
    anteil: gesamt > 0 ? restSumme / gesamt : 0,
  }
  return { zeilen, weitere, gesamt, gesamtAnzahl }
}

/**
 * Monatsachse fuer die Mini-Verlaeufe: lueckenlos von dem fruehesten bis zum letzten Monat, in dem
 * eine der gezeigten Parteien Buchungen hat, hoechstens die letzten `max`. Lueckenlos, weil
 * sonst zwei Buchungsmonate mit einem leeren Monat dazwischen wie benachbarte Balken aussaehen
 * und ein Rhythmus (z. B. quartalsweise) unsichtbar wird.
 */
export function monatsAchse(zeilen: readonly Pick<ParteiZeile, 'monate'>[], max = 12): string[] {
  let von: string | null = null
  let bis: string | null = null
  for (const z of zeilen) {
    for (const m of Object.keys(z.monate)) {
      if (von === null || m < von) von = m
      if (bis === null || m > bis) bis = m
    }
  }
  if (von === null || bis === null) return []
  const aus: string[] = []
  let [j, m] = bis.split('-').map(Number)
  while (aus.length < max) {
    const ym = `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}`
    if (ym < von) break
    aus.unshift(ym)
    m -= 1
    if (m === 0) { m = 12; j -= 1 }
  }
  return aus
}
