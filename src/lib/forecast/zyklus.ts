import { addTage, parse, tageZwischen } from './datum.ts'

/**
 * Zyklusmodell für die Tagesflüsse: lernt aus ALLER vorhandenen Historie, wie sich Einnahmen und
 * Ausgaben über den Monat (Tag im Monat) und die Woche (Wochentag) verteilen, und schreibt das nach
 * vorn fort — statt den Monatsmedian gleichmäßig auf jeden Tag zu verteilen.
 *
 * Warum kein reines Fourier-Modell: eine Fourier-Zerlegung zerlegt die Reihe in Sinuswellen. Die
 * Muster dieser Daten sind aber keine Sinuswellen, sondern Spitzen („Gehalt am 27.", „am Wochenende
 * bucht keine Bank"). Ein Profil je Tag im Monat und je Wochentag fängt sie direkt; dasselbe als
 * Sinuswellen bräuchte dutzende Oberschwingungen und würde überanpassen. Das Periodogramm
 * (`zyklen`) bleibt als Befund: es zeigt, WELCHE Perioden in den Daten wirklich stecken.
 *
 * Gewichtung: jeder Tag zählt, jüngere zählen mehr (Halbwertszeit). Wie stark, wählt ein
 * Rolling-Origin-Backtest aus den Daten selbst: das jüngste Gedächtnis, das den Fehler des besten um
 * höchstens 2 % übersteigt. Bei Gleichstand gewinnt also die Gegenwart, nicht die Vergangenheit.
 *
 * Unsicherheit: die Tageswerte sind klumpig (einzelne Posten von 1.000 € und mehr). Deshalb liefert
 * `faecher` aus den echten Abweichungen des Modells (Block-Bootstrap) einen Schwankungsbereich um die
 * erwartete Kurve.
 *
 * Reine Funktionen, keine Imports außer Datums-Helfern, damit `node --test` die Datei direkt lädt.
 */

export type TagesSumme = {
  /** `YYYY-MM-DD` */
  datum: string
  /** Alles, was zählt (echt + anlage + forderung), inklusive Lohn. */
  einnahmen: number
  ausgaben: number
  /** Nur Konsum und normale Einnahmen (`echt`). */
  einnahmenEcht: number
  ausgabenEcht: number
  /** Teil der Einnahmen mit Steuerrolle `lohn` (netto); wird getrennt modelliert. */
  lohn: number
}

export type Reihe = 'liquiditaet' | 'vermoegen'

export type Zyklus = { periode: number; staerke: number }

export type ZyklusModell = {
  /** Gewählte Halbwertszeit in Tagen; `null` = alle Tage gleich gewichtet. */
  halbwertszeit: number | null
  daten: { von: string; bis: string; tage: number }
  backtest: {
    ursprunge: number
    fehlerModell: number
    fehlerFlach: number
    /** Positiv = das Modell ist besser als der flache Verlauf. */
    verbesserungPct: number
    fehlerJeHalbwertszeit: { halbwertszeit: number | null; fehler: number }[]
  } | null
  /** Erwartete Tageswerte (ohne Lohn) für ein beliebiges Datum. */
  erwartet: (datum: string) => { einnahmen: number; ausgaben: number }
  /** Abweichungen des Modells von der Wirklichkeit (netto je Tag), für `faecher`. */
  residuen: number[]
  /** Auffällige Perioden aus dem Periodogramm (Tage), stärkste zuerst. */
  zyklen: Zyklus[]
  /** In Worten, was das Modell in den Daten gefunden hat. */
  muster: string[]
  hinweise: string[]
}

export type ModellOptionen = {
  /** Kandidaten für die Halbwertszeit; `null` = alle Tage gleich. */
  halbwertszeiten?: (number | null)[]
  /** Wie weit der Backtest vorausschaut. */
  horizont?: number
  /** Abstand der Ausgangspunkte im Backtest in Tagen. */
  schritt?: number
  /** Stärke der Glättung zum Mittel hin (höher = vorsichtiger bei wenig Daten je Tag). */
  schrumpf?: number
}

const KANDIDATEN: (number | null)[] = [120, 250, 500, 1000, null]
const wochentag = (datum: string): number => {
  const { y, m, d } = parse(datum)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Montag = 0
}
const tagImMonat = (datum: string): number => parse(datum).d

/** Auf lückenlose Tagesreihe bringen (fehlende Tage = 0, denn kein Eintrag heißt keine Buchung). */
export function tagesReihe(
  tage: TagesSumme[], bis: string, reihe: Reihe,
): { start: string; ein: number[]; aus: number[] } | null {
  const mitDaten = tage.filter(t => t.datum <= bis)
  if (mitDaten.length === 0) return null
  const start = mitDaten.reduce((m, t) => (t.datum < m ? t.datum : m), mitDaten[0].datum)
  const n = tageZwischen(start, bis) + 1
  const ein = new Array<number>(n).fill(0)
  const aus = new Array<number>(n).fill(0)
  for (const t of mitDaten) {
    const i = tageZwischen(start, t.datum)
    const e = reihe === 'liquiditaet' ? t.einnahmen : t.einnahmenEcht
    ein[i] += Math.max(0, e - t.lohn)   // Lohn wird getrennt modelliert
    aus[i] += reihe === 'liquiditaet' ? t.ausgaben : t.ausgabenEcht
  }
  return { start, ein, aus }
}

type Anpassung = {
  erwartet: (datum: string) => { einnahmen: number; ausgaben: number }
  /** Wie `erwartet`, aber mit Tag im Monat und Wochentag (Montag = 0) statt eines Datums-Strings. Für Schleifen über viele Tage. */
  erwartetAn: (tagImMonat: number, wochentag: number) => { einnahmen: number; ausgaben: number }
}

type Profil = { q: number[]; f: number[]; mittel: number }

/**
 * Profil EINER Reihe aus den Tagen vor `o`: Tag-im-Monat-Niveau `q` (geglättet, zum Mittel hin
 * geschrumpft) und Wochentagsfaktor `f` (Mittel 1). Beide werden abwechselnd angepasst („Backfitting"):
 * jeder rechnet den anderen heraus. Ohne das verfälschen sie sich gegenseitig — fällt der 28. mal auf
 * einen Dienstag, mal auf einen Freitag, würde sonst ein Teil des Monatsendes dem Wochentag
 * zugeschrieben.
 */
function profilVon(
  reihe: number[], dom: number[], wd: number[], g: Float64Array, o: number, schrumpf: number,
): Profil {
  let summe = 0, gewicht = 0
  for (let i = 0; i < o; i++) { summe += reihe[i] * g[i]; gewicht += g[i] }
  const mittel = gewicht > 0 ? summe / gewicht : 0
  if (!(mittel > 0)) return { q: new Array(32).fill(0), f: new Array(7).fill(1), mittel: 0 }

  let f: number[] = new Array(7).fill(1)
  let q: number[] = new Array(32).fill(mittel)
  for (let durchgang = 0; durchgang < 3; durchgang++) {
    // Tag im Monat, Wochentag herausgerechnet
    const s = new Array(32).fill(0), n = new Array(32).fill(0)
    for (let i = 0; i < o; i++) { s[dom[i]] += (reihe[i] / f[wd[i]]) * g[i]; n[dom[i]] += g[i] }
    const roh = new Array(32).fill(mittel)
    for (let d = 1; d <= 31; d++) {
      // Tag davor, Tag, Tag danach (rund um den Monatswechsel); Summationsreihenfolge wie bisher.
      let ss = 0, c = 0
      for (let dd = d - 1; dd <= d + 1; dd++) {
        const x = dd < 1 ? 31 : dd > 31 ? 1 : dd
        ss += s[x]; c += n[x]
      }
      const rohwert = c > 0 ? ss / c : mittel
      const k = c / (c + schrumpf * 0.5)
      roh[d] = k * rohwert + (1 - k) * mittel
    }
    // Auf das Mittel normieren: über einen Monat soll das Profil im Schnitt wieder `mittel` ergeben.
    const mp = roh.slice(1, 31).reduce((x, y) => x + y, 0) / 30
    q = roh.map(x => (mp > 0 ? (x * mittel) / mp : x))

    // Wochentag, Tag im Monat herausgerechnet: Verhältnis von Wirklichkeit zu Profilerwartung
    const num = new Array(7).fill(0), den = new Array(7).fill(0)
    for (let i = 0; i < o; i++) { num[wd[i]] += reihe[i] * g[i]; den[wd[i]] += q[dom[i]] * g[i] }
    f = num.map((x, w) => (den[w] > 0 ? x / den[w] : 1))
    const mf = f.reduce((x, y) => x + y, 0) / 7
    f = f.map(x => (mf > 0 ? x / mf : 1))
  }
  return { q, f, mittel }
}

/** Anpassung auf die Tage vor `o` mit Halbwertszeit `h` (`null` = alle Tage gleich). */
function passeAn(
  ein: number[], aus: number[], dom: number[], wd: number[], o: number, h: number | null, schrumpf: number,
): Anpassung {
  const g = new Float64Array(o)
  for (let i = 0; i < o; i++) g[i] = h === null ? 1 : Math.pow(0.5, (o - i) / h)
  const pE = profilVon(ein, dom, wd, g, o, schrumpf)
  const pA = profilVon(aus, dom, wd, g, o, schrumpf)
  const erwartetAn = (d: number, w: number) => ({ einnahmen: pE.q[d] * pE.f[w], ausgaben: pA.q[d] * pA.f[w] })
  return {
    erwartet: datum => erwartetAn(tagImMonat(datum), wochentag(datum)),
    erwartetAn,
  }
}

/** Fehler eines Verfahrens: mittlere Abweichung des kumulierten Pfades über `horizont` Tage. */
function pfadFehler(
  vorhersage: (i: number) => number, netto: number[], o: number, horizont: number,
): number {
  let cumP = 0, cumA = 0, abw = 0
  for (let k = 0; k < horizont; k++) {
    cumP += vorhersage(o + k)
    cumA += netto[o + k]
    abw += Math.abs(cumP - cumA)
  }
  return abw / horizont
}

/** Periodogramm (DFT) der Reihe; liefert die auffälligen Perioden relativ zum Rauschniveau. */
export function zyklen(reihe: number[], maxPerioden = 3, schwelle = 4): Zyklus[] {
  const n = reihe.length
  if (n < 60) return []
  const mean = reihe.reduce((a, b) => a + b, 0) / n
  const perioden: number[] = []
  for (let p = 3; p <= Math.min(200, n / 2); p += 0.5) perioden.push(p)
  const leistung = perioden.map(p => {
    let re = 0, im = 0
    for (let i = 0; i < n; i++) {
      const w = (2 * Math.PI * i) / p
      re += (reihe[i] - mean) * Math.cos(w)
      im += (reihe[i] - mean) * Math.sin(w)
    }
    return (re * re + im * im) / n
  })
  const rausch = leistung.reduce((a, b) => a + b, 0) / leistung.length
  if (!(rausch > 0)) return []
  const spitzen: Zyklus[] = []
  for (let i = 0; i < leistung.length; i++) {
    const links = leistung[i - 1] ?? -Infinity, rechts = leistung[i + 1] ?? -Infinity
    if (leistung[i] >= links && leistung[i] >= rechts && leistung[i] / rausch >= schwelle) {
      spitzen.push({ periode: perioden[i], staerke: Math.round((leistung[i] / rausch) * 10) / 10 })
    }
  }
  return spitzen.sort((a, b) => b.staerke - a.staerke).slice(0, maxPerioden)
}

const prozent = (x: number) => `${Math.round(x * 100)} %`

export function baueModell(
  tage: TagesSumme[], heute: string, reihe: Reihe, opt: ModellOptionen = {},
): ZyklusModell {
  const horizont = opt.horizont ?? 30
  const schritt = opt.schritt ?? 7
  const schrumpf = opt.schrumpf ?? 12
  const kandidaten = opt.halbwertszeiten ?? KANDIDATEN
  const hinweise: string[] = []

  const r = tagesReihe(tage, heute, reihe)
  const leer = (): ZyklusModell => ({
    halbwertszeit: null, daten: { von: heute, bis: heute, tage: 0 }, backtest: null,
    erwartet: () => ({ einnahmen: 0, ausgaben: 0 }), residuen: [], zyklen: [], muster: [],
    hinweise: ['Es gibt keine Buchungen als Grundlage — die Prognose enthält nur bekannte Termine und Annahmen.'],
  })
  if (!r) return leer()
  const { start, ein, aus } = r
  const N = ein.length
  const netto = ein.map((e, i) => e - aus[i])
  const dom = ein.map((_, i) => tagImMonat(addTage(start, i)))
  const wd = ein.map((_, i) => wochentag(addTage(start, i)))
  if (N < 45) {
    const a = passeAn(ein, aus, dom, wd, N, null, schrumpf)
    return {
      ...leer(), daten: { von: start, bis: heute, tage: N }, erwartet: a.erwartet,
      hinweise: [`Erst ${N} Tage Historie — das Modell kann keinen Monatsrhythmus lernen, die Prognose ist sehr grob.`],
    }
  }

  // ── Backtest: welche Gewichtung sagt die Vergangenheit am besten voraus? ────────────────
  let halbwertszeit: number | null = null
  let backtest: ZyklusModell['backtest'] = null
  const ersterUrsprung = Math.max(120, Math.floor(N * 0.35))
  const ursprunge: number[] = []
  for (let o = ersterUrsprung; o + horizont <= N; o += schritt) ursprunge.push(o)
  if (ursprunge.length >= 4) {
    const fehler = kandidaten.map(h => {
      let summe = 0
      for (const o of ursprunge) {
        const a = passeAn(ein, aus, dom, wd, o, h, schrumpf)
        // Index statt Datum: o + k < N, Tag im Monat und Wochentag stehen schon in dom/wd (spart Millionen Datums-Strings).
        summe += pfadFehler(i => { const e = a.erwartetAn(dom[i], wd[i]); return e.einnahmen - e.ausgaben }, netto, o, horizont)
      }
      return { halbwertszeit: h, fehler: summe / ursprunge.length }
    })
    // Bei praktisch gleichem Fehler (bis 2 % über dem besten) gewinnt das JÜNGERE Gedächtnis: die
    // neuesten Daten sollen mitreden, solange der Rückblick-Test keinen echten Grund dagegen liefert.
    const rang = (h: number | null) => (h === null ? Infinity : h)
    const bester = fehler.reduce((b, c) => (c.fehler < b.fehler ? c : b))
    const beste = [...fehler]
      .sort((x, y) => rang(x.halbwertszeit) - rang(y.halbwertszeit))
      .find(c => c.fehler <= bester.fehler * 1.02) ?? bester
    halbwertszeit = beste.halbwertszeit

    let flach = 0
    for (const o of ursprunge) {
      let s = 0; for (let i = 0; i < o; i++) s += netto[i]
      const m = s / o
      flach += pfadFehler(() => m, netto, o, horizont)
    }
    flach /= ursprunge.length
    backtest = {
      ursprunge: ursprunge.length,
      fehlerModell: Math.round(beste.fehler),
      fehlerFlach: Math.round(flach),
      verbesserungPct: flach > 0 ? Math.round(((flach - beste.fehler) / flach) * 100) : 0,
      fehlerJeHalbwertszeit: fehler.map(f => ({ halbwertszeit: f.halbwertszeit, fehler: Math.round(f.fehler) })),
    }
    if (backtest.verbesserungPct < -3) {
      hinweise.push('Im Rückblick war ein flacher Verlauf deutlich besser als das Zyklusmodell — die Muster sind in deinen Daten schwach, die Prognose unsicher.')
    }
  } else {
    hinweise.push('Zu wenig Historie für einen Rückblick-Test des Modells; es nutzt alle Tage gleich gewichtet.')
  }

  // ── Endgültige Anpassung auf alle Daten, Residuen für den Fächer ───────────────────────────
  const a = passeAn(ein, aus, dom, wd, N, halbwertszeit, schrumpf)
  const residuen = netto.map((x, i) => {
    const e = a.erwartetAn(dom[i], wd[i])
    return x - (e.einnahmen - e.ausgaben)
  })

  // ── Befunde in Worten ─────────────────────────────────────────────────────────────────────
  const muster: string[] = []
  let gesamtE = 0, spaetE = 0, gesamtA = 0, weA = 0
  for (let i = 0; i < N; i++) {
    gesamtE += ein[i]; gesamtA += aus[i]
    if (dom[i] >= 21) spaetE += ein[i]
    if (wd[i] >= 5) weA += aus[i]
  }
  if (gesamtE > 0 && spaetE / gesamtE >= 0.5) {
    muster.push(`${prozent(spaetE / gesamtE)} der Einnahmen (ohne Lohn) kommen im letzten Monatsdrittel (ab dem 21.).`)
  }
  if (gesamtA > 0 && weA / gesamtA < 0.1) {
    muster.push(`Am Wochenende wird kaum gebucht (${prozent(weA / gesamtA)} der Ausgaben) — die Bank bucht an Werktagen.`)
  }

  return {
    halbwertszeit,
    daten: { von: start, bis: heute, tage: N },
    backtest,
    erwartet: a.erwartet,
    residuen,
    zyklen: zyklen(netto),
    muster,
    hinweise,
  }
}

// ── Fächer: Unsicherheit aus den echten Abweichungen ─────────────────────────────────────────

/** Kleiner, deterministischer Zufallsgenerator (mulberry32): gleiche Eingabe, gleicher Fächer. */
function zufall(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashe(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Schwankungsbereich der KUMULIERTEN Abweichung nach `tage` Tagen: `unten[k]`/`oben[k]` sind das
 * 10.- und 90.-Perzentil der Summe der ersten k+1 Tage an Abweichungen. Block-Bootstrap aus den
 * historischen Residuen (Blöcke von `block` Tagen), damit Häufungen — mehrere große Posten in einer
 * Woche — erhalten bleiben. Auf die erwartete Kurve addiert ergibt das den 80-%-Bereich.
 */
export function faecher(
  residuen: number[], tage: number, opt: { pfade?: number; block?: number; seed?: number } = {},
): { unten: number[]; oben: number[] } {
  const n = residuen.length
  const unten = new Array<number>(tage).fill(0), oben = new Array<number>(tage).fill(0)
  if (n < 14 || tage <= 0) return { unten, oben }
  const S = opt.pfade ?? 300
  const block = Math.min(opt.block ?? 7, n)
  const rnd = zufall(opt.seed ?? 1)
  const summen: Float64Array[] = []
  for (let s = 0; s < S; s++) {
    const pfad = new Float64Array(tage)
    let cum = 0, k = 0
    while (k < tage) {
      const startIdx = Math.floor(rnd() * n)
      for (let b = 0; b < block && k < tage; b++, k++) {
        cum += residuen[(startIdx + b) % n]
        pfad[k] = cum
      }
    }
    summen.push(pfad)
  }
  const lo = Math.floor(S * 0.1), hi = Math.min(S - 1, Math.ceil(S * 0.9) - 1)
  const spalte = new Float64Array(S)
  for (let k = 0; k < tage; k++) {
    for (let s = 0; s < S; s++) spalte[s] = summen[s][k]
    spalte.sort()
    unten[k] = spalte[lo]
    oben[k] = spalte[hi]
  }
  return { unten, oben }
}
