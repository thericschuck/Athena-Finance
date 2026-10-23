import type { BankTransaction } from '@/types/bank'
import { normIban } from './scope.ts'
import { parteiName, parteiSchluessel } from './auswertung.ts'

/**
 * Reine Logik der Buchungsliste (Filtern, Sortieren, Gruppieren, Tagessummen). Bewusst ohne
 * React und ohne Browser-APIs, damit sie sich testen laesst (buchungen.test.ts) und der
 * CSV-Export auf dem Server EXAKT dieselben Treffer liefert wie die Liste im Browser —
 * sonst stuende im Export etwas anderes als auf dem Bildschirm.
 */

export type BuchungsTyp = 'alle' | 'eingang' | 'ausgang' | 'umbuchung'
export type SortFeld = 'datum' | 'betrag' | 'partei'
export type SortRichtung = 'auf' | 'ab'

export interface BuchungsFilter {
  /** Freitext: Verwendungszweck, Gegenpartei, Betrag. */
  q: string
  /** `''` = alle, `'offen'` = ohne Kategorie, sonst Kategorie-ID. */
  kategorie: string
  /** Betragsgrenzen auf den BETRAG OHNE VORZEICHEN (min 50 findet +50 und −50). */
  min: number | null
  max: number | null
  /** Datumsgrenzen YYYY-MM-DD, beide inklusive, bezogen auf die Wertstellung. */
  von: string
  bis: string
  typ: BuchungsTyp
  /**
   * Gegenpartei aus der URL. Verglichen wird ueber denselben Anzeigenamen und Schluessel wie
   * im Gegenpartei-Abschnitt (`parteiName`/`parteiSchluessel`): dort faellt eine Buchung ohne
   * `counterpart_name` auf den Verwendungszweck zurueck und gleicht Gross-/Kleinschreibung an.
   * Ein Vergleich nur ueber `counterpart_name` fand genau diese Faelle nicht.
   */
  partei: string
  /**
   * Alle Kategorie-IDs, die zu `kategorie` gehoeren (die Kategorie selbst plus ihre
   * Unterkategorien, siehe `kategorieMitKindern`). Fehlt sie, gilt exakt `kategorie`. Ohne sie
   * zeigte ein Klick auf eine HAUPTkategorie nur die direkt zugeordneten Buchungen und nicht
   * die ihrer Unterkategorien — weniger, als der Anteil im Kategorien-Abschnitt versprach.
   */
  kategorieMenge?: ReadonlySet<string>
}

/** Die Kategorie und alle ihre Unterkategorien (beliebige Tiefe) als ID-Menge. */
export function kategorieMitKindern(
  id: string,
  kategorien: readonly { id: string; parent_id: string | null }[],
): Set<string> {
  const menge = new Set<string>([id])
  let gewachsen = true
  while (gewachsen) {
    gewachsen = false
    for (const k of kategorien) {
      if (k.parent_id && menge.has(k.parent_id) && !menge.has(k.id)) {
        menge.add(k.id)
        gewachsen = true
      }
    }
  }
  return menge
}

export const LEERER_FILTER: BuchungsFilter = {
  q: '', kategorie: '', min: null, max: null, von: '', bis: '', typ: 'alle', partei: '',
}

export interface Sortierung {
  feld: SortFeld
  richtung: SortRichtung
}

export interface Tagesgruppe {
  /** YYYY-MM-DD; `null` = keine Gruppierung (Sortierung nicht nach Datum). */
  datum: string | null
  /** Summe des Tages OHNE Umbuchungen (die sind weder Einnahme noch Ausgabe). */
  summe: number
  buchungen: BankTransaction[]
}

/** Menge der eigenen IBANs, normalisiert — Eingabe fuer `istUmbuchung`. */
export function ibanMenge(eigeneIbans: readonly string[]): Set<string> {
  return new Set(eigeneIbans.map(normIban))
}

/**
 * Umbuchung zwischen eigenen Konten: die Gegen-IBAN ist eine eigene. Dieselbe Regel wie in
 * `unified_transactions`, die solche Zeilen aus den Auswertungen herausrechnet.
 */
export function istUmbuchung(tx: BankTransaction, eigene: ReadonlySet<string>): boolean {
  return !!tx.counterpart_iban && eigene.has(normIban(tx.counterpart_iban))
}

function tag(tx: BankTransaction): string {
  return tx.value_date.slice(0, 10)
}

/** Treffer der Freitextsuche: Text in Zweck/Gegenpartei/IBAN oder Betrag (`12,50` / `12.50`). */
export function trifftSuche(tx: BankTransaction, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const text = [tx.description, tx.raw_description, tx.counterpart_name, tx.counterpart_iban]
    .filter((v): v is string => !!v)
    .join(' ')
    .toLowerCase()
  if (text.includes(s)) return true
  const betrag = Math.abs(tx.amount).toFixed(2)
  return betrag.includes(s) || betrag.replace('.', ',').includes(s)
}

export function filterBuchungen(
  list: readonly BankTransaction[],
  f: BuchungsFilter,
  eigene: ReadonlySet<string>,
): BankTransaction[] {
  return list.filter(tx => {
    if (f.partei && parteiSchluessel(parteiName(tx)) !== parteiSchluessel(f.partei)) return false
    if (f.kategorie === 'offen') {
      if (tx.category_id !== null) return false
    } else if (f.kategorie) {
      const passt = f.kategorieMenge
        ? tx.category_id !== null && f.kategorieMenge.has(tx.category_id)
        : tx.category_id === f.kategorie
      if (!passt) return false
    }

    const abs = Math.abs(tx.amount)
    if (f.min !== null && abs < f.min) return false
    if (f.max !== null && abs > f.max) return false

    const d = tag(tx)
    if (f.von && d < f.von) return false
    if (f.bis && d > f.bis) return false

    if (f.typ !== 'alle') {
      const umb = istUmbuchung(tx, eigene)
      if (f.typ === 'umbuchung') { if (!umb) return false }
      else if (umb) return false
      else if (f.typ === 'eingang' && tx.amount < 0) return false
      else if (f.typ === 'ausgang' && tx.amount >= 0) return false
    }
    return trifftSuche(tx, f.q)
  })
}

export function sortiereBuchungen(
  list: readonly BankTransaction[],
  s: Sortierung,
): BankTransaction[] {
  const dir = s.richtung === 'auf' ? 1 : -1
  const nachDatum = (a: BankTransaction, b: BankTransaction) =>
    tag(a).localeCompare(tag(b)) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

  return [...list].sort((a, b) => {
    if (s.feld === 'betrag') return (a.amount - b.amount) * dir || nachDatum(b, a)
    if (s.feld === 'partei') {
      // Ohne Gegenpartei immer ans Ende, egal in welche Richtung.
      if (!a.counterpart_name && !b.counterpart_name) return nachDatum(b, a)
      if (!a.counterpart_name) return 1
      if (!b.counterpart_name) return -1
      return a.counterpart_name.localeCompare(b.counterpart_name, 'de') * dir || nachDatum(b, a)
    }
    return nachDatum(a, b) * dir
  })
}

/**
 * Gruppiert nach Tag mit Tagessumme. Nur sinnvoll, wenn nach Datum sortiert ist — bei
 * anderer Sortierung entstuenden bei jedem Tageswechsel neue Kopfzeilen; dann kommt eine
 * einzige Gruppe ohne Datum zurueck. Erwartet bereits sortierte Eingabe.
 */
export function gruppiereNachTag(
  sortiert: readonly BankTransaction[],
  feld: SortFeld,
  eigene: ReadonlySet<string>,
): Tagesgruppe[] {
  if (feld !== 'datum') {
    return [{ datum: null, summe: summeOhneUmbuchung(sortiert, eigene), buchungen: [...sortiert] }]
  }
  const gruppen: Tagesgruppe[] = []
  for (const tx of sortiert) {
    const d = tag(tx)
    let g = gruppen[gruppen.length - 1]
    if (!g || g.datum !== d) {
      g = { datum: d, summe: 0, buchungen: [] }
      gruppen.push(g)
    }
    g.buchungen.push(tx)
    if (!istUmbuchung(tx, eigene)) g.summe += tx.amount
  }
  return gruppen
}

export function summeOhneUmbuchung(list: readonly BankTransaction[], eigene: ReadonlySet<string>): number {
  let s = 0
  for (const tx of list) if (!istUmbuchung(tx, eigene)) s += tx.amount
  return s
}

/**
 * Schneidet Gruppen auf die ersten `n` Buchungen zu (Mehr-laden). Die Gruppensumme bleibt die
 * des GANZEN Tages, auch wenn der Tag am Seitenende angeschnitten ist — sonst wuerde die
 * Summe beim Nachladen springen.
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

/** Betragsfeld (`12,5` / `1.234,50` / `12.5`) → Zahl; leer oder ungueltig → null. */
export function parseBetrag(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  const komma = s.lastIndexOf(',')
  const punkt = s.lastIndexOf('.')
  const n = komma > punkt
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}
