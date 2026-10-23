import type { FlowTransaction } from '../data/flows.ts'
import { parteiSchluessel } from '../bank/auswertung.ts'
import { parteiSchluesselVon, parteiVon } from './gegenparteien.ts'

/**
 * Reine Logik der Analyse-Buchungsliste (Filtern, Sortieren, Tagesgruppen, Summen). Ohne React,
 * damit sie sich testen laesst (buchungen.test.ts) und der CSV-Export auf dem Server EXAKT
 * dieselben Treffer liefert wie die Liste im Browser — sonst stuende im Export etwas anderes
 * als auf dem Bildschirm.
 *
 * Gegenueber der Bankliste (lib/bank/buchungen) rechnen wir auf `FlowTransaction`: der Betrag
 * ist immer positiv, die Richtung steht in `type`. Fuer Summen und Tagessalden wird daraus ein
 * vorzeichenbehafteter Wert (`vorzeichen`). Umbuchungen gibt es hier nicht — die fehlen schon
 * in der Datenquelle.
 */

export type AnalyseBuchung = FlowTransaction

export type TypFilter = 'alle' | 'einnahmen' | 'ausgaben'
export type ArtFilter = 'alle' | 'echt' | 'anlage' | 'forderung'
export type SortFeld = 'datum' | 'betrag' | 'partei'
export type SortRichtung = 'auf' | 'ab'

export interface AnalyseBuchungsFilter {
  /** Freitext: Gegenpartei, Zweck, Kategorie, Betrag. */
  q: string
  /** `''` = alle, `'offen'` = ohne Kategorie, sonst Kategorie-ID (Haupt- oder Unterkategorie). */
  kat: string
  /** Alle Kategorie-IDs zu `kat` (sie selbst plus Unterkategorien); fehlt sie, gilt exakt `kat`. */
  katMenge?: ReadonlySet<string>
  /** `YYYY-MM`, leer = alle. */
  monat: string
  /** `YYYY-MM-DD`, leer = alle. */
  tag: string
  /** Gegenpartei aus der URL; verglichen ueber den normalisierten Schluessel. */
  partei: string
  typ: TypFilter
  art: ArtFilter
  /** Betragsgrenzen, inklusive (Betrag ist ohnehin positiv). */
  min: number | null
  max: number | null
  /** Konto-ID, leer = alle. */
  konto: string
}

export const LEERER_FILTER: AnalyseBuchungsFilter = {
  q: '', kat: '', monat: '', tag: '', partei: '', typ: 'alle', art: 'alle', min: null, max: null, konto: '',
}

/** Anzeigenamen der Buchungsart (`flow_kind`). `echt` = ganz normale Einnahme/Ausgabe. */
export const ART_LABEL: Record<string, string> = { echt: 'Regulär', anlage: 'Anlage', forderung: 'Forderung' }
export const QUELLE_LABEL: Record<string, string> = { bank_sync: 'Bank-Sync', manual: 'Manuell' }
export const STEUERROLLE_LABEL: Record<string, string> = {
  betriebseinnahme: 'Betriebseinnahme', betriebsausgabe: 'Betriebsausgabe', lohn: 'Lohn', privat: 'Privat',
}

/** Betrag mit Vorzeichen: Einnahme +, Ausgabe −. */
export function vorzeichen(tx: Pick<AnalyseBuchung, 'type' | 'amount'>): number {
  return tx.type === 'income' ? tx.amount : -tx.amount
}

/** Treffer der Freitextsuche: Text in Gegenpartei/Zweck/Kategorie oder Betrag (`12,50` / `12.50`). */
export function trifftSuche(tx: AnalyseBuchung, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const text = [tx.merchant, tx.description, tx.category_name, tx.root_category_name]
    .filter((v): v is string => !!v)
    .join(' ')
    .toLowerCase()
  if (text.includes(s)) return true
  const betrag = tx.amount.toFixed(2)
  return betrag.includes(s) || betrag.replace('.', ',').includes(s)
}

export function filterBuchungen(
  list: readonly AnalyseBuchung[],
  f: AnalyseBuchungsFilter,
): AnalyseBuchung[] {
  const parteiKey = f.partei ? parteiSchluessel(f.partei) : ''
  return list.filter(tx => {
    if (f.monat && !tx.date.startsWith(f.monat)) return false
    if (f.tag && tx.date !== f.tag) return false
    if (parteiKey && parteiSchluesselVon(tx) !== parteiKey) return false

    if (f.kat === 'offen') {
      if (tx.category_id !== null) return false
    } else if (f.kat) {
      // Unterkategorien zaehlen zur Hauptkategorie, wie im Kategorien-Abschnitt. `root_category_id`
      // faengt Buchungen ab, deren Kategorie nicht in der Kategorienliste steht.
      const passt = f.katMenge
        ? (tx.category_id !== null && f.katMenge.has(tx.category_id)) || tx.root_category_id === f.kat
        : tx.category_id === f.kat || tx.root_category_id === f.kat
      if (!passt) return false
    }

    if (f.typ === 'einnahmen' && tx.type !== 'income') return false
    if (f.typ === 'ausgaben' && tx.type !== 'expense') return false
    if (f.art !== 'alle' && tx.flow_kind !== f.art) return false
    if (f.konto && tx.account_id !== f.konto) return false
    if (f.min !== null && tx.amount < f.min) return false
    if (f.max !== null && tx.amount > f.max) return false
    return trifftSuche(tx, f.q)
  })
}

export interface Sortierung {
  feld: SortFeld
  richtung: SortRichtung
}

/** Neueste zuerst bei `ab`; die ID macht die Reihenfolge innerhalb eines Tages stabil. */
const nachDatum = (a: AnalyseBuchung, b: AnalyseBuchung) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

export function sortiereBuchungen(list: readonly AnalyseBuchung[], s: Sortierung): AnalyseBuchung[] {
  const dir = s.richtung === 'auf' ? 1 : -1
  // Partei-Namen einmal berechnen statt bei jedem Vergleich.
  const namen = s.feld === 'partei' ? new Map(list.map(t => [t.id, parteiVon(t)])) : null

  return [...list].sort((a, b) => {
    if (s.feld === 'betrag') {
      // Nach Betrag mit Vorzeichen: ganz oben die groesste Einnahme, ganz unten die groesste Ausgabe.
      return (vorzeichen(a) - vorzeichen(b)) * dir || nachDatum(b, a)
    }
    if (s.feld === 'partei' && namen) {
      return (namen.get(a.id) ?? '').localeCompare(namen.get(b.id) ?? '', 'de') * dir || nachDatum(b, a)
    }
    return nachDatum(a, b) * dir
  })
}

export interface Tagesgruppe {
  /** YYYY-MM-DD; `null` = keine Gruppierung (Sortierung nicht nach Datum). */
  datum: string | null
  /** Saldo des Tages (Einnahmen minus Ausgaben). */
  summe: number
  buchungen: AnalyseBuchung[]
}

export interface Summen {
  einnahmen: number
  ausgaben: number
  saldo: number
  anzahl: number
}

export function summiere(list: readonly AnalyseBuchung[]): Summen {
  let einnahmen = 0
  let ausgaben = 0
  for (const t of list) {
    if (t.type === 'income') einnahmen += t.amount
    else ausgaben += t.amount
  }
  return { einnahmen, ausgaben, saldo: einnahmen - ausgaben, anzahl: list.length }
}

/**
 * Gruppiert nach Tag mit Tagessaldo. Nur sinnvoll bei Sortierung nach Datum — sonst entstuenden
 * bei jedem Tageswechsel neue Kopfzeilen; dann kommt eine einzige Gruppe ohne Datum zurueck.
 * Erwartet bereits sortierte Eingabe.
 */
export function gruppiereNachTag(sortiert: readonly AnalyseBuchung[], feld: SortFeld): Tagesgruppe[] {
  if (feld !== 'datum') {
    return [{ datum: null, summe: summiere(sortiert).saldo, buchungen: [...sortiert] }]
  }
  const gruppen: Tagesgruppe[] = []
  for (const tx of sortiert) {
    let g = gruppen[gruppen.length - 1]
    if (!g || g.datum !== tx.date) {
      g = { datum: tx.date, summe: 0, buchungen: [] }
      gruppen.push(g)
    }
    g.buchungen.push(tx)
    g.summe += vorzeichen(tx)
  }
  return gruppen
}

/**
 * Schneidet Gruppen auf die ersten `n` Buchungen zu (Mehr-laden). Die Gruppensumme bleibt die
 * des GANZEN Tages, auch wenn der Tag am Listenende angeschnitten ist — sonst spraenge die
 * Summe beim Nachladen.
 */
export function schneideGruppen(gruppen: readonly Tagesgruppe[], n: number): Tagesgruppe[] {
  const aus: Tagesgruppe[] = []
  let rest = n
  for (const g of gruppen) {
    if (rest <= 0) break
    aus.push(g.buchungen.length <= rest ? g : { ...g, buchungen: g.buchungen.slice(0, rest) })
    rest -= g.buchungen.length
  }
  return aus
}
