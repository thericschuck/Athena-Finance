import type { SankeyArt, SankeyData, SankeyLinkDatum, SankeyNodeDatum } from '../analyseData.ts'
import type { FlowTransaction } from '../data/flows.ts'

/**
 * Aufbereitung des Geldflusses (Sankey am Desktop, Fluss-Liste auf dem Handy).
 *
 * Beide Darstellungen lesen dieselbe `SankeyData`: das Sankey zeichnet sie, die Fluss-Liste
 * (`zuFlussListe`) liest sie als Zeilen. So können die zwei nie unterschiedliche Zahlen zeigen,
 * und die Landingpage-Demodaten (nur Namen, keine Rollen) laufen über `normalisiereSankey`
 * durch denselben Weg.
 *
 * Reine Funktionen ohne React und ohne Supabase — deshalb mit node:test prüfbar. Die Importe
 * tragen `.ts` und sind relativ, damit der Test-Runner (`node --experimental-strip-types`) sie
 * ohne Alias-Auflösung findet; es sind reine Typ-Importe, zur Laufzeit also gelöscht.
 */

/** Anzeigename von Buchungen ohne Kategorie — identisch zu `UNCATEGORIZED` in finance/flow-calc. */
const OHNE_KATEGORIE = 'Ohne Kategorie'

export interface GeldflussOptionen {
  /** Wie viele Einnahmequellen einzeln gezeigt werden, der Rest wandert in „Weitere". Default 4. */
  maxQuellen?: number
  /** Wie viele Ausgabenkategorien einzeln gezeigt werden. Default 7. */
  maxAusgaben?: number
}

interface Posten {
  key: string
  name: string
  betrag: number
  kategorieId?: string
  anlage: boolean
}

const runde2 = (n: number) => Math.round(n * 100) / 100

/** Buchungen einer Seite (Einnahme ODER Ausgabe) zu Posten je Hauptkategorie zusammenfassen. */
function sammle(txns: FlowTransaction[], art: 'income' | 'expense'): Posten[] {
  const map = new Map<string, Posten>()
  for (const t of txns) {
    if (t.type !== art) continue
    const anlage = t.flow_kind === 'anlage'
    const name = anlage
      ? (art === 'expense' ? 'Anlagen' : 'Anlage-Rückflüsse')
      : (t.root_category_name ?? t.category_name ?? OHNE_KATEGORIE)
    // Schlüssel über die ID, nicht über den Namen: zwei Hauptkategorien dürfen gleich heißen,
    // und der Drill-down (`kat`) braucht die ID ohnehin.
    const key = anlage ? 'anlage' : (t.root_category_id ?? `n:${name}`)
    const kategorieId = anlage
      ? undefined
      : (t.root_category_id ?? (name === OHNE_KATEGORIE ? 'offen' : undefined))
    const cur = map.get(key)
    if (cur) cur.betrag += t.amount
    else map.set(key, { key, name, betrag: t.amount, kategorieId, anlage })
  }
  return [...map.values()].filter(p => p.betrag > 0).sort((a, b) => b.betrag - a.betrag)
}

/**
 * Die größten `max` Posten einzeln, der Rest als ein Sammelknoten „Weitere". Bleibt nur EIN
 * Posten übrig, steht er einzeln da: ein „Weitere (1)" wäre nur ein Umweg. Der Anlagen-Posten
 * wird nie eingesammelt, damit er als eigener Fluss erkennbar bleibt.
 */
function kuerze(posten: Posten[], max: number): { gezeigt: Posten[]; weitere: Posten[] } {
  const anlagen = posten.filter(p => p.anlage)
  const normal = posten.filter(p => !p.anlage)
  let gezeigt = normal.slice(0, max)
  let weitere = normal.slice(max)
  if (weitere.length === 1) { gezeigt = normal; weitere = [] }
  gezeigt = [...gezeigt, ...anlagen].sort((a, b) => b.betrag - a.betrag)
  return { gezeigt, weitere }
}

function knoten(p: Posten, art: SankeyArt, rang: number): SankeyNodeDatum {
  return { name: p.name, art: p.anlage ? 'anlage' : art, kategorieId: p.kategorieId, rang, betrag: runde2(p.betrag) }
}

function sammelKnoten(weitere: Posten[], rang: number): SankeyNodeDatum {
  return {
    name: `Weitere (${weitere.length})`,
    art: 'weitere',
    rang,
    betrag: runde2(weitere.reduce((s, p) => s + p.betrag, 0)),
    enthalten: weitere.map(p => ({ name: p.name, betrag: runde2(p.betrag) })),
  }
}

/**
 * Baut den Geldfluss: Einnahmequellen → „Einnahmen" → Ausgabenkategorien (+ Überschuss).
 *
 * Gibt es MEHR Ausgaben als Einnahmen, entsteht links ein Knoten „Fehlbetrag", der den
 * Mittelknoten auffüllt. Vorher wurden die Ausgaben-Bänder heruntergerechnet, damit das
 * Layout aufging — die Breiten logen dann. Mit dem Fehlbetrag ist die Bilanz echt
 * ausgeglichen, `value` und `realValue` sind überall gleich.
 *
 * Nichts wird mehr abgeschnitten: Posten über der Grenze wandern in „Weitere", also stimmen die
 * Summen immer mit den Kennzahlen der Seite überein.
 */
export function baueGeldfluss(txns: FlowTransaction[], opt: GeldflussOptionen = {}): SankeyData {
  const quellenAlle = sammle(txns, 'income')
  const ausgabenAlle = sammle(txns, 'expense')
  const summeEin = quellenAlle.reduce((s, p) => s + p.betrag, 0)
  const summeAus = ausgabenAlle.reduce((s, p) => s + p.betrag, 0)
  if (summeEin === 0 && summeAus === 0) return { nodes: [], links: [] }

  const q = kuerze(quellenAlle, opt.maxQuellen ?? 4)
  const a = kuerze(ausgabenAlle, opt.maxAusgaben ?? 7)

  const nodes: SankeyNodeDatum[] = []
  const links: SankeyLinkDatum[] = []

  const quellen = q.gezeigt.map((p, i) => knoten(p, 'quelle', i))
  if (q.weitere.length > 0) quellen.push(sammelKnoten(q.weitere, quellen.length))
  nodes.push(...quellen)

  // Beträge unter 1 € sind Rundungsstaub, kein Defizit/Überschuss.
  const diff = runde2(summeEin - summeAus)
  const fehlbetrag = diff < -1 ? -diff : 0
  const ueberschuss = diff > 1 ? diff : 0
  if (fehlbetrag > 0) nodes.push({ name: 'Fehlbetrag', art: 'defizit', rang: quellen.length, betrag: fehlbetrag })

  const mitte = nodes.length
  nodes.push({ name: 'Einnahmen', art: 'einnahmen', betrag: runde2(Math.max(summeEin, summeAus)) })

  const ausgaben = a.gezeigt.map((p, i) => knoten(p, 'ausgabe', i))
  if (a.weitere.length > 0) ausgaben.push(sammelKnoten(a.weitere, ausgaben.length))
  const ausgabenStart = nodes.length
  nodes.push(...ausgaben)
  const ueberschussIdx = nodes.length
  if (ueberschuss > 0) nodes.push({ name: 'Überschuss', art: 'ueberschuss', betrag: ueberschuss })

  quellen.forEach((n, i) => links.push({ source: i, target: mitte, value: n.betrag ?? 0, realValue: n.betrag ?? 0 }))
  if (fehlbetrag > 0) links.push({ source: quellen.length, target: mitte, value: fehlbetrag, realValue: fehlbetrag })
  ausgaben.forEach((n, i) => links.push({ source: mitte, target: ausgabenStart + i, value: n.betrag ?? 0, realValue: n.betrag ?? 0 }))
  if (ueberschuss > 0) links.push({ source: mitte, target: ueberschussIdx, value: ueberschuss, realValue: ueberschuss })

  return { nodes, links: links.filter(l => l.value > 0) }
}

/** Betrag eines Bandes: der echte Wert, sonst die Layout-Breite (Demodaten). */
const linkBetrag = (l: SankeyLinkDatum) => l.realValue ?? l.value

/**
 * Ergänzt Rolle, Rang und Betrag, wo sie fehlen (Demodaten der Landingpage kennen nur Namen):
 * vor „Einnahmen" = Quelle, danach = Ausgabe, „Überschuss" = Überschuss. Schon vollständige
 * Daten kommen unverändert zurück.
 */
export function normalisiereSankey(data: SankeyData): SankeyData {
  if (data.nodes.every(n => n.art !== undefined && n.betrag !== undefined)) return data
  const mitte = data.nodes.findIndex(n => n.art === 'einnahmen' || n.name === 'Einnahmen')
  const rang = { links: 0, rechts: 0 }
  const nodes = data.nodes.map((n, i): SankeyNodeDatum => {
    let art: SankeyArt
    if (n.art) art = n.art
    else if (i === mitte) art = 'einnahmen'
    else if (n.name === 'Überschuss') art = 'ueberschuss'
    else art = mitte === -1 || i < mitte ? 'quelle' : 'ausgabe'
    const betrag = n.betrag ?? (() => {
      const ein = data.links.filter(l => l.target === i).reduce((s, l) => s + linkBetrag(l), 0)
      const aus = data.links.filter(l => l.source === i).reduce((s, l) => s + linkBetrag(l), 0)
      return Math.max(ein, aus)
    })()
    const seite = i < mitte ? 'links' : 'rechts'
    const r = n.rang ?? (art === 'einnahmen' ? undefined : rang[seite]++)
    return { ...n, art, betrag, rang: r }
  })
  return { nodes, links: data.links }
}

export interface FlussZeile {
  /** Index des Knotens in `SankeyData.nodes`. */
  index: number
  name: string
  art: SankeyArt
  betrag: number
  /** Anteil an `bezug` der Liste (0..1). */
  anteil: number
  /** Balkenbreite (0..1) auf gemeinsamer Skala von Einnahmen- und Ausgabenseite. */
  breite: number
  rang: number
  kategorieId?: string
  enthalten?: { name: string; betrag: number }[]
}

export interface FlussListe {
  einnahmen: FlussZeile[]
  ausgaben: FlussZeile[]
  summeEinnahmen: number
  summeAusgaben: number
  /** Einnahmen minus Ausgaben: positiv = Überschuss, negativ = Defizit. */
  saldo: number
  /**
   * Worauf sich die Anteile der Ausgaben beziehen. Normal die Einnahmen („28 % der Einnahmen");
   * gab es gar keine, die Ausgaben selbst — sonst käme eine Division durch 0.
   */
  bezug: 'einnahmen' | 'ausgaben'
}

/** Liest den Geldfluss als Zeilen für die Fluss-Liste (Handy). */
export function zuFlussListe(roh: SankeyData): FlussListe {
  const data = normalisiereSankey(roh)
  const mitte = data.nodes.findIndex(n => n.art === 'einnahmen')
  const leer: FlussListe = { einnahmen: [], ausgaben: [], summeEinnahmen: 0, summeAusgaben: 0, saldo: 0, bezug: 'einnahmen' }
  if (mitte === -1) return leer

  const zeilen = (links: SankeyLinkDatum[], knotenIdx: (l: SankeyLinkDatum) => number) =>
    links
      .map(l => ({ idx: knotenIdx(l), betrag: linkBetrag(l) }))
      .filter(x => x.betrag > 0)
      .map(x => ({ idx: x.idx, n: data.nodes[x.idx], betrag: x.betrag }))

  const ein = zeilen(data.links.filter(l => l.target === mitte), l => l.source).filter(x => x.n.art !== 'defizit')
  const aus = zeilen(data.links.filter(l => l.source === mitte), l => l.target).filter(x => x.n.art !== 'ueberschuss')

  const summeEinnahmen = ein.reduce((s, x) => s + x.betrag, 0)
  const summeAusgaben = aus.reduce((s, x) => s + x.betrag, 0)
  const skala = Math.max(summeEinnahmen, summeAusgaben)
  const bezug = summeEinnahmen > 0 ? 'einnahmen' : 'ausgaben'
  const nenner = bezug === 'einnahmen' ? summeEinnahmen : summeAusgaben

  const zuZeile = (x: { idx: number; n: SankeyNodeDatum; betrag: number }, anteilNenner: number, i: number): FlussZeile => ({
    index: x.idx,
    name: x.n.name,
    art: x.n.art ?? 'ausgabe',
    betrag: x.betrag,
    anteil: anteilNenner > 0 ? x.betrag / anteilNenner : 0,
    breite: skala > 0 ? x.betrag / skala : 0,
    rang: x.n.rang ?? i,
    kategorieId: x.n.kategorieId,
    enthalten: x.n.enthalten,
  })

  return {
    einnahmen: ein.map((x, i) => zuZeile(x, summeEinnahmen, i)),
    ausgaben: aus.map((x, i) => zuZeile(x, nenner, i)),
    summeEinnahmen,
    summeAusgaben,
    saldo: summeEinnahmen - summeAusgaben,
    bezug,
  }
}

/** Kompakte Zahl für enge Zellen: 950 → "950", 1234 → "1,2k", 12500 → "12,5k", 1_200_000 → "1,2M". */
export function kurzBetrag(n: number): string {
  const a = Math.abs(n)
  // Eine Nachkommastelle, aber ohne ",0" bei glatten Werten ("2k" statt "2,0k").
  const f = (x: number) => (Math.round(x * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 })
  if (a >= 999_950) return `${f(a / 1_000_000)}M`
  if (a >= 1000) return `${f(a / 1000)}k`
  return Math.round(a).toLocaleString('de-DE')
}
