/**
 * Inventar — geteilte Typen, Vokabular und Ableitungen.
 *
 * Liegt in lib und nicht bei den Komponenten, weil sowohl die Server-Seite
 * (app/(dashboard)/inventar) als auch die Client-Komponenten dieselben Kategorien und
 * Wertstufen brauchen. Zwei Listen, die auseinanderlaufen können, wären hier besonders
 * ärgerlich: die Kategorie entscheidet über das Icon, und ein unbekannter Schlüssel würde
 * eine leere Karte rendern.
 */

// ── Zeilenform der View `valuables_current` (Migration 20260831000002) ─────────
export interface Valuable {
  id: string
  user_id: string
  name: string
  kategorie: string
  marke: string | null
  modell: string | null
  referenz: string | null
  seriennummer: string | null
  gekauft_am: string | null
  kaufpreis: number | null
  kaufquelle: string | null
  waehrung: string
  zustand: string | null
  box_vorhanden: boolean
  papiere_vorhanden: boolean
  lagerort: string | null
  versichert: boolean
  versicherungsnummer: string | null
  notizen: string | null
  im_vermoegen: boolean
  verkauft_am: string | null
  verkaufspreis: number | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Aus der View ergänzt
  aktueller_wert: number | null
  wert_stand: string | null
  wert_quelle: string | null
  rendite_prozent: number | null
  /** Pfad des Hauptbilds (Migration 20260831000005), oder null. */
  hauptbild_pfad: string | null
  bild_anzahl: number
  foto_anzahl: number
}

/** Eine Zeile aus `valuable_images`, angereichert um die signierte URL. */
export interface ValuableImage {
  id: string
  valuable_id: string
  pfad: string
  /** `foto` = hochgeladen (Beleg + Vorlage), `artwork` = erzeugt (nur Anzeige). */
  art: 'foto' | 'artwork'
  ist_hauptbild: boolean
  created_at: string
  url: string | null
  /** Nur bei `artwork`: der Satz, der diese Runde von der vorigen unterschied. */
  hinweis: string | null
  /** Nur bei `artwork`: der vollständige Prompt, mit dem gezeichnet wurde. */
  prompt: string | null
  /** Nur bei `artwork`: welches Bild die Vorlage war (oder null — frei gezeichnet). */
  basis_bild_id: string | null
}

/**
 * Valuable plus signierte URLs — der Bucket ist privat, siehe inventar/page.tsx.
 *
 * Die Bilder kommen als Liste statt als zwei Einzelfelder: ein Gegenstand hat Vorder- und
 * Rückseite, Zifferblatt, Box, Papiere — und beim Generieren muss man auswählen können,
 * welches davon die Vorlage ist.
 */
export type ValuableWithImage = Valuable & {
  /** Was Karte und Detailkopf zeigen. Null -> Kategorie-Icon. */
  anzeige_url: string | null
  /** Alle Bilder des Gegenstands, Hauptbild zuerst. */
  bilder: ValuableImage[]
}

export interface Valuation {
  id: string
  valuable_id: string
  bewertet_am: string
  wert: number
  quelle: string
  notiz: string | null
}

// ── Grenzen der Bilderzeugung ─────────────────────────────────────────────────
/**
 * Wie viele Vorlagen hoechstens in einen Bildlauf gehen.
 *
 * gpt-image-1 nimmt bei /images/edits mehrere Referenzbilder entgegen, und genau davon lebt
 * ein gutes Ergebnis: Vorderseite UND Rueckseite UND Detail zusammen ergeben ein Objekt, das
 * rundum stimmt. Vier ist die Grenze aus Kosten und Latenz, nicht aus der API.
 *
 * Steht hier und nicht in lib/inventar/artwork, weil das Auswahlfeld in der Vitrine dieselbe
 * Zahl braucht — und artwork.ts darf nicht ins Client-Bundle (Buffer, API-Schluessel).
 */
export const MAX_VORLAGEN = 4

/** Der Aenderungswunsch ist ein Satz, kein Aufsatz. */
export const HINWEIS_MAX = 400

// ── Kategorien ────────────────────────────────────────────────────────────────
// Der Schlüssel steht in der DB, das Label in der UI, das Icon kommt aus
// components/inventar/ValuableIcon.tsx — dort MUSS jeder Schlüssel von hier vorkommen.
//
// `en` ist NICHT die Übersetzung von `label`, sondern das Substantiv für den Bildprompt
// (api/inventar/artwork): englisch, Einzahl, konkret. Vorher stand dort das deutsche
// Plural-Label — „a uhren item" in einem sonst englischen Prompt, und das Modell musste
// raten, was gemeint ist.
export const KATEGORIEN = [
  { key: 'uhr',           label: 'Uhren',           en: 'wristwatch' },
  { key: 'feuerzeug',     label: 'Feuerzeuge',      en: 'pocket lighter' },
  { key: 'schmuck',       label: 'Schmuck',         en: 'piece of jewellery' },
  { key: 'schreibgeraet', label: 'Schreibgeräte',   en: 'fountain pen' },
  { key: 'brille',        label: 'Brillen',         en: 'pair of eyeglasses' },
  { key: 'leder',         label: 'Lederwaren',      en: 'leather bag' },
  { key: 'kleidung',      label: 'Kleidung',        en: 'garment' },
  { key: 'kunst',         label: 'Kunst',           en: 'framed artwork' },
  { key: 'muenze',        label: 'Münzen & Barren', en: 'collectible coin' },
  { key: 'technik',       label: 'Technik',         en: 'piece of consumer electronics' },
  { key: 'instrument',    label: 'Instrumente',     en: 'musical instrument' },
  { key: 'sammlung',      label: 'Sammlerstücke',   en: 'collectible item' },
  { key: 'sonstiges',     label: 'Sonstiges',       en: 'valuable object' },
] as const

export type KategorieKey = typeof KATEGORIEN[number]['key']

export function kategorieLabel(key: string): string {
  return KATEGORIEN.find(k => k.key === key)?.label ?? 'Sonstiges'
}

/** Englisches Substantiv für den Bildprompt — siehe Kommentar an KATEGORIEN. */
export function kategorieEn(key: string): string {
  return KATEGORIEN.find(k => k.key === key)?.en ?? 'valuable object'
}

// ── Zustand ───────────────────────────────────────────────────────────────────
export const ZUSTAENDE = [
  { key: 'neu',        label: 'Neu' },
  { key: 'neuwertig',  label: 'Neuwertig' },
  { key: 'gut',        label: 'Gut' },
  { key: 'gebraucht',  label: 'Gebraucht' },
  { key: 'defekt',     label: 'Defekt' },
] as const

export function zustandLabel(key: string | null): string | null {
  if (!key) return null
  return ZUSTAENDE.find(z => z.key === key)?.label ?? key
}

/**
 * Der Zustand als Bildanweisung. Er ist das Einzige am Objekt, das sich unmittelbar in
 * Optik übersetzt — „gebraucht" soll Gebrauchsspuren zeigen und nicht aussehen wie frisch
 * aus der Vitrine. Englisch, weil der ganze Prompt es ist.
 */
const ZUSTAND_EN: Record<string, string> = {
  neu:       'in pristine, unworn condition',
  neuwertig: 'in near-mint condition with barely any wear',
  gut:       'in good condition with a light, even patina',
  gebraucht: 'visibly used, with honest wear and patina',
  defekt:    'worn and visibly damaged',
}

export function zustandEn(key: string | null): string | null {
  if (!key) return null
  return ZUSTAND_EN[key] ?? null
}

// ── Wertstufen ────────────────────────────────────────────────────────────────
/**
 * Der Rahmen um eine Karte — das, was die Vitrine nach Spiel aussehen lässt.
 *
 * Bewusst aus dem Wert abgeleitet und nicht per Hand vergeben: eine „Seltenheit", die man
 * selbst einträgt, sagt nichts, und niemand pflegt sie nach. Die Schwellen sind grob und
 * absichtlich weit auseinander, damit die Stufen unterscheidbar bleiben.
 *
 * Farben kommen ausschließlich aus Theme-Tokens. Ein fest kodiertes Lila oder Gold sähe
 * unter `arctic` oder `sakura` sofort falsch aus — die App hat acht Presets (globals.css).
 */
export interface Wertstufe {
  key: 'basis' | 'solide' | 'wertvoll' | 'sammlerstueck'
  label: string
  /** Rahmenfarbe der Karte. */
  border: string
  /** Schimmer hinter dem Artwork. */
  glow: string
  /** Ab wann diese Stufe gilt (EUR). */
  ab: number
}

export const WERTSTUFEN: Wertstufe[] = [
  {
    key: 'basis', label: 'Basis', ab: 0,
    border: 'var(--border)',
    glow: 'transparent',
  },
  {
    key: 'solide', label: 'Solide', ab: 250,
    border: 'color-mix(in srgb, var(--chart-accent) 35%, var(--border))',
    glow: 'color-mix(in srgb, var(--chart-accent) 10%, transparent)',
  },
  {
    key: 'wertvoll', label: 'Wertvoll', ab: 1000,
    border: 'color-mix(in srgb, var(--chart-accent) 65%, var(--border))',
    glow: 'color-mix(in srgb, var(--chart-accent) 18%, transparent)',
  },
  {
    key: 'sammlerstueck', label: 'Sammlerstück', ab: 5000,
    border: 'var(--chart-accent)',
    glow: 'color-mix(in srgb, var(--chart-accent) 30%, transparent)',
  },
]

export function wertstufe(wert: number | null): Wertstufe {
  const v = wert ?? 0
  // Rückwärts durchgehen: die erste Stufe, deren Schwelle erreicht ist, gewinnt.
  for (let i = WERTSTUFEN.length - 1; i >= 0; i--) {
    if (v >= WERTSTUFEN[i].ab) return WERTSTUFEN[i]
  }
  return WERTSTUFEN[0]
}

// ── Ableitungen ───────────────────────────────────────────────────────────────

/** Haltedauer in ganzen Monaten, oder null ohne Kaufdatum. */
export function haltedauerMonate(gekauftAm: string | null, bis = new Date()): number | null {
  if (!gekauftAm) return null
  const von = new Date(`${gekauftAm}T12:00:00`)
  if (Number.isNaN(von.getTime())) return null
  const monate = (bis.getFullYear() - von.getFullYear()) * 12 + (bis.getMonth() - von.getMonth())
  return Math.max(0, monate)
}

export function haltedauerLabel(gekauftAm: string | null): string | null {
  const m = haltedauerMonate(gekauftAm)
  if (m === null) return null
  if (m < 12) return `${m} Mon.`
  const jahre = Math.floor(m / 12)
  const rest = m % 12
  return rest === 0 ? `${jahre} J.` : `${jahre} J. ${rest} Mon.`
}

// ── Register-Vollständigkeit ──────────────────────────────────────────────────

/**
 * Wie vollständig ein Eintrag als Register ist. Die Seite ist ein Register und kein
 * Preisticker — also zählt, was im Schadens- oder Verkaufsfall gebraucht wird: Foto,
 * Seriennummer, Kaufdatum, Kaufpreis, Box, Papiere. Die Versicherung zählt nur, wenn der
 * Gegenstand überhaupt eine Wertstufe über „Basis" hat; für Kleinkram wäre „unversichert"
 * kein Mangel.
 */
export interface Vollstaendigkeit {
  /** 0–100. */
  prozent: number
  /** Was fehlt, in Anzeigereihenfolge. */
  fehlt: string[]
}

export function vollstaendigkeit(v: Valuable): Vollstaendigkeit {
  const pruefungen: [boolean, string][] = [
    [v.bild_anzahl > 0, 'Foto'],
    [!!v.seriennummer, 'Seriennummer'],
    [!!v.gekauft_am, 'Kaufdatum'],
    [v.kaufpreis != null, 'Kaufpreis'],
    [v.box_vorhanden, 'Box'],
    [v.papiere_vorhanden, 'Papiere'],
  ]
  if (wertstufe(v.aktueller_wert).key !== 'basis') pruefungen.push([v.versichert, 'Versicherung'])
  const fehlt = pruefungen.filter(([ok]) => !ok).map(([, label]) => label)
  return {
    prozent: Math.round(((pruefungen.length - fehlt.length) / pruefungen.length) * 100),
    fehlt,
  }
}

/** Alter der letzten Bewertung in Monaten, oder null ohne Bewertungsdatum. */
export function wertAlterMonate(v: Valuable): number | null {
  return haltedauerMonate(v.wert_stand)
}

/** Ab wann ein Wert als veraltet gilt. */
export const WERT_VERALTET_MONATE = 12

/**
 * Summe der Sammlung. `nurVermoegen` spiegelt denselben Filter wie fn_valuables_total in
 * der DB — damit die Zahl auf der Inventarseite zur Zahl im Net Worth passt.
 */
export function gesamtwert(items: Valuable[], nurVermoegen = false): number {
  return items
    .filter(v => !nurVermoegen || v.im_vermoegen)
    .reduce((s, v) => s + (v.aktueller_wert ?? 0), 0)
}
