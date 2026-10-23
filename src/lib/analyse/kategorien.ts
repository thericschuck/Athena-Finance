import { rollupByRoot, type FlowInclude, type FlowRow } from '../finance/flow-calc.ts'
import {
  baueKategorien, type KategorienAnsicht, type KategorienModus,
} from '../bank/kategorien.ts'
import {
  imFenster, monatPlus, vergleichBelastbar, type Fenster, type VergleichsModus,
} from './vergleich.ts'

/**
 * Kategorien-Abschnitt der Analyse-Seite: Rechenlogik, rein und ohne React.
 *
 * Die Rangliste (Top 6 + Weitere, Anteile, Unterkategorien, Vorperiode) kommt unveraendert aus
 * `lib/bank/kategorien.ts` (`baueKategorien`) — dieselbe Anzeige wie auf der Bankseite, damit beide
 * Seiten dieselbe Zahl fuer dieselbe Frage nennen. Neu hier:
 *  - die Zeilen kommen aus den Monatssummen (`monatsZeilen`) und werden auf das Monatsfenster der
 *    Seite geschnitten; die Vorperiode ist das Vergleichsfenster der Seite statt der Bank-Logik,
 *  - ein Trend je Hauptkategorie (Monatssummen der letzten Monate) fuer die Sparkline,
 *  - nur die benoetigten Reihen gehen an die Client-Komponente, nicht alle Monatszeilen.
 */

/** Anzahl Monate der Sparkline, endend im laufenden Monat. */
export const TREND_MONATE = 12

/** Schluessel der Sammelzeile „Weitere" (Hover-Karte, Trend). */
export const WEITERE_KEY = '__weitere__'

const FARBE_OHNE = 'var(--danger)'
const FARBE_WEITERE = 'var(--chart-muted-2)'
const palette = (i: number): string => `var(--chart-cat-${(i % 6) + 1})`

/** Was die Rechnung von der Seite braucht (Teilmenge von `AnalyseDaten`). */
export interface KategorienEingabe {
  monatsZeilen: (FlowRow & { month: string })[]
  categories: { id: string; color?: string | null; icon?: string | null }[]
  include: FlowInclude
  heute: string
  fenster: Fenster | null
  vergleichsFenster: Fenster | null
  vergleich: VergleichsModus
  fruehesterMonat: string | null
  /** Monats-Drilldown aus der URL (`YYYY-MM`); engt den Abschnitt auf diesen Monat ein. */
  monat: string | null
  locale: string
}

export interface KategorieDarstellung {
  farbe: string
  symbol: string | null
}

export interface KategorienModusDaten {
  ansicht: KategorienAnsicht
  /** Farbe und Symbol je `schluessel` (auch fuer die Zeilen in „Weitere"). */
  darstellung: Record<string, KategorieDarstellung>
  /** Monatswerte (positiv, in `monate`-Reihenfolge) je `schluessel`; „Weitere" unter `WEITERE_KEY`. */
  trend: Record<string, number[]>
}

export interface AnalyseKategorienDaten {
  modi: Record<KategorienModus, KategorienModusDaten>
  /** Monatserste (`YYYY-MM-01`) der Trendreihen, aufsteigend; der letzte ist der laufende Monat. */
  monate: string[]
  /** Gibt es einen belastbaren Vergleich? `art` sagt, womit verglichen wird. */
  vergleich: { aktiv: boolean; art: Exclude<VergleichsModus, 'aus'> | null }
  /** Der laufende Monat ist noch nicht vorbei: sein letzter Trendpunkt ist unvollstaendig. */
  laufenderMonat: { tag: number; tageImMonat: number; unvollstaendig: boolean }
  locale: string
  /** Zaehlen Anlagen/Forderungen mit? (Hinweistext) */
  anlageMit: boolean
  /** Zeitraum „Alles": die Monatssummen reichen nur ueber die geladene Historie. */
  ganzeHistorie: boolean
  monat: string | null
}

/**
 * Aktuelles Fenster und belastbare Vorperiode dieses Abschnitts. Normal die der Seite; mit
 * Monats-Drilldown der gewaehlte Monat gegen den Monat davor (bzw. Vorjahresmonat). `vor` ist
 * `null`, wenn der Vergleich aus ist oder die Historie ihn nicht abdeckt — dann zeigt die
 * Anzeige kein Delta, statt einen Zuwachs vorzutaeuschen.
 */
export function kategorienFenster(
  e: Pick<KategorienEingabe, 'fenster' | 'vergleichsFenster' | 'vergleich' | 'fruehesterMonat' | 'monat' | 'heute'>,
): { aktuell: Fenster | null; vor: Fenster | null } {
  let aktuell = e.fenster
  let vor = e.vergleichsFenster
  if (e.monat) {
    const von = `${e.monat}-01`
    aktuell = { von, bis: von }
    if (e.vergleich === 'aus') vor = null
    else {
      const v = monatPlus(von, e.vergleich === 'vorjahr' ? -12 : -1)
      // Die Seite laedt nur 24 Monate (plus ihr Vergleichsfenster): davor fehlen die Zeilen.
      vor = v >= monatPlus(e.heute, -24) ? { von: v, bis: v } : null
    }
  }
  return { aktuell, vor: vor && vergleichBelastbar(vor, e.fruehesterMonat) ? vor : null }
}

/** Baut Ansicht, Farben und Trendreihen fuer EINEN Modus (Ausgaben oder Einnahmen). */
function baueModus(
  rows: (FlowRow & { month: string })[],
  vorRows: (FlowRow & { month: string })[] | null,
  proMonat: Map<string, (FlowRow & { month: string })[]>,
  monate: string[],
  e: KategorienEingabe,
  modus: KategorienModus,
): KategorienModusDaten {
  const ansicht = baueKategorien(rows, vorRows, e.include, modus)
  const by = modus === 'ausgaben' ? 'expense' : 'income'

  const byId = new Map(e.categories.map(c => [c.id, c]))
  const darstellung: Record<string, KategorieDarstellung> = {}
  let i = 0
  for (const z of [...ansicht.zeilen, ...ansicht.weitere]) {
    if (z.ohneKategorie) { darstellung[z.schluessel] = { farbe: FARBE_OHNE, symbol: null }; continue }
    const kat = z.id ? byId.get(z.id) : undefined
    darstellung[z.schluessel] = { farbe: kat?.color || palette(i), symbol: kat?.icon ?? null }
    i++
  }
  darstellung[WEITERE_KEY] = { farbe: FARBE_WEITERE, symbol: null }

  // Monatswerte nur fuer Kategorien, die die Anzeige auch zeigt.
  const gezeigt = new Set([...ansicht.zeilen, ...ansicht.weitere].map(z => z.schluessel))
  const weitereKeys = new Set(ansicht.weitere.map(z => z.schluessel))
  const trend: Record<string, number[]> = {}
  for (const k of gezeigt) trend[k] = new Array<number>(monate.length).fill(0)
  if (weitereKeys.size > 0) trend[WEITERE_KEY] = new Array<number>(monate.length).fill(0)

  monate.forEach((monat, idx) => {
    const zeilen = proMonat.get(monat)
    if (!zeilen) return
    for (const r of rollupByRoot(zeilen, e.include, by)) {
      const schluessel = r.id ?? '__none__'
      const v = Math.max(modus === 'ausgaben' ? r.expense : r.income, 0)
      if (trend[schluessel]) trend[schluessel][idx] = v
      if (weitereKeys.has(schluessel)) trend[WEITERE_KEY][idx] += v
    }
  })

  return { ansicht, darstellung, trend }
}

export function baueAnalyseKategorien(e: KategorienEingabe): AnalyseKategorienDaten {
  const { aktuell, vor } = kategorienFenster(e)

  const rows = e.monatsZeilen.filter(r => imFenster(r.month, aktuell))
  const vorRows = vor ? e.monatsZeilen.filter(r => imFenster(r.month, vor)) : null

  const aktuellerMonat = `${e.heute.slice(0, 7)}-01`
  const monate = Array.from({ length: TREND_MONATE }, (_, k) => monatPlus(aktuellerMonat, k - (TREND_MONATE - 1)))
  const proMonat = new Map<string, (FlowRow & { month: string })[]>()
  for (const r of e.monatsZeilen) {
    const m = `${r.month.slice(0, 7)}-01`
    if (!monate.includes(m)) continue
    const liste = proMonat.get(m)
    if (liste) liste.push(r)
    else proMonat.set(m, [r])
  }

  const [j, m] = e.heute.slice(0, 7).split('-').map(Number)
  const tag = Number(e.heute.slice(8, 10))
  const tageImMonat = new Date(Date.UTC(j, m, 0)).getUTCDate()

  return {
    modi: {
      ausgaben: baueModus(rows, vorRows, proMonat, monate, e, 'ausgaben'),
      einnahmen: baueModus(rows, vorRows, proMonat, monate, e, 'einnahmen'),
    },
    monate,
    vergleich: { aktiv: vor !== null, art: vor !== null && e.vergleich !== 'aus' ? e.vergleich : null },
    laufenderMonat: { tag, tageImMonat, unvollstaendig: tag < tageImMonat },
    locale: e.locale,
    anlageMit: e.include.anlage || e.include.forderung,
    ganzeHistorie: aktuell === null,
    monat: e.monat,
  }
}
