import { rollupByRoot, type FlowInclude, type FlowRow, type CategoryTotal } from '../finance/flow-calc.ts'
import type { BankFlowZeile, BankSeitenDaten, BankScope } from './typen.ts'

/**
 * Rechenlogik der Kategorienanzeige (Einnahmen/Ausgaben nach Hauptkategorie) auf der
 * Bankdaten-Seite. Rein und ohne React, damit sich Vorperiode, Top-N und Anteile testen lassen.
 */

export type KategorienModus = 'ausgaben' | 'einnahmen'

/** Wie viele Hauptkategorien einzeln gezeigt werden, bevor der Rest zu „Weitere" wird. */
export const TOP_KATEGORIEN = 6

export interface KategorieKind {
  /** Kategorie-ID; `null` = Buchungen ohne Kategorie. */
  id: string | null
  name: string
  betrag: number
  /** Anteil an der Hauptkategorie, 0..1. */
  anteil: number
  /** Buchungen liegen direkt in der Hauptkategorie, nicht in einer Unterkategorie. */
  direkt: boolean
}

export interface KategorieZeile {
  /** Stabiler Schluessel (React-Key, Vorperioden-Zuordnung). */
  schluessel: string
  id: string | null
  name: string
  betrag: number
  /** Anteil an der Gesamtsumme, 0..1. */
  anteil: number
  /** Betrag der Vorperiode; `null`, wenn es keine belastbare Vorperiode gibt. */
  vorBetrag: number | null
  /** Veraenderung in Prozent (0.12 = +12 %); `null`, wenn die Vorperiode 0 oder unbekannt ist. */
  deltaPct: number | null
  ohneKategorie: boolean
  kinder: KategorieKind[]
}

export interface KategorienAnsicht {
  total: number
  vorTotal: number | null
  deltaPct: number | null
  /** Anzahl Hauptkategorien (inkl. der in „Weitere" zusammengefassten). */
  anzahl: number
  /** Einzeln gezeigte Zeilen nach Betrag absteigend; „Ohne Kategorie" steht an seinem Rang. */
  zeilen: KategorieZeile[]
  /** Der Rest hinter den Top-N, nach Betrag absteigend. Leer, wenn nichts zusammengefasst ist. */
  weitere: KategorieZeile[]
  /** Summe von `weitere`. */
  weitereBetrag: number
  weitereVorBetrag: number | null
  weitereDeltaPct: number | null
}

const NONE = '__none__'
const schluesselVon = (id: string | null): string => id ?? NONE

const monatAdd = (monat: string, n: number): string => {
  const [y, m] = monat.slice(0, 7).split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`
}
const monatIdx = (monat: string): number => {
  const [y, m] = monat.slice(0, 7).split('-').map(Number)
  return y * 12 + (m - 1)
}

/**
 * Flow-Zeilen der Vorperiode gleicher Laenge, direkt vor dem gewaehlten Zeitraum — auf
 * MONATSEBENE wie in scope.ts. Beispiel: 6M bis Oktober (Mai..Okt) -> Nov..Apr davor;
 * gewaehlter Monat -> der Monat davor.
 *
 * `null`, wenn es keine belastbare Vorperiode gibt, damit die Anzeige kein Delta erfindet:
 *  - Zeitraum „Alles" (kein Beginn),
 *  - Konto gewaehlt, aber ohne verknuepfte account_id,
 *  - die Daten beginnen erst NACH dem Anfang der Vorperiode (sie waere unvollstaendig, das
 *    Delta wuerde einen Zuwachs vortaeuschen).
 * Hinweis: der laufende Monat ist im aktuellen Zeitraum nur teilweise gefuellt; die Vorperiode
 * besteht aus vollen Monaten. Das ist bewusst so (Monatsebene), steht aber im Tooltip der UI.
 */
export function vorperiodenFlows(
  d: Pick<BankSeitenDaten, 'cutoff' | 'monat' | 'heute' | 'konto' | 'flowRows'>,
  scope: Pick<BankScope, 'kontoAccountId'>,
): BankFlowZeile[] | null {
  const start = d.monat ? `${d.monat}-01` : d.cutoff ? `${d.cutoff.slice(0, 7)}-01` : null
  if (!start) return null
  const ende = d.monat ? start : `${d.heute.slice(0, 7)}-01`
  const n = monatIdx(ende) - monatIdx(start) + 1
  if (n < 1) return null

  if (d.konto && scope.kontoAccountId === null) return null
  const konto = d.flowRows.filter(r => !d.konto || r.account_id === scope.kontoAccountId)
  if (konto.length === 0) return null

  const vorStart = monatAdd(start, -n)
  const vorEnde = monatAdd(start, -1)
  const fruehester = konto.reduce((m, r) => (r.month < m ? r.month : m), konto[0].month)
  if (fruehester.slice(0, 7) > vorStart.slice(0, 7)) return null

  return konto.filter(r => r.month.slice(0, 7) >= vorStart.slice(0, 7) && r.month.slice(0, 7) <= vorEnde.slice(0, 7))
}

const wert = (r: { income: number; expense: number }, modus: KategorienModus): number =>
  modus === 'ausgaben' ? r.expense : r.income

const delta = (aktuell: number, vor: number | null): number | null =>
  vor !== null && vor > 0 ? (aktuell - vor) / vor : null

/**
 * Bereitet Zeilen fuer die Anzeige auf. Nur positive Betraege zaehlen (eine Kategorie mit
 * Nettoerstattung haette keinen sinnvollen Anteil). „Ohne Kategorie" wird nie in „Weitere"
 * versteckt, weil es der Hinweis ist, dass noch etwas zu kategorisieren ist.
 */
export function baueKategorien(
  rows: FlowRow[],
  vorRows: FlowRow[] | null,
  include: FlowInclude,
  modus: KategorienModus,
  topN: number = TOP_KATEGORIEN,
): KategorienAnsicht {
  const by = modus === 'ausgaben' ? 'expense' : 'income'
  const rolled = rollupByRoot(rows, include, by).filter(r => wert(r, modus) > 0)
  const vorMap = new Map<string, number>()
  if (vorRows) for (const r of rollupByRoot(vorRows, include, by)) vorMap.set(schluesselVon(r.id), wert(r, modus))

  const total = rolled.reduce((s, r) => s + wert(r, modus), 0)
  const vorTotal = vorRows ? [...vorMap.values()].reduce((s, v) => s + Math.max(v, 0), 0) : null

  const zuZeile = (r: CategoryTotal): KategorieZeile => {
    const betrag = wert(r, modus)
    const vorBetrag = vorRows ? Math.max(vorMap.get(schluesselVon(r.id)) ?? 0, 0) : null
    const kinder = r.children
      .filter(c => wert(c, modus) > 0)
      .map<KategorieKind>(c => ({
        id: c.id,
        name: c.name,
        betrag: wert(c, modus),
        anteil: betrag > 0 ? wert(c, modus) / betrag : 0,
        direkt: c.id === r.id,
      }))
    return {
      schluessel: schluesselVon(r.id),
      id: r.id,
      name: r.name,
      betrag,
      anteil: total > 0 ? betrag / total : 0,
      vorBetrag,
      deltaPct: delta(betrag, vorBetrag),
      ohneKategorie: r.id === null,
      kinder,
    }
  }

  const alle = rolled.map(zuZeile)
  const ohne = alle.filter(z => z.ohneKategorie)
  const normal = alle.filter(z => !z.ohneKategorie)
  const top = normal.slice(0, topN)
  const weitere = normal.slice(topN)
  const zeilen = [...top, ...ohne].sort((a, b) => b.betrag - a.betrag)

  const weitereBetrag = weitere.reduce((s, z) => s + z.betrag, 0)
  const weitereVor = vorRows ? weitere.reduce((s, z) => s + (z.vorBetrag ?? 0), 0) : null

  return {
    total,
    vorTotal,
    deltaPct: delta(total, vorTotal),
    anzahl: alle.length,
    zeilen,
    weitere,
    weitereBetrag,
    weitereVorBetrag: weitereVor,
    weitereDeltaPct: delta(weitereBetrag, weitereVor),
  }
}
