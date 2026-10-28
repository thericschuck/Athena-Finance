import { addMonate, addTage, median, monatVon, parse, tageImMonat, tagImMonat, format } from './datum.ts'
import { lohnImMonat, summeImMonat, type Annahme } from './annahmen.ts'
import { termineImFenster, type TerminVertrag } from './termine.ts'
import { baueModell, faecher, hashe, type TagesSumme, type ZyklusModell } from './zyklus.ts'

/**
 * Cashflow-Prognose: wie entwickeln sich Liquidität und Vermögen in den nächsten Monaten?
 *
 * Reine Funktion, keine Datenbank. Sie schreibt die Historie fort — keine Vorhersage:
 *
 *   Muster      Das Zyklusmodell (zyklus.ts) lernt aus ALLER Historie, wie sich Einnahmen und
 *               Ausgaben über den Monat und die Woche verteilen (Gehalt am 27., am Wochenende wird
 *               nicht gebucht). Wie stark jüngere Tage zählen, wählt ein Backtest aus den Daten.
 *   Lohn        wird getrennt behandelt: Niveau = Median der letzten Monate, Eingang am typischen Tag.
 *               Eine Annahme „Gehalt" ersetzt das Niveau.
 *   Verträge    liegen auf ihrem Abbuchungstag. Ihre bisherigen Buchungen werden vor dem Lernen aus der
 *               Historie herausgerechnet, damit sie nicht doppelt zählen (einmal im Muster, einmal als
 *               Termin).
 *   Annahmen    Änderungen, die in der Vergangenheit noch nicht stehen (siehe annahmen.ts).
 *   Fächer      Die Tageswerte sind klumpig. Aus den echten Abweichungen des Modells wird ein
 *               80-%-Bereich um die erwartete Kurve gerechnet (Block-Bootstrap).
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
  /** Tagessummen der GANZEN Historie bis einschließlich heute. */
  tage: TagesSumme[]
  /** Typischer Tag des Monats, an dem der Lohn eingeht. null = unbekannt (dann der 1.). */
  lohnTag: number | null
  annahmen: Annahme[]
  /** true: kein Lohn erwartet (z. B. Ansicht eines Partners ohne Lohn-Buchungen); die Warnung „kein Lohn gebucht“ entfällt. */
  ohneLohnWarnung?: boolean
}

export type PrognoseTag = {
  datum: string
  liquiditaet: number
  /** 80-%-Bereich um die erwartete Liquidität. */
  liquiditaetUnten: number
  liquiditaetOben: number
  vermoegen: number
  vermoegenUnten: number
  vermoegenOben: number
}

export type PrognoseMonat = {
  month: string
  einnahmen: number
  ausgaben: number
  /** Liquidität am Monatsende. */
  liquiditaetEnde: number
  /** Tiefster erwarteter Stand im Monat und der Tag, an dem er erreicht wird. */
  tiefpunkt: number
  tiefpunktDatum: string
  /** Nettovermögen am Monatsende. */
  vermoegenEnde: number
  /** true beim laufenden Monat: nur die Resttage sind prognostiziert. */
  teilmonat: boolean
}

export type BekannterTermin = { datum: string; name: string; betrag: number }

export type ModellInfo = Pick<ZyklusModell, 'halbwertszeit' | 'daten' | 'backtest' | 'zyklen' | 'muster' | 'hinweise'>

export type Prognose = {
  monate: PrognoseMonat[]
  /** Tageswerte der Prognose (erwartet plus 80-%-Bereich). */
  tage: PrognoseTag[]
  start: { liquiditaet: number; vermoegen: number }
  /** Tiefster erwarteter Stand. */
  tiefpunkt: { betrag: number; datum: string }
  /** Tiefster Stand der unteren Bereichsgrenze: „in 1 von 10 Verläufen noch tiefer". */
  risikoTiefpunkt: { betrag: number; datum: string }
  /** Durchschnitt der nächsten 30 Tage, als Orientierung. */
  basis: {
    einnahmenOhneLohn: number
    lohn: number
    ausgaben: number
    /** Monatlicher Überschuss (Einnahmen + Lohn − Ausgaben) ohne Annahmen und Termine. */
    saldo: number
  }
  modell: ModellInfo
  termine: BekannterTermin[]
  warnungen: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
/** Vertragsarten, die Geld nur zwischen eigenen Töpfen verschieben (keine Ausgabe im Sinne des Vermögens). */
const UEBERTRAG_TYPEN = new Set(['transfer', 'savings_plan', 'building_savings'])

/** Liquiditätswirkung eines Vertragstermins: negativ = Abfluss vom liquiden Konto. */
export function vertragsWirkung(v: PrognoseVertrag, liquide: Set<string>): number {
  const von = v.account_id === null ? true : liquide.has(v.account_id) // unbekanntes Konto: wie liquide
  const nach = v.to_account_id !== null && liquide.has(v.to_account_id)
  if (v.type === 'income') return von ? v.amount : 0
  if (von && !nach) return -v.amount
  if (!von && nach) return v.amount
  return 0 // zwischen zwei liquiden Konten oder zwei illiquiden: kein Effekt auf die Summe
}

/** Wirkung eines Vertragstermins auf das Nettovermögen: Überträge ändern es nicht, Abos und Einnahmen schon. */
function vermoegensWirkung(v: PrognoseVertrag): number {
  if (UEBERTRAG_TYPEN.has(v.type)) return 0
  return v.type === 'income' ? v.amount : -v.amount
}

/**
 * Rechnet die bisherigen Vertragsbuchungen aus der Historie heraus. Sie kommen später als feste
 * Termine zurück; blieben sie im Muster, zählten sie doppelt. Nur bis zur Höhe dessen, was an dem
 * Tag tatsächlich gebucht wurde (nie unter 0).
 */
export function ohneVertragsbuchungen(
  tage: TagesSumme[], vertraege: PrognoseVertrag[], liquide: Set<string>, heute: string,
): TagesSumme[] {
  if (tage.length === 0 || vertraege.length === 0) return tage
  const nachDatum = new Map(tage.map(t => [t.datum, { ...t }]))
  const erster = tage.reduce((m, t) => (t.datum < m ? t.datum : m), tage[0].datum)
  for (const v of vertraege) {
    if (!(v.amount > 0)) continue
    const wirkung = vertragsWirkung(v, liquide)
    const vermoegen = vermoegensWirkung(v)
    if (wirkung === 0 && vermoegen === 0) continue
    for (const datum of termineImFenster(v, erster, heute)) {
      const t = nachDatum.get(datum)
      if (!t) continue
      if (wirkung < 0) t.ausgaben = Math.max(0, t.ausgaben + wirkung)
      else if (wirkung > 0) t.einnahmen = Math.max(0, t.einnahmen - wirkung)
      if (vermoegen < 0) t.ausgabenEcht = Math.max(0, t.ausgabenEcht + vermoegen)
      else if (vermoegen > 0) t.einnahmenEcht = Math.max(0, t.einnahmenEcht - vermoegen)
    }
  }
  return [...nachDatum.values()]
}

/** Monatlicher Lohn aus der Historie: Median der letzten Monate mit Lohneingang. */
export function lohnNiveau(tage: TagesSumme[], heute: string, anzahl = 6): number {
  const aktuell = monatVon(heute)
  const proMonat = new Map<string, number>()
  for (const t of tage) {
    const m = monatVon(t.datum)
    if (m >= aktuell || !(t.lohn > 0)) continue
    proMonat.set(m, (proMonat.get(m) ?? 0) + t.lohn)
  }
  const letzte = [...proMonat.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-anzahl).map(([, v]) => v)
  return median(letzte)
}

/** Was das Lernen aus der Historie liefert. Hängt NICHT von den Annahmen ab, lässt sich also für Basis und Szenario teilen. */
export type GelernteModelle = {
  mLiq: ZyklusModell
  mNw: ZyklusModell
  basisLohn: number
  /** Fächer je (Reihe, Tage, Seed): die Bootstrap-Rechnung ist deterministisch und kostet pro Aufruf spürbar Zeit. */
  faecherCache: Map<string, { unten: number[]; oben: number[] }>
}

/**
 * Zuletzt gelernte Modelle dieses Prozesses, nach EXAKTEM Eingabetext. Das Lernen kostet 2–3 s und hängt nur von Buchungen, Verträgen,
 * liquiden Konten und dem heutigen Tag ab, nicht von den Annahmen: wer auf der Prognose-Seite Annahmen ändert oder neu lädt,
 * bekommt dieselben Modelle zurück. Der Schlüssel ist der vollständige Text (keine Prüfsumme), eine Verwechslung ist damit ausgeschlossen;
 * höchstens `MODELL_CACHE_MAX` Einträge, der älteste fliegt zuerst raus.
 */
const MODELL_CACHE_MAX = 6
const modellCache = new Map<string, GelernteModelle>()

export function lerneModelle(e: Pick<PrognoseEingaben, 'tage' | 'vertraege' | 'liquideKontoIds' | 'heute'>): GelernteModelle {
  const schluessel = JSON.stringify([e.heute, [...e.liquideKontoIds].sort(), e.vertraege, e.tage])
  const bekannt = modellCache.get(schluessel)
  if (bekannt) return bekannt

  const bereinigt = ohneVertragsbuchungen(e.tage, e.vertraege, new Set(e.liquideKontoIds), e.heute)
  const modelle: GelernteModelle = {
    mLiq: baueModell(bereinigt, e.heute, 'liquiditaet'),
    mNw: baueModell(bereinigt, e.heute, 'vermoegen'),
    basisLohn: lohnNiveau(e.tage, e.heute),
    faecherCache: new Map(),
  }
  modellCache.set(schluessel, modelle)
  if (modellCache.size > MODELL_CACHE_MAX) modellCache.delete(modellCache.keys().next().value as string)
  return modelle
}

/**
 * `gelernt`: bereits gelernte Modelle (siehe `lerneModelle`). Ohne Angabe wird hier gelernt. Wer Basis UND Szenario rechnet, lernt
 * einmal und gibt dieselben Modelle an beide Aufrufe: das Lernen (Backtest über alle Halbwertszeiten) ist der teure Teil.
 */
export function berechnePrognose(e: PrognoseEingaben, gelernt?: GelernteModelle): Prognose {
  const warnungen: string[] = []
  const liquide = new Set(e.liquideKontoIds)
  const n = Math.max(1, Math.min(60, Math.floor(e.monate)))

  // ── Muster lernen (Verträge herausgerechnet) ───────────────────────────────────────────────
  const { mLiq, mNw, basisLohn, faecherCache } = gelernt ?? lerneModelle(e)
  warnungen.push(...mLiq.hinweise)

  // ── Zeitraum ──────────────────────────────────────────────────────────────────────────────
  const startMonat = monatVon(e.heute)
  const endMonat = addMonate(startMonat, n - 1)
  const { y: ey, m: em } = parse(endMonat + '-01')
  const endDatum = format(ey, em, tageImMonat(ey, em))
  const ersterTag = addTage(e.heute, 1)

  // ── Bekannte Termine ──────────────────────────────────────────────────────────────────────
  const termineRoh: { datum: string; name: string; wirkung: number }[] = []
  const wirkungAm = new Map<string, number>()    // Liquidität
  const vermoegenAm = new Map<string, number>()  // Nettovermögen
  for (const v of e.vertraege) {
    if (!(v.amount > 0)) continue
    const wirkung = vertragsWirkung(v, liquide)
    const vw = vermoegensWirkung(v)
    if (wirkung === 0 && vw === 0) continue
    for (const datum of termineImFenster(v, ersterTag, endDatum)) {
      if (wirkung !== 0) {
        termineRoh.push({ datum, name: v.name, wirkung })
        wirkungAm.set(datum, (wirkungAm.get(datum) ?? 0) + wirkung)
      }
      if (vw !== 0) vermoegenAm.set(datum, (vermoegenAm.get(datum) ?? 0) + vw)
    }
  }

  const lohnLevel = (monat: string) => {
    const a = lohnImMonat(e.annahmen, monat)
    return a ? a.betrag : basisLohn
  }
  const zusatzEin = (monat: string) =>
    summeImMonat(e.annahmen, 'einnahme', monat) + summeImMonat(e.annahmen, 'betriebseinnahme', monat)
  const zusatzAus = (monat: string) =>
    summeImMonat(e.annahmen, 'ausgabe', monat) + summeImMonat(e.annahmen, 'betriebsausgabe', monat)

  // ── Tagessimulation ───────────────────────────────────────────────────────────────────────
  type Zeile = { datum: string; liq: number; nw: number; ein: number; aus: number }
  const zeilen: Zeile[] = []
  let liq = e.liquiditaet
  let nw = e.vermoegen
  let basisEin = 0, basisAus = 0

  for (let datum = ersterTag, i = 0; datum <= endDatum && i < 2000; datum = addTage(datum, 1), i++) {
    const monat = monatVon(datum)
    const mu = mLiq.erwartet(datum)
    const nu = mNw.erwartet(datum)
    let tagEin = mu.einnahmen
    let tagAus = mu.ausgaben
    let nwEin = nu.einnahmen
    let nwAus = nu.ausgaben
    if (i < 30) { basisEin += mu.einnahmen; basisAus += mu.ausgaben }

    if (datum === tagImMonat(monat, e.lohnTag ?? 1)) {
      const l = lohnLevel(monat)
      tagEin += l
      nwEin += l
    }
    if (datum === tagImMonat(monat, 15)) {
      tagEin += zusatzEin(monat); tagAus += zusatzAus(monat)
      nwEin += zusatzEin(monat); nwAus += zusatzAus(monat)
    }
    const w = wirkungAm.get(datum) ?? 0
    if (w > 0) tagEin += w
    else if (w < 0) tagAus += -w
    nw += (vermoegenAm.get(datum) ?? 0)

    liq += tagEin - tagAus
    nw += nwEin - nwAus
    zeilen.push({ datum, liq, nw, ein: tagEin, aus: tagAus })
  }

  // ── Fächer: Unsicherheit aus den echten Abweichungen ───────────────────────────────────────
  const seed = hashe(e.heute + '|' + e.tage.length)
  const memo = (reihe: 'liq' | 'nw', residuen: number[], s: number) => {
    const key = `${reihe}|${zeilen.length}|${s}`
    let f = faecherCache.get(key)
    if (!f) { f = faecher(residuen, zeilen.length, { seed: s }); faecherCache.set(key, f) }
    return f
  }
  const fLiq = memo('liq', mLiq.residuen, seed)
  const fNw = memo('nw', mNw.residuen, seed + 1)

  const tage: PrognoseTag[] = zeilen.map((z, k) => ({
    datum: z.datum,
    liquiditaet: round2(z.liq),
    liquiditaetUnten: round2(z.liq + fLiq.unten[k]),
    liquiditaetOben: round2(z.liq + fLiq.oben[k]),
    vermoegen: round2(z.nw),
    vermoegenUnten: round2(z.nw + fNw.unten[k]),
    vermoegenOben: round2(z.nw + fNw.oben[k]),
  }))

  // ── Monatszeilen aus den Tagen ────────────────────────────────────────────────────────────
  const monate: PrognoseMonat[] = []
  let gesamtTief = { betrag: e.liquiditaet, datum: e.heute }
  let risiko = { betrag: Number.POSITIVE_INFINITY, datum: ersterTag }
  const nachMonat = new Map<string, number[]>()
  zeilen.forEach((z, k) => {
    const m = monatVon(z.datum)
    const liste = nachMonat.get(m) ?? []
    liste.push(k)
    nachMonat.set(m, liste)
  })
  for (const [monat, indizes] of nachMonat) {
    let ein = 0, aus = 0
    let tief = { betrag: Number.POSITIVE_INFINITY, datum: zeilen[indizes[0]].datum }
    for (const k of indizes) {
      ein += zeilen[k].ein; aus += zeilen[k].aus
      if (zeilen[k].liq < tief.betrag) tief = { betrag: zeilen[k].liq, datum: zeilen[k].datum }
      if (tage[k].liquiditaetUnten < risiko.betrag) risiko = { betrag: tage[k].liquiditaetUnten, datum: zeilen[k].datum }
    }
    if (tief.betrag < gesamtTief.betrag) gesamtTief = tief
    const letzter = indizes[indizes.length - 1]
    monate.push({
      month: monat,
      einnahmen: round2(ein),
      ausgaben: round2(aus),
      liquiditaetEnde: round2(zeilen[letzter].liq),
      tiefpunkt: round2(tief.betrag),
      tiefpunktDatum: tief.datum,
      vermoegenEnde: round2(zeilen[letzter].nw),
      // Der laufende Monat steht nur drin, wenn es noch Resttage gibt — dann sind es nur diese.
      teilmonat: monat === startMonat,
    })
  }
  if (!Number.isFinite(risiko.betrag)) risiko = { betrag: e.liquiditaet, datum: e.heute }

  if (gesamtTief.betrag < 0) {
    warnungen.push(
      `Die Liquidität wird im erwarteten Verlauf am ${gesamtTief.datum} negativ (${round2(gesamtTief.betrag)} €). ` +
      'Das ist eine Fortschreibung deiner bisherigen Monate, keine Sicherheit — aber ein Anlass, die Abbuchungen und Einzahlungen davor anzusehen.',
    )
  } else if (risiko.betrag < 0) {
    warnungen.push(
      `Im erwarteten Verlauf bleibt die Liquidität positiv, aber in etwa 1 von 10 möglichen Verläufen liegt sie bis zum ${risiko.datum} ` +
      `unter ${round2(risiko.betrag)} €. Ein großer Einzelposten reicht dafür.`,
    )
  }
  if (!e.ohneLohnWarnung && mLiq.daten.tage > 0 && basisLohn === 0 && !e.annahmen.some(a => a.art === 'lohn')) {
    warnungen.push('In den letzten Monaten ist kein Lohn gebucht (Steuerrolle „lohn"). Ein erwartetes Gehalt kannst du als Annahme eintragen.')
  }

  return {
    monate,
    tage,
    start: { liquiditaet: round2(e.liquiditaet), vermoegen: round2(e.vermoegen) },
    tiefpunkt: { betrag: round2(gesamtTief.betrag), datum: gesamtTief.datum },
    risikoTiefpunkt: { betrag: round2(risiko.betrag), datum: risiko.datum },
    basis: {
      einnahmenOhneLohn: round2(basisEin),
      lohn: round2(basisLohn),
      ausgaben: round2(basisAus),
      saldo: round2(basisEin + basisLohn - basisAus),
    },
    modell: {
      halbwertszeit: mLiq.halbwertszeit, daten: mLiq.daten, backtest: mLiq.backtest,
      zyklen: mLiq.zyklen, muster: mLiq.muster, hinweise: mLiq.hinweise,
    },
    termine: termineRoh
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(0, 24)
      .map(t => ({ datum: t.datum, name: t.name, betrag: round2(t.wirkung) })),
    warnungen,
  }
}
