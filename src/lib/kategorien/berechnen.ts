/**
 * Reine Berechnungen der Kategorien-Seite (/finance/categories): Nutzung je Kategorie, Rollup auf
 * die Hauptkategorien, Baum, Filter/Suche, Gruppierung nach steuerlicher Rolle, Kennzahlen,
 * Reihenfolge. Keine Imports aus '@/', damit `node --test` die Datei direkt laedt.
 *
 * Fluss-Regel (wie ueberall in der App): nur Buchungen mit `flow_kind = 'echt'` zaehlen in die
 * Summen. Umbuchungen, Anfangsbestaende, Anlagen und Forderungen werden gezaehlt (Anzahl), aber
 * nicht summiert.
 */

export type KategorieTyp = 'expense' | 'income' | 'neutral'

/** Was die Seite von einer Kategorie braucht (passt zu CategoryRow). */
export interface KategorieBasis {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
  parent_id: string | null
  sort_order: number
  budget_monthly: number | null
  tax_role: string | null
  euer_zeile: number | null
  business_share: number | null
}

/** Eine Buchung, soweit die Seite sie braucht (Auszug aus unified_transactions). */
export interface BuchungKurz {
  category_id: string | null
  type: string
  flow_kind: string | null
  amount_eur: number | null
  date: string
}

export interface Nutzung {
  /** Alle Buchungen der Kategorie, egal wann und welcher Art. */
  anzahl: number
  /** Buchungen im gewaehlten Zeitraum. */
  anzahlZeitraum: number
  /** Summe der echten Ausgaben im Zeitraum (positiv). */
  ausgaben: number
  /** Summe der echten Einnahmen im Zeitraum (positiv). */
  einnahmen: number
}

export const LEERE_NUTZUNG: Nutzung = { anzahl: 0, anzahlZeitraum: 0, ausgaben: 0, einnahmen: 0 }

export interface KategorieKnoten extends KategorieBasis {
  /** Hauptkategorie: eigene + Unterkategorien; Unterkategorie: nur eigene. */
  nutzung: Nutzung
  /** Nur die Buchungen genau dieser Kategorie. */
  eigene: Nutzung
  /** Effektive steuerliche Rolle (inkl. Vererbung), von aussen berechnet. */
  rolle: string | null
  /** „Elternname › Name“ bzw. nur der Name. */
  pfad: string
  children: KategorieKnoten[]
}

/** Summiert die Buchungen je Kategorie (nur die eigenen, ohne Rollup). `cutoff` = erster Tag des Zeitraums oder null. */
export function nutzungJeKategorie(buchungen: BuchungKurz[], cutoff: string | null): Map<string, Nutzung> {
  const karte = new Map<string, Nutzung>()
  for (const b of buchungen) {
    if (!b.category_id) continue
    let n = karte.get(b.category_id)
    if (!n) {
      n = { anzahl: 0, anzahlZeitraum: 0, ausgaben: 0, einnahmen: 0 }
      karte.set(b.category_id, n)
    }
    n.anzahl += 1
    if (cutoff !== null && b.date < cutoff) continue
    n.anzahlZeitraum += 1
    if (b.flow_kind !== 'echt') continue
    const betrag = Math.abs(Number(b.amount_eur ?? 0))
    if (!Number.isFinite(betrag)) continue
    if (b.type === 'expense') n.ausgaben += betrag
    else if (b.type === 'income') n.einnahmen += betrag
  }
  return karte
}

function addiere(a: Nutzung, b: Nutzung): Nutzung {
  return {
    anzahl: a.anzahl + b.anzahl,
    anzahlZeitraum: a.anzahlZeitraum + b.anzahlZeitraum,
    ausgaben: a.ausgaben + b.ausgaben,
    einnahmen: a.einnahmen + b.einnahmen,
  }
}

/**
 * Baut den Baum (Hauptkategorien mit Unterkategorien, je Ebene nach sort_order, dann Name) und
 * rechnet die Nutzung der Hauptkategorien inklusive Unterkategorien. Eine Kategorie, deren Eltern
 * fehlen, wird als Hauptkategorie behandelt. Tiefer als zwei Ebenen wird zu den Enkeln der
 * naechsten Hauptkategorie zusammengezogen (die App legt nur zwei Ebenen an).
 */
export function baueKategorieBaum(
  kategorien: KategorieBasis[],
  eigene: Map<string, Nutzung>,
  rollen: Map<string, string | null>,
): KategorieKnoten[] {
  const nachId = new Map(kategorien.map((k) => [k.id, k]))
  const knoten = new Map<string, KategorieKnoten>()
  for (const k of kategorien) {
    const e = eigene.get(k.id) ?? LEERE_NUTZUNG
    knoten.set(k.id, {
      ...k,
      eigene: e,
      nutzung: e,
      rolle: rollen.get(k.id) ?? null,
      pfad: k.name,
      children: [],
    })
  }

  // Hauptkategorie je Kategorie, mit Schutz gegen Zyklen.
  const wurzelVon = (id: string): string => {
    const gesehen = new Set<string>()
    let aktuell = id
    while (!gesehen.has(aktuell)) {
      gesehen.add(aktuell)
      const eltern = nachId.get(aktuell)?.parent_id
      if (!eltern || !nachId.has(eltern)) return aktuell
      aktuell = eltern
    }
    return id
  }

  const wurzeln: KategorieKnoten[] = []
  for (const k of kategorien) {
    const n = knoten.get(k.id)!
    const w = wurzelVon(k.id)
    if (w === k.id) {
      wurzeln.push(n)
    } else {
      const wurzel = knoten.get(w)!
      n.pfad = `${wurzel.name} › ${k.name}`
      wurzel.children.push(n)
    }
  }

  const sortiere = (liste: KategorieKnoten[]) =>
    liste.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de'))
  for (const w of wurzeln) {
    sortiere(w.children)
    w.nutzung = w.children.reduce((summe, c) => addiere(summe, c.eigene), w.eigene)
  }
  return sortiere(wurzeln)
}

/** Alle Knoten flach: Hauptkategorie, dann ihre Unterkategorien. */
export function flacheListe(baum: KategorieKnoten[]): KategorieKnoten[] {
  return baum.flatMap((w) => [w, ...w.children])
}

// ─── Filter und Suche ─────────────────────────────────────────────────────────────

export type TypFilter = 'alle' | 'expense' | 'income' | 'neutral'

export interface AnsichtsFilter {
  typ: TypFilter
  suche: string
  /** Nur Kategorien ohne jede Buchung. */
  nurUngenutzte: boolean
}

/** Kleinbuchstaben, ohne Akzente, ae/oe/ue-Schreibweise wie ä/ö/ü gleichgesetzt. */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

function trifftSuche(k: KategorieKnoten, begriffe: string[]): boolean {
  if (begriffe.length === 0) return true
  const heu = normalisiere(k.pfad)
  return begriffe.every((b) => heu.includes(b))
}

function trifftTyp(k: KategorieKnoten, typ: TypFilter): boolean {
  return typ === 'alle' || k.type === typ
}

function trifftUngenutzt(k: KategorieKnoten, nur: boolean): boolean {
  return !nur || k.nutzung.anzahl === 0
}

/**
 * Filtert den Baum. Eine Unterkategorie bleibt, wenn sie Typ und Ungenutzt-Filter erfuellt und
 * die Suche sie oder ihre Hauptkategorie trifft (Suche nach „Auto“ zeigt also alle Unterkategorien
 * von „Auto“). Eine Hauptkategorie bleibt, wenn sie selbst passt oder eine Unterkategorie bleibt.
 * Die Kinder der Kopien sind die sichtbaren.
 */
export function filtereBaum(baum: KategorieKnoten[], f: AnsichtsFilter): KategorieKnoten[] {
  const begriffe = normalisiere(f.suche).split(/\s+/).filter(Boolean)
  const ergebnis: KategorieKnoten[] = []
  for (const w of baum) {
    const wurzelSuche = trifftSuche(w, begriffe)
    const kinder = w.children.filter(
      (c) => trifftTyp(c, f.typ) && trifftUngenutzt(c, f.nurUngenutzte) && (wurzelSuche || trifftSuche(c, begriffe)),
    )
    const selbst = trifftTyp(w, f.typ) && trifftUngenutzt(w, f.nurUngenutzte) && wurzelSuche
    if (selbst || kinder.length > 0) ergebnis.push({ ...w, children: kinder })
  }
  return ergebnis
}

// ─── Gruppierung nach steuerlicher Rolle ──────────────────────────────────────────

export const ROLLEN_GRUPPEN: { key: string; label: string }[] = [
  { key: 'betriebseinnahme', label: 'Betriebseinnahme' },
  { key: 'betriebsausgabe', label: 'Betriebsausgabe' },
  { key: 'lohn', label: 'Lohn / Gehalt' },
  { key: 'privat', label: 'Privat' },
  { key: '__none__', label: 'Nicht zugeordnet' },
]

export interface RollenGruppe {
  key: string
  label: string
  items: KategorieKnoten[]
  /** Summe aus den EIGENEN Buchungen der Mitglieder (kein Doppelzaehlen von Haupt- und Unterkategorie). */
  ausgaben: number
  einnahmen: number
  anzahl: number
}

/** Gruppiert die (bereits gefilterte) Kategorienliste nach der effektiven Rolle; leere Gruppen entfallen. */
export function gruppiereNachRolle(baum: KategorieKnoten[]): RollenGruppe[] {
  const karte = new Map<string, KategorieKnoten[]>(ROLLEN_GRUPPEN.map((g) => [g.key, []]))
  for (const k of flacheListe(baum)) {
    const schluessel = k.rolle && karte.has(k.rolle) ? k.rolle : '__none__'
    karte.get(schluessel)!.push(k)
  }
  return ROLLEN_GRUPPEN.map((g) => {
    const items = karte.get(g.key) ?? []
    return {
      ...g,
      items,
      ausgaben: items.reduce((s, k) => s + k.eigene.ausgaben, 0),
      einnahmen: items.reduce((s, k) => s + k.eigene.einnahmen, 0),
      anzahl: items.reduce((s, k) => s + k.eigene.anzahl, 0),
    }
  }).filter((g) => g.items.length > 0)
}

// ─── Kennzahlen ───────────────────────────────────────────────────────────────────

export interface KategorienKennzahlen {
  gesamt: number
  haupt: number
  unter: number
  /** Kategorien ohne jede Buchung (Hauptkategorie: auch keine in ihren Unterkategorien). */
  ungenutzt: number
  /** Ausgabekategorien mit Buchungen, die keine steuerliche Rolle haben (auch nicht geerbt). */
  ausgabenOhneRolle: number
  /** Wie viele Kategorien eine Rolle haben (die Meldung oben ist nur sinnvoll, wenn die Steuer genutzt wird). */
  mitRolle: number
  mitBudget: number
}

export function kategorienKennzahlen(baum: KategorieKnoten[]): KategorienKennzahlen {
  const alle = flacheListe(baum)
  const haupt = baum.length
  return {
    gesamt: alle.length,
    haupt,
    unter: alle.length - haupt,
    ungenutzt: alle.filter((k) => k.nutzung.anzahl === 0).length,
    ausgabenOhneRolle: alle.filter((k) => k.type === 'expense' && k.eigene.anzahl > 0 && !k.rolle).length,
    mitRolle: alle.filter((k) => k.rolle).length,
    mitBudget: alle.filter((k) => k.budget_monthly !== null && k.budget_monthly > 0).length,
  }
}

/**
 * Summe des Baums: Ausgaben nur aus Ausgabe-Hauptkategorien, Einnahmen nur aus Einnahme-Hauptkategorien
 * (ihr Rollup enthaelt die Unterkategorien). Neutrale Kategorien zaehlen nicht: die Fluss-Regel fuehrt
 * etwa „Transfers“ als echten Fluss, in einer Summe der Einnahmen und Ausgaben haetten sie nichts verloren.
 */
export function summeBaum(baum: KategorieKnoten[]): Nutzung {
  let ausgaben = 0
  let einnahmen = 0
  let anzahl = 0
  let anzahlZeitraum = 0
  for (const w of baum) {
    anzahl += w.nutzung.anzahl
    anzahlZeitraum += w.nutzung.anzahlZeitraum
    if (w.type === 'expense') ausgaben += w.nutzung.ausgaben
    else if (w.type === 'income') einnahmen += w.nutzung.einnahmen
  }
  return { anzahl, anzahlZeitraum, ausgaben, einnahmen }
}

// ─── Hierarchie-Regeln (Formular, Server) ─────────────────────────────────────────

/** IDs aller Nachkommen einer Kategorie (ohne sie selbst). Zyklensicher. */
export function nachkommenIds(kategorien: Pick<KategorieBasis, 'id' | 'parent_id'>[], id: string): Set<string> {
  const kinderVon = new Map<string, string[]>()
  for (const k of kategorien) {
    if (!k.parent_id) continue
    const liste = kinderVon.get(k.parent_id) ?? []
    liste.push(k.id)
    kinderVon.set(k.parent_id, liste)
  }
  const ergebnis = new Set<string>()
  const stapel = [...(kinderVon.get(id) ?? [])]
  while (stapel.length > 0) {
    const n = stapel.pop()!
    if (n === id || ergebnis.has(n)) continue
    ergebnis.add(n)
    stapel.push(...(kinderVon.get(n) ?? []))
  }
  return ergebnis
}

/**
 * Pruefung, ob `kategorie` unter `neueEltern` haengen darf. Die App kennt genau zwei Ebenen:
 * die Eltern muessen eine Hauptkategorie sein, nicht die Kategorie selbst oder ein Nachkomme, und
 * eine Kategorie mit Unterkategorien kann nicht selbst Unterkategorie werden (sonst waeren es drei
 * Ebenen). Gibt eine Fehlermeldung zurueck oder null.
 */
export function pruefeEltern(
  kategorien: Pick<KategorieBasis, 'id' | 'parent_id'>[],
  kategorieId: string | null,
  neueEltern: string | null,
): string | null {
  if (!neueEltern) return null
  const eltern = kategorien.find((k) => k.id === neueEltern)
  if (!eltern) return 'Übergeordnete Kategorie nicht gefunden'
  if (kategorieId) {
    if (kategorieId === neueEltern) return 'Eine Kategorie kann nicht ihre eigene Oberkategorie sein'
    if (nachkommenIds(kategorien, kategorieId).has(neueEltern)) return 'Die Oberkategorie darf keine Unterkategorie dieser Kategorie sein'
    if (kategorien.some((k) => k.parent_id === kategorieId)) return 'Diese Kategorie hat Unterkategorien und kann deshalb nicht selbst unterhalb einer anderen hängen'
  }
  if (eltern.parent_id) return 'Die Oberkategorie muss eine Hauptkategorie sein (es gibt nur zwei Ebenen)'
  return null
}

/** Moegliche Oberkategorien im Formular: Hauptkategorien ausser der Kategorie selbst; leer, wenn sie Unterkategorien hat. */
export function moeglicheEltern<T extends Pick<KategorieBasis, 'id' | 'parent_id'>>(kategorien: T[], kategorieId: string | null): T[] {
  if (kategorieId && kategorien.some((k) => k.parent_id === kategorieId)) return []
  return kategorien.filter((k) => !k.parent_id && k.id !== kategorieId)
}

// ─── Ziele fuer „Buchungen verschieben“ ───────────────────────────────────────────

export interface ZielGruppe {
  wurzel: KategorieBasis
  ziele: KategorieBasis[]
}

/**
 * Moegliche Ziele beim Loeschen, gruppiert nach Hauptkategorie. Ausgeschlossen: die Kategorie
 * selbst und ihre Nachkommen (die mit ihr verschwinden bzw. mit ihr verbunden sind).
 */
export function zielGruppen(kategorien: KategorieBasis[], loeschId: string): ZielGruppe[] {
  const weg = nachkommenIds(kategorien, loeschId)
  weg.add(loeschId)
  const wurzeln = kategorien
    .filter((k) => !k.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de'))
  return wurzeln
    .map((w) => ({
      wurzel: w,
      ziele: [
        ...(weg.has(w.id) ? [] : [w]),
        ...kategorien
          .filter((k) => k.parent_id === w.id && !weg.has(k.id))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'de')),
      ],
    }))
    .filter((g) => g.ziele.length > 0)
}

// ─── Reihenfolge ──────────────────────────────────────────────────────────────────

/** Tauscht `id` mit dem Nachbarn in der Richtung; unveraendert am Rand oder bei unbekannter ID. */
export function verschiebeInListe(ids: string[], id: string, richtung: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + richtung
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const kopie = [...ids]
  ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
  return kopie
}

/** Eine Liste von IDs, die vollstaendig und ohne Dopplung in der gewuenschten Reihenfolge steht, in `sort_order` = Index. */
export function reihenfolgeAlsSortOrder(ids: string[]): { id: string; sort_order: number }[] {
  return ids.map((id, index) => ({ id, sort_order: index }))
}
