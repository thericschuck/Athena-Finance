import { addMonate, addTage, median, monatVon, parse, tageImMonat, tagImMonat, format } from './datum.ts'
import { lohnImMonat, summeImMonat, type Annahme } from './annahmen.ts'
import { termineImFenster, type TerminVertrag } from './termine.ts'

/**
 * Cashflow-Prognose: wie entwickeln sich Liquidität und Vermögen in den nächsten Monaten?
 *
 * Reine Funktion, keine Datenbank. Die Methode ist bewusst einfach, damit man sie nachvollziehen
 * kann — es ist eine Fortschreibung, keine Vorhersage:
 *
 *   Basis       Median der letzten abgeschlossenen Monate (robust gegen Ausreißer wie eine
 *               einmalige Zahlung). Einnahmen ohne Lohn, Lohn und Ausgaben getrennt.
 *   Bekannte    Verträge mit festem Termin liegen auf ihrem Abbuchungstag. Sie stecken schon in der
 *               Basis (die Historie enthält sie ja), deshalb wird der Rest der Basis gleichmäßig auf
 *               den Monat verteilt — nichts doppelt gezählt.
 *   Annahmen    Änderungen, die in der Vergangenheit noch nicht stehen (siehe annahmen.ts).
 *   Lohn        kommt am typischen Eingangstag, alles andere gleichmäßig über den Monat.
 *
 * Zwei Kurven, weil sie verschiedene Fragen beantworten:
 *   Liquidität  Kontostand auf den liquiden Konten, Tag für Tag. Hier zählen alle Abflüsse, auch
 *               Einzahlungen in Krypto oder Bauspar — das Geld ist weg vom Girokonto.
 *   Vermögen    Nettovermögen wie auf dem Dashboard. Anlagen sind ein Tausch, kein Verbrauch, und
 *               ändern es deshalb nicht; Kursgewinne sind nicht prognostiziert (0 %).
 */

export type PrognoseVertrag = TerminVertrag & {
  id: string
  name: string
  type: string
  amount: number
  account_id: string | null
  to_account_id: string | null
}

export type HistorieMonat = {
  /** Abgeschlossener Monat, `YYYY-MM`. */
  month: string
  /** Alles, was zählt (echt + anlage + forderung). */
  einnahmen: number
  ausgaben: number
  /** Nur Konsum und normale Einnahmen (`echt`). */
  einnahmenEcht: number
  ausgabenEcht: number
  /** Teil der Einnahmen mit Steuerrolle `lohn` (netto). */
  lohnNetto: number
}

export type PrognoseEingaben = {
  /** Heute, `YYYY-MM-DD`. Die Prognose beginnt am Tag danach. */
  heute: string
  /** Wie viele Monate vorausgeschaut wird, der laufende mitgezählt. */
  monate: number
  liquideKontoIds: string[]
  /** Summe der liquiden Konten heute. */
  liquiditaet: number
  /** Nettovermögen heute (Konten + Krypto + Depot). */
  vermoegen: number
  vertraege: PrognoseVertrag[]
  /** Abgeschlossene Monate, aufsteigend. */
  historie: HistorieMonat[]
  /** Typischer Tag des Monats, an dem der Lohn eingeht. null = unbekannt (dann der 1.). */
  lohnTag: number | null
  annahmen: Annahme[]
  /** Wie viele der jüngsten Monate die Basis bilden. Standard 6. */
  basisMonate?: number
}

export type PrognoseMonat = {
  month: string
  einnahmen: number
  ausgaben: number
  /** Liquidität am Monatsende. */
  liquiditaetEnde: number
  /** Tiefster Stand im Monat und der Tag, an dem er erreicht wird. */
  tiefpunkt: number
  tiefpunktDatum: string
  /** Nettovermögen am Monatsende. */
  vermoegenEnde: number
  /** true beim laufenden Monat: nur die Resttage sind prognostiziert. */
  teilmonat: boolean
}

export type BekannterTermin = { datum: string; name: string; betrag: number }

export type Prognose = {
  monate: PrognoseMonat[]
  start: { liquiditaet: number; vermoegen: number }
  tiefpunkt: { betrag: number; datum: string }
  basis: {
    einnahmenOhneLohn: number
    lohn: number
    ausgaben: number
    basisMonate: number
    /** Monatlicher Überschuss der Basis (Einnahmen + Lohn − Ausgaben), ohne Annahmen. */
    saldo: number
  }
  termine: BekannterTermin[]
  warnungen: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Liquiditätswirkung eines Vertragstermins: negativ = Abfluss vom liquiden Konto. */
export function vertragsWirkung(v: PrognoseVertrag, liquide: Set<string>): number {
  const von = v.account_id === null ? true : liquide.has(v.account_id) // unbekanntes Konto: wie liquide
  const nach = v.to_account_id !== null && liquide.has(v.to_account_id)
  if (v.type === 'income') return von ? v.amount : 0
  if (von && !nach) return -v.amount
  if (!von && nach) return v.amount
  return 0 // zwischen zwei liquiden Konten oder zwei illiquiden: kein Effekt auf die Summe
}

export function berechnePrognose(e: PrognoseEingaben): Prognose {
  const warnungen: string[] = []
  const liquide = new Set(e.liquideKontoIds)
  const n = Math.max(1, Math.min(60, Math.floor(e.monate)))

  // ── Basis ─────────────────────────────────────────────────────────────────────────────────
  const basisAnzahl = e.basisMonate ?? 6
  const basis = e.historie.slice(-basisAnzahl)
  if (basis.length === 0) {
    warnungen.push('Es gibt keine abgeschlossenen Monate als Grundlage — die Prognose ist leer, bis Buchungen vorliegen.')
  } else if (basis.length < 3) {
    warnungen.push(`Nur ${basis.length} abgeschlossene${basis.length === 1 ? 'r' : ''} Monat${basis.length === 1 ? '' : 'e'} als Grundlage — die Prognose ist sehr grob.`)
  }
  const lohnMonate = basis.map(m => m.lohnNetto).filter(x => x > 0)
  const basisLohn = median(lohnMonate)
  const basisEinnahmenOhneLohn = median(basis.map(m => m.einnahmen - m.lohnNetto))
  const basisEinnahmenOhneLohnEcht = median(basis.map(m => m.einnahmenEcht - m.lohnNetto))
  const basisAusgaben = median(basis.map(m => m.ausgaben))
  const basisAusgabenEcht = median(basis.map(m => m.ausgabenEcht))

  // ── Zeitraum ──────────────────────────────────────────────────────────────────────────────
  const startMonat = monatVon(e.heute)
  const endMonat = addMonate(startMonat, n - 1)
  const { y: ey, m: em } = parse(endMonat + '-01')
  const endDatum = format(ey, em, tageImMonat(ey, em))
  const ersterTag = addTage(e.heute, 1)

  // ── Bekannte Termine ──────────────────────────────────────────────────────────────────────
  const termineRoh: { datum: string; name: string; wirkung: number }[] = []
  for (const v of e.vertraege) {
    if (!(v.amount > 0)) continue
    const wirkung = vertragsWirkung(v, liquide)
    if (wirkung === 0) continue
    for (const datum of termineImFenster(v, ersterTag, endDatum)) {
      termineRoh.push({ datum, name: v.name, wirkung })
    }
  }
  const fixAb = new Map<string, number>()   // Monat -> Summe bekannter Abflüsse (positiv)
  const fixZu = new Map<string, number>()
  const wirkungAm = new Map<string, number>() // Datum -> Summe der Wirkungen
  for (const t of termineRoh) {
    const m = monatVon(t.datum)
    if (t.wirkung < 0) fixAb.set(m, (fixAb.get(m) ?? 0) - t.wirkung)
    else fixZu.set(m, (fixZu.get(m) ?? 0) + t.wirkung)
    wirkungAm.set(t.datum, (wirkungAm.get(t.datum) ?? 0) + t.wirkung)
  }

  // ── Monatsweise Größen ────────────────────────────────────────────────────────────────────
  const lohnLevel = (monat: string) => {
    const a = lohnImMonat(e.annahmen, monat)
    return a ? a.betrag : basisLohn
  }
  const zusatzEin = (monat: string) =>
    summeImMonat(e.annahmen, 'einnahme', monat) + summeImMonat(e.annahmen, 'betriebseinnahme', monat)
  const zusatzAus = (monat: string) =>
    summeImMonat(e.annahmen, 'ausgabe', monat) + summeImMonat(e.annahmen, 'betriebsausgabe', monat)

  // ── Tagessimulation der Liquidität ────────────────────────────────────────────────────────
  const monate: PrognoseMonat[] = []
  let saldo = e.liquiditaet
  let vermoegen = e.vermoegen
  let gesamtTief = { betrag: saldo, datum: e.heute }

  for (let i = 0; i < n; i++) {
    const monat = addMonate(startMonat, i)
    const { y, m } = parse(monat + '-01')
    const dim = tageImMonat(y, m)
    const teil = i === 0
    const ersterTagImMonat = teil ? parse(ersterTag).d : 1
    // Heute ist der letzte Tag des Monats: der laufende Monat hat keine Resttage.
    const monatBeginnt = teil && monatVon(ersterTag) !== monat ? dim + 1 : ersterTagImMonat
    const resttage = Math.max(0, dim - monatBeginnt + 1)
    if (teil && resttage === 0) continue

    const tagEin = Math.max(0, basisEinnahmenOhneLohn - (fixZu.get(monat) ?? 0)) / dim
    const tagAus = Math.max(0, basisAusgaben - (fixAb.get(monat) ?? 0)) / dim
    const lohnDatum = tagImMonat(monat, e.lohnTag ?? 1)
    const zusatzTag = tagImMonat(monat, 15)

    let ein = 0, aus = 0
    let tief = { betrag: Number.POSITIVE_INFINITY, datum: monat + '-01' }

    for (let d = monatBeginnt; d <= dim; d++) {
      const datum = format(y, m, d)
      let tagesEin = tagEin
      let tagesAus = tagAus
      if (datum === lohnDatum) tagesEin += lohnLevel(monat)
      if (datum === zusatzTag) { tagesEin += zusatzEin(monat); tagesAus += zusatzAus(monat) }
      const w = wirkungAm.get(datum) ?? 0
      if (w > 0) tagesEin += w
      else if (w < 0) tagesAus += -w

      ein += tagesEin
      aus += tagesAus
      saldo += tagesEin - tagesAus
      if (saldo < tief.betrag) tief = { betrag: saldo, datum }
    }
    if (tief.betrag < gesamtTief.betrag) gesamtTief = { betrag: tief.betrag, datum: tief.datum }

    // Vermögen: nur Konsum und normale Einnahmen verändern es, Anlagen tauschen nur.
    const anteil = resttage / dim
    const nwEin = (basisEinnahmenOhneLohnEcht + lohnLevel(monat) + zusatzEin(monat)) * anteil
    const nwAus = (basisAusgabenEcht + zusatzAus(monat)) * anteil
    vermoegen += nwEin - nwAus

    monate.push({
      month: monat,
      einnahmen: round2(ein),
      ausgaben: round2(aus),
      liquiditaetEnde: round2(saldo),
      tiefpunkt: round2(tief.betrag),
      tiefpunktDatum: tief.datum,
      vermoegenEnde: round2(vermoegen),
      teilmonat: teil,
    })
  }

  if (gesamtTief.betrag < 0) {
    warnungen.push(
      `Die Liquidität wird voraussichtlich am ${gesamtTief.datum} negativ (${round2(gesamtTief.betrag)} €). ` +
      'Das ist eine Fortschreibung deiner bisherigen Monate, keine Sicherheit — aber ein Anlass, die Abbuchungen und Einzahlungen davor anzusehen.',
    )
  }
  if (basis.length > 0 && basisLohn === 0 && !e.annahmen.some(a => a.art === 'lohn')) {
    warnungen.push('In den Basismonaten ist kein Lohn gebucht (Steuerrolle „lohn"). Ein erwartetes Gehalt kannst du als Annahme eintragen.')
  }

  return {
    monate,
    start: { liquiditaet: round2(e.liquiditaet), vermoegen: round2(e.vermoegen) },
    tiefpunkt: { betrag: round2(gesamtTief.betrag), datum: gesamtTief.datum },
    basis: {
      einnahmenOhneLohn: round2(basisEinnahmenOhneLohn),
      lohn: round2(basisLohn),
      ausgaben: round2(basisAusgaben),
      basisMonate: basis.length,
      saldo: round2(basisEinnahmenOhneLohn + basisLohn - basisAusgaben),
    },
    termine: termineRoh
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(0, 24)
      .map(t => ({ datum: t.datum, name: t.name, betrag: round2(t.wirkung) })),
    warnungen,
  }
}
