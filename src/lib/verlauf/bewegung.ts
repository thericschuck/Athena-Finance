/**
 * Bewegungsanalyse: „Warum hat sich mein Vermögen bewegt?"
 *
 * Reine Rechenlogik, keine Imports — damit `node --test` sie direkt lädt.
 *
 * Zerlegung der Net-Worth-Änderung je Monat:
 *
 *   Δ Vermögen = gespart + Markt/Rest
 *
 *   gespart = echt_income − echt_expense   (Einnahmen minus Konsum)
 *   Markt   = Δ Vermögen − gespart          (Rest)
 *
 * ENTSCHEIDUNG zu Anlage-Flüssen (flow_kind = 'anlage'): Sie zählen NICHT in „gespart".
 * Geld, das vom Girokonto ins Depot/auf Crypto wandert, ist für das Vermögen ein
 * Topfwechsel: Girokonto sinkt, Depot steigt, die Summe bleibt. Würde man es zu „gespart"
 * rechnen, entstünde ein doppelter Effekt (Konto −500, Depot +500 = 0, aber „gespart +500"),
 * und der Markt-Rest würde um genau diesen Betrag zu klein. Umgekehrt ist es auch KEIN
 * Marktgewinn, dass das Depot wächst, wenn man einzahlt — das ist in der Net-Worth-Summe
 * schon neutral und taucht deshalb in keiner der beiden Größen auf. Echte Sparleistung ist
 * das, was nach Konsum übrig bleibt (echt), Kursbewegung ist der Rest. Forderungen
 * (verliehenes/zurückerhaltenes Geld) wandern ebenfalls in den Rest, weil sie das Vermögen
 * nur verschieben, nicht den Konsum betreffen.
 *
 * UNGENAUIGKEIT: Der Rest ist ein Restposten. Er enthält neben Kursgewinnen auch
 * Buchungslücken (fehlende Bankbuchungen), Forderungen, Schuldentilgung/-aufnahme,
 * Bewertungsänderungen bei Sammlung/Business und Rundungen der Snapshots. Er ist als
 * „Markt & Sonstiges" zu lesen, nicht als exakter Kursgewinn.
 *
 * Optionale Aufschlüsselung: Depot+Crypto-Delta minus Anlage-Nettozufluss
 * (anlage_expense − anlage_income) ist der Teil des Rests, der in den Anlagetöpfen
 * entstanden ist (Kurs/Dividenden/Gebühren); der übrige Rest liegt außerhalb.
 *
 * ZEITRAHMEN: Ein Monat kann nur zerlegt werden, wenn der Vermögensstand am Ende des
 * Vorvormonats bekannt ist. Der erste Monat mit Snapshots hat keinen sauberen Anfangswert
 * (der erste Snapshot liegt mitten im Monat, die Buchungen decken aber den ganzen Monat)
 * und fehlt deshalb. Der laufende Monat läuft bis zum letzten Snapshot.
 */

export interface BewegungSnapshot {
  /** YYYY-MM-DD */
  datum: string
  net_worth: number
  total_depot: number
  total_crypto: number
}

export interface BewegungFlow {
  /** Erster Tag des Monats, YYYY-MM-DD. */
  month: string
  echt_income: number
  echt_expense: number
  anlage_income: number
  anlage_expense: number
}

export interface BewegungMonat {
  /** Erster Tag des Monats, YYYY-MM-DD. */
  month: string
  delta: number
  gespart: number
  /** Markt & Sonstiges (Rest). */
  markt: number
  /** Teil des Rests, der in Depot+Crypto entstand. */
  marktAnlagen: number
  /** Übriger Rest außerhalb von Depot/Crypto. */
  marktSonstiges: number
  endWert: number
}

export interface BewegungSumme {
  monate: number
  delta: number
  gespart: number
  markt: number
  marktAnlagen: number
  marktSonstiges: number
}

export const BEWEGUNG_ZEITRAEUME = ['3m', '6m', '12m', 'max'] as const
export type BewegungZeitraum = typeof BEWEGUNG_ZEITRAEUME[number]

const monatVon = (iso: string) => iso.slice(0, 7) + '-01'

/** Monatsende-Stand: letzter Snapshot je Monat. Monate ohne Snapshot erben den Stand davor. */
function monatsenden(snaps: BewegungSnapshot[]): Map<string, BewegungSnapshot> {
  const sorted = [...snaps].sort((a, b) => a.datum.localeCompare(b.datum))
  const last = new Map<string, BewegungSnapshot>()
  for (const s of sorted) last.set(monatVon(s.datum), s)
  if (sorted.length === 0) return last

  // Lücken schließen, damit ein fehlender Monat nicht den Folgemonat unzerlegbar macht.
  const first = monatVon(sorted[0].datum)
  const lastMonth = monatVon(sorted[sorted.length - 1].datum)
  let [y, m] = first.split('-').map(Number)
  let prev: BewegungSnapshot | null = null
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}-01`
    const cur = last.get(key)
    if (cur) prev = cur
    else if (prev) last.set(key, prev)
    if (key >= lastMonth) break
    m++
    if (m > 12) { m = 1; y++ }
  }
  return last
}

export function bewegungsMonate(snaps: BewegungSnapshot[], flows: BewegungFlow[]): BewegungMonat[] {
  const enden = monatsenden(snaps)
  const monate = [...enden.keys()].sort()
  const flowBy = new Map(flows.map(f => [f.month, f]))
  const out: BewegungMonat[] = []

  for (let i = 1; i < monate.length; i++) {
    const cur = enden.get(monate[i])!
    const prev = enden.get(monate[i - 1])!
    const f = flowBy.get(monate[i])
    const delta = cur.net_worth - prev.net_worth
    const gespart = f ? f.echt_income - f.echt_expense : 0
    const anlageNetto = f ? f.anlage_expense - f.anlage_income : 0
    const dAnlagen = cur.total_depot + cur.total_crypto - (prev.total_depot + prev.total_crypto)
    const markt = delta - gespart
    const marktAnlagen = dAnlagen - anlageNetto
    out.push({
      month: monate[i], delta, gespart, markt,
      marktAnlagen, marktSonstiges: markt - marktAnlagen,
      endWert: cur.net_worth,
    })
  }
  return out
}

/** Summe über die letzten n Monate (`null` = alle). */
export function bewegungSumme(monate: BewegungMonat[], n: number | null): BewegungSumme {
  const liste = n === null ? monate : monate.slice(-n)
  const s: BewegungSumme = { monate: liste.length, delta: 0, gespart: 0, markt: 0, marktAnlagen: 0, marktSonstiges: 0 }
  for (const m of liste) {
    s.delta += m.delta
    s.gespart += m.gespart
    s.markt += m.markt
    s.marktAnlagen += m.marktAnlagen
    s.marktSonstiges += m.marktSonstiges
  }
  return s
}

export const ZEITRAUM_MONATE: Record<BewegungZeitraum, number | null> = { '3m': 3, '6m': 6, '12m': 12, max: null }
