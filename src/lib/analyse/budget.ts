/**
 * Budget gegen Ist für die Analyse-Seite. Rein, ohne Datenbank und ohne Imports (damit
 * `node --test` die Datei direkt lädt).
 *
 * ZUORDNUNG (wichtig): Die Budget-Seite (finance/budget) führt `budget_categories` ("Lebensmittel",
 * "Transport", ...) als eigene Stammdatenliste ohne Verknüpfung zu den Buchungskategorien
 * (`categories`). Sie kennt kein "Ist aus Buchungen": ihr "Ist" ist die aus den Posten
 * hochgerechnete Monatsausgabe. Damit Soll gegen echtes Ist laufen kann, ordnen wir hier über den
 * NAMEN zu: gleicher Name (ohne Groß-/Kleinschreibung) gewinnt, sonst eine Ausgabenkategorie, deren
 * Name den Budgetnamen enthält ("Körperpflege" -> "Drogerie & Körperpflege"; die kürzeste gewinnt).
 * Eine Budgetkategorie ohne Treffer bleibt sichtbar, aber "nicht zugeordnet" und zählt nicht ins
 * Gesamtbudget — sonst stünde ein Soll ohne mögliches Ist als scheinbar grüner Balken da.
 *
 * Ist einer zugeordneten Kategorie = alle Ausgaben, deren Kategorie ODER Oberkategorie sie ist
 * (eine Hauptkategorie sammelt also ihre Unterkategorien). Überlappen sich zwei Budgets (Haupt- und
 * Unterkategorie), zählt das Gesamt-Ist die Buchungen doppelt; bei den heutigen flachen Budgets
 * kommt das nicht vor.
 *
 * Alles auf Monatsebene wie die übrige Analyse (siehe vergleich.ts): Soll = Monatsbudget x
 * Monate des Fensters, Ist = Monatssummen dieser Monate.
 */

export const SCHWELLE_GELB = 0.8
export const SCHWELLE_ROT = 1

export type BudgetStatus = 'gruen' | 'gelb' | 'rot'

/** Status-Farben aus den semantischen Tokens (Kontrast als Text geprüft), nicht hart aus Tailwind. */
export const statusFarbe = (s: BudgetStatus): string =>
  s === 'gruen' ? 'var(--success)' : s === 'gelb' ? 'var(--warning)' : 'var(--danger)'

export interface BudgetKategorie {
  id: string
  name: string
  icon: string | null
  monatsBudget: number | null
}

export interface BudgetPosten {
  unit_price: number
  quantity: number
  interval_days: number
}

export interface BudgetZielWerte {
  buffer_pct: number
  tax_pct: number
  savings_pct: number
}

export interface BuchungsKategorie {
  id: string
  name: string
  type: string
}

/** Zeile der Monatssummen, soweit hier gebraucht. */
export interface BudgetFlowZeile {
  /** Monatserster YYYY-MM-DD. */
  month: string
  category_id?: string | null
  root_category_id?: string | null
  income: number
  expense: number
  /** `echt` | `anlage` | `forderung`; fehlt bei Zeilen ohne Art (dann zaehlt die Zeile). */
  flow_kind?: string
}

export interface BudgetFenster {
  von: string
  bis: string
}

export interface BudgetZeile {
  id: string
  name: string
  icon: string | null
  /** Zugeordnete Buchungskategorie (für den Filter `kat`), null = nicht zugeordnet. */
  kategorieId: string | null
  soll: number
  ist: number
  /** Soll - Ist; negativ = überschritten. */
  rest: number
  /** Ist / Soll; null bei Soll 0 (nicht definiert). */
  auslastung: number | null
  status: BudgetStatus
}

export interface BudgetPrognose {
  tag: number
  tageImMonat: number
  tageBisMonatsende: number
  istMonat: number
  /** Lineare Hochrechnung auf den ganzen Monat. */
  hochrechnung: number
  sollMonat: number
  status: BudgetStatus
}

export interface BudgetErgebnis {
  zeilen: BudgetZeile[]
  /** Nicht zuordenbare Budgetkategorien (nur Name, ohne Ist). */
  offen: BudgetKategorie[]
  monate: number
  gesamt: BudgetZeile | null
  prognose: BudgetPrognose | null
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Buchungskategorie zu einer Budgetkategorie (nach Name), oder null. */
export function ordneZu(budgetName: string, kategorien: BuchungsKategorie[]): string | null {
  const b = norm(budgetName)
  if (!b) return null
  const ausgaben = kategorien.filter(k => k.type === 'expense')
  const gleich = ausgaben.find(k => norm(k.name) === b)
  if (gleich) return gleich.id
  if (b.length < 4) return null
  const enthaelt = ausgaben
    .filter(k => norm(k.name).includes(b))
    .sort((x, y) => x.name.length - y.name.length)
  return enthaelt[0]?.id ?? null
}

/** Status aus Auslastung: < 80 % grün, 80 bis 100 % gelb, über 100 % rot. */
export function statusVon(ist: number, soll: number): BudgetStatus {
  if (soll <= 0) return ist > 0 ? 'rot' : 'gruen'
  const r = ist / soll
  if (r > SCHWELLE_ROT + 1e-9) return 'rot'
  if (r >= SCHWELLE_GELB - 1e-9) return 'gelb'
  return 'gruen'
}

function zeile(
  id: string, name: string, icon: string | null, kategorieId: string | null, soll: number, ist: number,
): BudgetZeile {
  return {
    id, name, icon, kategorieId, soll, ist,
    rest: soll - ist,
    auslastung: soll > 0 ? ist / soll : null,
    status: statusVon(ist, soll),
  }
}

const monatNr = (m: string): number => {
  const [j, mm] = m.slice(0, 7).split('-').map(Number)
  return j * 12 + (mm - 1)
}

/** Monate des Fensters; ohne Fenster ("Alles") ab dem frühesten Monat bis heute, mindestens 1. */
export function fensterMonate(fenster: BudgetFenster | null, fruehesterMonat: string | null, heute: string): number {
  if (fenster) return Math.max(1, monatNr(fenster.bis) - monatNr(fenster.von) + 1)
  if (!fruehesterMonat) return 1
  return Math.max(1, monatNr(heute) - monatNr(fruehesterMonat) + 1)
}

/** Ab welchem Tag des Monats die lineare Prognose gezeigt wird. */
export const PROGNOSE_AB_TAG = 8

export function tageImMonat(datum: string): number {
  const [j, m] = datum.split('-').map(Number)
  return new Date(Date.UTC(j, m, 0)).getUTCDate()
}

export interface BudgetEingabe {
  budgets: BudgetKategorie[]
  kategorien: BuchungsKategorie[]
  zeilen: BudgetFlowZeile[]
  fenster: BudgetFenster | null
  fruehesterMonat: string | null
  heute: string
}

function istVon(zeilen: BudgetFlowZeile[], kategorieId: string): number {
  let s = 0
  for (const z of zeilen) {
    if (z.category_id === kategorieId || z.root_category_id === kategorieId) s += z.expense
  }
  return s
}

export function berechneBudget(e: BudgetEingabe): BudgetErgebnis {
  const monate = fensterMonate(e.fenster, e.fruehesterMonat, e.heute)
  const imFenster = e.zeilen.filter(z => {
    const m = z.month.slice(0, 7)
    return !e.fenster || (m >= e.fenster.von.slice(0, 7) && m <= e.fenster.bis.slice(0, 7))
  })
  const heuteMonat = e.heute.slice(0, 7)
  const laufend = e.zeilen.filter(z => z.month.slice(0, 7) === heuteMonat)

  const zeilen: BudgetZeile[] = []
  const offen: BudgetKategorie[] = []
  let sollMonat = 0
  let istMonat = 0
  for (const b of e.budgets) {
    // Ohne Budgetbetrag gibt es nichts zu vergleichen.
    if (b.monatsBudget == null || !(b.monatsBudget > 0)) continue
    const kat = ordneZu(b.name, e.kategorien)
    if (!kat) { offen.push(b); continue }
    zeilen.push(zeile(b.id, b.name, b.icon, kat, b.monatsBudget * monate, istVon(imFenster, kat)))
    sollMonat += b.monatsBudget
    istMonat += istVon(laufend, kat)
  }
  // Höchste Auslastung zuerst; Soll 0 ist durch den Filter oben ausgeschlossen.
  zeilen.sort((a, b) => (b.auslastung ?? 0) - (a.auslastung ?? 0))

  const gesamt = zeilen.length === 0
    ? null
    : zeile('gesamt', 'Gesamt', null, null,
        zeilen.reduce((s, z) => s + z.soll, 0), zeilen.reduce((s, z) => s + z.ist, 0))

  // Prognose nur, wenn der laufende Monat im Fenster liegt.
  const laeuft = !e.fenster || e.fenster.bis.slice(0, 7) >= heuteMonat
  let prognose: BudgetPrognose | null = null
  // Erst ab dem 8. Tag: Fixkosten vom Monatsanfang (Miete, Abos) wuerden sonst hochskaliert —
  // 400 € am 2. ergaeben „6.200 € bis Monatsende" und den Status „ueber Budget".
  if (gesamt && laeuft && Number(e.heute.slice(8, 10)) >= PROGNOSE_AB_TAG) {
    const tag = Number(e.heute.slice(8, 10))
    const tim = tageImMonat(e.heute)
    const hochrechnung = istMonat / tag * tim
    prognose = {
      tag, tageImMonat: tim, tageBisMonatsende: tim - tag,
      istMonat, hochrechnung, sollMonat, status: statusVon(hochrechnung, sollMonat),
    }
  }
  return { zeilen, offen, monate, gesamt, prognose }
}

// ─── Einkommensziel ──────────────────────────────────────────────────────────────────────

/** Monatskosten eines Postens (wie OverviewTab der Budget-Seite: auf 30 Tage). */
export const postenMonatlich = (p: BudgetPosten): number =>
  p.interval_days > 0 ? (p.unit_price * p.quantity) / p.interval_days * 30 : 0

/** Netto-Mindestgehalt pro Monat: Lebenshaltung + Puffer + Sparen (Formel der Budget-Seite). */
export function mindestNetto(posten: BudgetPosten[], ziel: BudgetZielWerte | null): number {
  const lebenshaltung = posten.reduce((s, p) => s + postenMonatlich(p), 0)
  const puffer = lebenshaltung * ((ziel?.buffer_pct ?? 15) / 100)
  const sparen = (lebenshaltung + puffer) * ((ziel?.savings_pct ?? 10) / 100)
  return lebenshaltung + puffer + sparen
}

export interface EinkommensVergleich {
  soll: number
  ist: number
  /** Ist / Soll, begrenzt nicht; null bei Soll 0. */
  erreicht: number | null
}

/** Einnahmen im Fenster gegen das Netto-Ziel x Monate. */
export function einkommensVergleich(
  zeilen: BudgetFlowZeile[], fenster: BudgetFenster | null, monate: number, nettoZiel: number,
): EinkommensVergleich | null {
  if (!(nettoZiel > 0)) return null
  // Nur echte Einnahmen: Rueckfluesse aus Anlagen (Kraken-Auszahlung, Depotverkauf) und
  // Forderungen sind kein Einkommen und fuellten den Balken „Netto-Mindestgehalt erreicht" sonst
  // kuenstlich (reale Daten: Okt. 2025 9.075 € Anlage-Einnahmen).
  const ist = zeilen
    .filter(z => z.flow_kind === undefined || z.flow_kind === 'echt')
    .filter(z => !fenster || (z.month.slice(0, 7) >= fenster.von.slice(0, 7) && z.month.slice(0, 7) <= fenster.bis.slice(0, 7)))
    .reduce((s, z) => s + z.income, 0)
  const soll = nettoZiel * monate
  return { soll, ist, erreicht: soll > 0 ? ist / soll : null }
}
