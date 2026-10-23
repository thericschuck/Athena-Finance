/**
 * Rechenlogik fuer Kontostandverlaeufe der Bankdaten-Seite (Kontokarten-Sparklines und
 * Gesamtverlauf). Rein, damit sie sich testen laesst (verlauf.test.ts).
 *
 * Es gibt keine gespeicherte Saldenhistorie — `bank_balance` haelt je Konto nur den aktuellen
 * Stand. Die Reihe entsteht, indem vom heutigen gebuchten Saldo rueckwaerts durch die
 * Buchungen gerechnet wird (gleiche Logik wie frueher in bank-balance-chart-impl.tsx). Sie ist
 * nur so vollstaendig wie das geladene Journal: fehlen aeltere Umsaetze, ist der fruehste Wert
 * nicht der echte Eroeffnungsstand.
 */

interface BuchungKurz {
  amount: number
  value_date: string
  entry_date: string | null
}

/** Saldo am Ende eines Tages. Die Reihe ist aufsteigend nach Datum sortiert. */
export interface SaldoPunkt {
  datum: string
  saldo: number
}

const TAG_MS = 86_400_000

// Mittag UTC statt Mitternacht: so kippt das Datum nicht durch Zeitzonen oder Sommerzeit.
const zuMs = (iso: string): number => Date.parse(`${iso}T12:00:00Z`)
const zuIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function addTage(iso: string, n: number): string {
  return zuIso(zuMs(iso) + n * TAG_MS)
}

/** Alle Kalendertage von `von` bis `bis` einschliesslich. Leer, wenn `von` > `bis`. */
export function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = []
  for (let ms = zuMs(von); ms <= zuMs(bis); ms += TAG_MS) tage.push(zuIso(ms))
  return tage
}

/**
 * Tagesendsalden eines Kontos: ein Punkt je Buchungstag, davor der Eroeffnungsstand (einen
 * Tag vor der ersten Buchung), am Ende bis `heute` verlaengert.
 *
 * Vorausbuchungen (Buchungstag in der Zukunft) sind ausgeschlossen: die Bank liefert sie schon
 * mit, sie stecken aber noch NICHT im gemeldeten gebuchten Saldo. Da rueckwaerts gerechnet
 * wird, wuerde jede solche Buchung die ganze Kurve verschieben (siehe bank-balance-chart-impl).
 *
 * Ohne Buchungen: ein einzelner Punkt auf `heute` mit dem aktuellen Saldo (flache Linie).
 */
export function saldoReihe(buchungen: readonly BuchungKurz[], aktuellerSaldo: number, heute: string): SaldoPunkt[] {
  // Eine Buchung mit entry_date <= heute < value_date steckt schon im gemeldeten Saldo, liegt aber
  // nach heute — sie zaehlt deshalb AM heutigen Tag (sonst zeigte die Kurve heute einen anderen
  // Stand als das Konto: bei Saldo 100 und einer vorgemerkten −50 am 25.10. 150 statt 100).
  const gebucht = buchungen
    .filter(t => (t.entry_date ?? t.value_date) <= heute)
    .map(t => (t.value_date > heute ? { ...t, value_date: heute } : t))
  if (gebucht.length === 0) return [{ datum: heute, saldo: aktuellerSaldo }]

  const sortiert = [...gebucht].sort((a, b) => a.value_date.localeCompare(b.value_date))
  const summe = sortiert.reduce((s, t) => s + t.amount, 0)

  let laufend = aktuellerSaldo - summe
  const punkte: SaldoPunkt[] = [{ datum: addTage(sortiert[0].value_date, -1), saldo: laufend }]
  for (let i = 0; i < sortiert.length; i++) {
    laufend += sortiert[i].amount
    // Nur den letzten Stand je Tag behalten — das ist der Tagesendsaldo.
    if (i === sortiert.length - 1 || sortiert[i + 1].value_date !== sortiert[i].value_date) {
      punkte.push({ datum: sortiert[i].value_date, saldo: laufend })
    }
  }
  // Buchungen mit value_date nach heute (aber entry_date <= heute) duerfen die Reihe nicht
  // ueber heute hinaus ziehen; der letzte Punkt gilt dann ab seinem Datum.
  const letzter = punkte[punkte.length - 1]
  if (letzter.datum < heute) punkte.push({ datum: heute, saldo: letzter.saldo })
  return punkte
}

/**
 * Saldo je Tag fuer eine aufsteigende Tagesliste (Stufenfunktion: der letzte Punkt am oder vor
 * dem Tag gilt). Vor dem ersten Punkt gilt dessen Wert — der Eroeffnungsstand. Ein Durchlauf
 * mit zwei Zeigern statt Suche je Tag, weil „Alles" mehrere tausend Tage umfassen kann.
 */
export function tagesWerte(reihe: readonly SaldoPunkt[], tage: readonly string[]): number[] {
  const werte: number[] = []
  let i = 0
  for (const tag of tage) {
    while (i + 1 < reihe.length && reihe[i + 1].datum <= tag) i++
    werte.push(reihe[i].saldo)
  }
  return werte
}

/** Saldo an einem einzelnen Tag. */
export function saldoAm(reihe: readonly SaldoPunkt[], tag: string): number {
  return tagesWerte(reihe, [tag])[0]
}

/** Ein Konto als Eingabe des Gesamtverlaufs. */
export interface KontoEingabe {
  key: string
  name: string
  /** Aktueller gebuchter Saldo. */
  saldo: number
  buchungen: readonly BuchungKurz[]
}

/** Ein Tag des Gesamtverlaufs: Saldo je Konto (gleiche Reihenfolge wie die Eingabe) und Summe. */
export interface VerlaufTag {
  datum: string
  werte: number[]
  summe: number
}

/** Fruehester Eroeffnungsstand ueber alle Konten — der sinnvolle Beginn einer „Alles"-Ansicht. */
export function fruehesterTag(konten: readonly KontoEingabe[], heute: string): string {
  let frueh = heute
  for (const k of konten) {
    const r = saldoReihe(k.buchungen, k.saldo, heute)
    if (r[0].datum < frueh) frueh = r[0].datum
  }
  return frueh
}

/**
 * Taeglicher Saldo aller Konten von `von` bis `heute`. `von` wird auf den fruehesten
 * Eroeffnungsstand begrenzt: davor gaebe es nur eine erfundene flache Linie.
 */
export function gesamtVerlauf(konten: readonly KontoEingabe[], von: string | null, heute: string): VerlaufTag[] {
  if (konten.length === 0) return []
  const frueh = fruehesterTag(konten, heute)
  const start = von && von > frueh ? von : frueh
  const tage = tageZwischen(start, heute)
  const spalten = konten.map(k => tagesWerte(saldoReihe(k.buchungen, k.saldo, heute), tage))
  return tage.map((datum, i) => {
    const werte = spalten.map(s => s[i])
    return { datum, werte, summe: werte.reduce((a, b) => a + b, 0) }
  })
}

export interface VerlaufKennzahlen {
  aktuell: number
  tief: { datum: string; wert: number }
  hoch: { datum: string; wert: number }
  /** Anzahl Tage, an denen die Summe unter null lag. */
  tageImMinus: number
}

/** Kennzahlen ueber die VOLLEN Tageswerte (nicht ueber die ausgeduennte Reihe). */
export function verlaufKennzahlen(tage: readonly VerlaufTag[]): VerlaufKennzahlen | null {
  if (tage.length === 0) return null
  let tief = tage[0]
  let hoch = tage[0]
  let minus = 0
  for (const t of tage) {
    if (t.summe < tief.summe) tief = t
    if (t.summe > hoch.summe) hoch = t
    if (t.summe < 0) minus++
  }
  return {
    aktuell: tage[tage.length - 1].summe,
    tief: { datum: tief.datum, wert: tief.summe },
    hoch: { datum: hoch.datum, wert: hoch.summe },
    tageImMinus: minus,
  }
}

/**
 * Duennt die Tagesreihe auf hoechstens `max` Punkte aus (gleichmaessig verteilt). Erster und
 * letzter Tag sowie Tief- und Hoechststand bleiben immer erhalten, sonst wuerde das Sampling
 * genau die Ausschlaege verschlucken, die die Kopfzeile nennt. Zeilen werden unveraendert
 * uebernommen — die Summe der Schichten bleibt damit exakt die Gesamtsumme.
 */
export function ausduennen(tage: readonly VerlaufTag[], max: number): VerlaufTag[] {
  if (tage.length <= max || max < 4) return [...tage]
  const index = new Set<number>([0, tage.length - 1])
  for (let k = 0; k < max - 2; k++) index.add(Math.round((k * (tage.length - 1)) / (max - 3)))
  let tief = 0
  let hoch = 0
  tage.forEach((t, i) => {
    if (t.summe < tage[tief].summe) tief = i
    if (t.summe > tage[hoch].summe) hoch = i
  })
  index.add(tief)
  index.add(hoch)
  return [...index].sort((a, b) => a - b).map(i => tage[i])
}
