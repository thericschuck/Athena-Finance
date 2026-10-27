/**
 * Reine Formatierlogik fuer das Aenderungslog (Haushalt Phase 5). Kein I/O, keine Imports ausser Typen,
 * damit sie mit node:test ohne Next-Umgebung laeuft.
 *
 * Quelle sind Zeilen der View v_audit_feed. Datenschutz: Rohwerte sensibler Felder (IBAN, Notizen,
 * Beschreibungen, Seriennummern) erscheinen NIE im Satz. IBANs nur maskiert (und nur als Objektname),
 * lange Texte nur als "geaendert".
 */

export type AuditZeile = {
  id: number
  created_at: string
  table_name: string
  record_id: string | null
  action: string // INSERT | UPDATE | DELETE
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  owner_id: string | null
  actor_id: string | null
  actor_kind: string // user | system | unknown
  actor_name: string | null
}

// ---------------------------------------------------------------------------------------------------------
// Bereiche (Filter) und Tabellen-Labels

export type BereichKey =
  | 'konten' | 'buchungen' | 'vertraege' | 'schulden' | 'sparziele'
  | 'inventar' | 'depot' | 'krypto' | 'budget' | 'sonstiges'

export const BEREICHE: { key: BereichKey; label: string; tabellen: string[] }[] = [
  { key: 'konten', label: 'Konten', tabellen: ['accounts'] },
  { key: 'buchungen', label: 'Buchungen', tabellen: ['transactions', 'bank_transactions'] },
  { key: 'vertraege', label: 'Verträge', tabellen: ['contracts'] },
  { key: 'schulden', label: 'Schulden', tabellen: ['debts'] },
  { key: 'sparziele', label: 'Sparziele', tabellen: ['savings_goals'] },
  { key: 'inventar', label: 'Inventar', tabellen: ['valuables'] },
  { key: 'depot', label: 'Depot', tabellen: ['depots', 'depot_transactions', 'savings_plans'] },
  { key: 'krypto', label: 'Krypto', tabellen: ['assets'] },
  { key: 'budget', label: 'Budget', tabellen: ['budget_categories', 'budget_items'] },
  { key: 'sonstiges', label: 'Sonstiges (nur eigene)', tabellen: ['categories', 'belege'] },
]

export function bereichTabellen(key: string | null | undefined): string[] | null {
  return BEREICHE.find(b => b.key === key)?.tabellen ?? null
}

const TABELLEN_LABEL: Record<string, string> = {
  accounts: 'Konto',
  transactions: 'Buchung',
  bank_transactions: 'Bankbuchung',
  contracts: 'Vertrag',
  debts: 'Schuld',
  savings_goals: 'Sparziel',
  valuables: 'Inventar',
  assets: 'Krypto-Position',
  depots: 'Depot',
  depot_transactions: 'Depot-Buchung',
  savings_plans: 'Sparplan',
  budget_categories: 'Budget-Kategorie',
  budget_items: 'Budget-Posten',
  categories: 'Kategorie',
  belege: 'Beleg',
}

export function tabellenLabel(tabelle: string): string {
  return TABELLEN_LABEL[tabelle] ?? 'Eintrag'
}

// ---------------------------------------------------------------------------------------------------------
// Akteur und Zeit

export type MitgliedNamen = ReadonlyMap<string, string | null | undefined>

/** 'Du' fuer den eigenen Nutzer, 'System' fuer Automatik, 'Unbekannt' fuer Altzeilen, sonst Mitgliedsname. */
export function akteurName(
  z: Pick<AuditZeile, 'actor_id' | 'actor_kind' | 'actor_name'>,
  eigeneId: string,
  mitglieder?: MitgliedNamen,
): string {
  if (z.actor_kind === 'system') return 'System'
  if (z.actor_kind === 'unknown') return 'Unbekannt'
  if (z.actor_id && z.actor_id === eigeneId) return 'Du'
  const n = z.actor_id ? mitglieder?.get(z.actor_id)?.trim() : null
  if (n) return n
  const v = z.actor_name?.trim()
  return v || 'Mitglied'
}

const MIN = 60_000
const STD = 60 * MIN
const TAG = 24 * STD

function kalenderTag(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / TAG)
}

export function datumDe(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Relative Zeit auf Deutsch: "gerade eben", "vor 5 Minuten", "vor 3 Stunden", "gestern", "vor 4 Tagen", sonst Datum. */
export function relativeZeit(iso: string, jetzt: Date = new Date()): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const diff = jetzt.getTime() - t.getTime()
  if (diff < MIN) return 'gerade eben'
  if (diff < STD) {
    const m = Math.floor(diff / MIN)
    return m === 1 ? 'vor 1 Minute' : `vor ${m} Minuten`
  }
  const tage = kalenderTag(jetzt) - kalenderTag(t)
  if (tage <= 0) {
    const h = Math.floor(diff / STD)
    return h === 1 ? 'vor 1 Stunde' : `vor ${h} Stunden`
  }
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} Tagen`
  return datumDe(t)
}

// ---------------------------------------------------------------------------------------------------------
// Maskierung und Kuerzung

/** IBAN maskieren: Laendercode + Pruefziffern und letzte 4 Stellen, Rest als Punkte. */
export function maskiereIban(iban: string): string {
  const s = iban.replace(/\s+/g, '').toUpperCase()
  if (s.length <= 8) return '••••'
  return `${s.slice(0, 4)} •••• ${s.slice(-4)}`
}

export function kuerze(text: string, max = 40): string {
  const s = text.replace(/\s+/g, ' ').trim()
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

const IBAN_MUSTER = /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,}$/i

// ---------------------------------------------------------------------------------------------------------
// Felder

type FeldArt = 'geld' | 'zahl' | 'datum' | 'text' | 'lang' | 'versteckt' | 'bool' | 'ref'

type Feld = { label: string; art: FeldArt }

const FELDER: Record<string, Feld> = {
  name: { label: 'Name', art: 'text' },
  amount: { label: 'Betrag', art: 'geld' },
  amount_eur: { label: 'Betrag', art: 'geld' },
  amount_base: { label: 'Betrag', art: 'geld' },
  monthly_amount: { label: 'Monatsbetrag', art: 'geld' },
  monthly_payment: { label: 'Monatliche Rate', art: 'geld' },
  monthly_budget: { label: 'Monatsbudget', art: 'geld' },
  monthly_savings_rate: { label: 'Sparrate', art: 'geld' },
  original_amount: { label: 'Ursprungsbetrag', art: 'geld' },
  outstanding: { label: 'Restschuld', art: 'geld' },
  current_amount: { label: 'Gesparter Betrag', art: 'geld' },
  target_amount: { label: 'Zielbetrag', art: 'geld' },
  kaufpreis: { label: 'Kaufpreis', art: 'geld' },
  verkaufspreis: { label: 'Verkaufspreis', art: 'geld' },
  unit_price: { label: 'Einzelpreis', art: 'geld' },
  price_per_share: { label: 'Kurs', art: 'geld' },
  avg_buy_price: { label: 'Einstandskurs', art: 'geld' },
  quantity: { label: 'Menge', art: 'zahl' },
  shares: { label: 'Anteile', art: 'zahl' },
  interest_rate: { label: 'Zinssatz', art: 'zahl' },
  fx_rate: { label: 'Wechselkurs', art: 'zahl' },
  billing_day: { label: 'Abbuchungstag', art: 'zahl' },
  execution_day: { label: 'Ausführungstag', art: 'zahl' },
  notice_days: { label: 'Kündigungsfrist', art: 'zahl' },
  interval_days: { label: 'Intervall', art: 'zahl' },
  priority: { label: 'Priorität', art: 'zahl' },
  date: { label: 'Datum', art: 'datum' },
  entry_date: { label: 'Buchungsdatum', art: 'datum' },
  value_date: { label: 'Valuta', art: 'datum' },
  start_date: { label: 'Startdatum', art: 'datum' },
  end_date: { label: 'Enddatum', art: 'datum' },
  due_date: { label: 'Fälligkeit', art: 'datum' },
  target_date: { label: 'Zieldatum', art: 'datum' },
  transaction_date: { label: 'Datum', art: 'datum' },
  gekauft_am: { label: 'Kaufdatum', art: 'datum' },
  verkauft_am: { label: 'Verkaufsdatum', art: 'datum' },
  savings_rate_start_date: { label: 'Start der Sparrate', art: 'datum' },
  type: { label: 'Typ', art: 'text' },
  transaction_type: { label: 'Typ', art: 'text' },
  frequency: { label: 'Intervall', art: 'text' },
  status: { label: 'Status', art: 'text' },
  provider: { label: 'Anbieter', art: 'text' },
  creditor: { label: 'Gläubiger', art: 'text' },
  institution: { label: 'Bank', art: 'text' },
  merchant: { label: 'Händler', art: 'text' },
  counterpart_name: { label: 'Gegenpartei', art: 'text' },
  fund_name: { label: 'Fonds', art: 'text' },
  symbol: { label: 'Symbol', art: 'text' },
  exchange: { label: 'Börse', art: 'text' },
  kategorie: { label: 'Kategorie', art: 'text' },
  marke: { label: 'Marke', art: 'text' },
  modell: { label: 'Modell', art: 'text' },
  lagerort: { label: 'Lagerort', art: 'text' },
  zustand: { label: 'Zustand', art: 'text' },
  nutzung: { label: 'Nutzung', art: 'text' },
  wertmodus: { label: 'Wertmodus', art: 'text' },
  portfolio_name: { label: 'Portfolio', art: 'text' },
  currency: { label: 'Währung', art: 'text' },
  waehrung: { label: 'Währung', art: 'text' },
  category: { label: 'Kategorie', art: 'text' },
  category_source: { label: 'Kategorie-Herkunft', art: 'text' },
  // Texte, die privat sein koennen: nie im Wortlaut
  notes: { label: 'Notizen', art: 'lang' },
  notizen: { label: 'Notizen', art: 'lang' },
  description: { label: 'Beschreibung', art: 'lang' },
  raw_description: { label: 'Beschreibung', art: 'lang' },
  bank_reference: { label: 'Verwendungszweck', art: 'lang' },
  bank_label: { label: 'Bankbezeichnung', art: 'lang' },
  tags: { label: 'Tags', art: 'lang' },
  // Identifikatoren: nie im Wortlaut
  iban: { label: 'IBAN', art: 'versteckt' },
  bank_iban: { label: 'IBAN', art: 'versteckt' },
  account_iban: { label: 'IBAN', art: 'versteckt' },
  counterpart_iban: { label: 'Gegen-IBAN', art: 'versteckt' },
  account_bic: { label: 'BIC', art: 'versteckt' },
  counterpart_bic: { label: 'BIC', art: 'versteckt' },
  isin: { label: 'ISIN', art: 'versteckt' },
  seriennummer: { label: 'Seriennummer', art: 'versteckt' },
  versicherungsnummer: { label: 'Versicherungsnummer', art: 'versteckt' },
  referenz: { label: 'Referenz', art: 'versteckt' },
  document_url: { label: 'Dokument', art: 'versteckt' },
  receipt_url: { label: 'Beleg', art: 'versteckt' },
  // Verweise
  account_id: { label: 'Konto', art: 'ref' },
  to_account_id: { label: 'Zielkonto', art: 'ref' },
  category_id: { label: 'Kategorie', art: 'ref' },
  ai_category_id: { label: 'Kategorie', art: 'ref' },
  contract_id: { label: 'Vertrag', art: 'ref' },
  transfer_to: { label: 'Umbuchung', art: 'ref' },
  // Schalter
  is_active: { label: 'Aktiv', art: 'bool' },
  is_recurring: { label: 'Wiederkehrend', art: 'bool' },
  auto_renews: { label: 'Automatische Verlängerung', art: 'bool' },
  shared: { label: 'Teilen', art: 'bool' },
  im_vermoegen: { label: 'Im Vermögen', art: 'bool' },
  versichert: { label: 'Versichert', art: 'bool' },
  box_vorhanden: { label: 'Box', art: 'bool' },
  papiere_vorhanden: { label: 'Papiere', art: 'bool' },
}

/** Felder ohne Aussagewert (Technik, Sortierung, Sync-Rauschen): zaehlen nicht als Aenderung. */
const RAUSCHEN = new Set([
  'id', 'user_id', 'created_at', 'updated_at', 'sort_order', 'color', 'icon', 'external_id', 'ai_checked_at',
])

function gleich(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function waehrungVon(z: Pick<AuditZeile, 'old_values' | 'new_values'>): string {
  const c = z.new_values?.currency ?? z.new_values?.waehrung ?? z.old_values?.currency ?? z.old_values?.waehrung
  return typeof c === 'string' && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : 'EUR'
}

function zuZahl(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
}

function geldDe(v: unknown, waehrung: string): string | null {
  const n = zuZahl(v)
  if (!Number.isFinite(n)) return null
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung }).format(n)
  } catch {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
  }
}

function zahlDe(v: unknown): string | null {
  const n = zuZahl(v)
  if (!Number.isFinite(n)) return null
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 }).format(n)
}

function datumWert(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

function textWert(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (IBAN_MUSTER.test(s)) return maskiereIban(s)
  return kuerze(s, 30)
}

function wertText(art: FeldArt, key: string, v: unknown, wc: string): string | null {
  if (v === null || v === undefined) return null
  switch (art) {
    case 'geld': return geldDe(v, wc)
    case 'zahl': {
      const z = zahlDe(v)
      return z && key === 'interest_rate' ? `${z} %` : z
    }
    case 'datum': return datumWert(v)
    case 'text': return textWert(v)
    default: return null
  }
}

export type Aenderung = { key: string; label: string; art: FeldArt }

/** Geaenderte, aussagekraeftige Felder eines UPDATE (gleiche Labels nur einmal). */
export function geaenderteFelder(
  alt: Record<string, unknown> | null,
  neu: Record<string, unknown> | null,
): Aenderung[] {
  if (!alt || !neu) return []
  const keys = new Set([...Object.keys(alt), ...Object.keys(neu)])
  const out: Aenderung[] = []
  const gesehen = new Set<string>()
  for (const k of [...keys].sort()) {
    if (RAUSCHEN.has(k) || gleich(alt[k], neu[k])) continue
    const f = FELDER[k]
    const label = f?.label ?? 'Weitere Angaben'
    if (gesehen.has(label)) continue
    gesehen.add(label)
    out.push({ key: k, label, art: f?.art ?? 'lang' })
  }
  return out
}

function aufzaehlung(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`
}

/** Kurzer deutscher Satz fuer eine Aenderung. Enthaelt nie IBANs, Notizen oder Beschreibungen im Wortlaut. */
export function beschreibeAenderung(z: Pick<AuditZeile, 'action' | 'old_values' | 'new_values'>): string {
  const a = z.action.toUpperCase()
  if (a === 'INSERT') return 'angelegt'
  if (a === 'DELETE') return 'gelöscht'
  if (a !== 'UPDATE') return 'geändert'

  const felder = geaenderteFelder(z.old_values, z.new_values)
  if (felder.length === 0) return 'geändert'

  if (felder.length === 1) {
    const { key, label, art } = felder[0]
    const alt = z.old_values?.[key]
    const neu = z.new_values?.[key]
    const wc = waehrungVon(z)
    if (art === 'bool') {
      const an = neu === true
      if (key === 'shared') return an ? 'mit dem Haushalt geteilt' : 'nicht mehr mit dem Haushalt geteilt'
      if (key === 'is_active') return an ? 'aktiviert' : 'deaktiviert'
      return `${label}: ${an ? 'ja' : 'nein'}`
    }
    if (art === 'geld' || art === 'zahl' || art === 'datum' || art === 'text') {
      const a2 = wertText(art, key, alt, wc)
      const n2 = wertText(art, key, neu, wc)
      if (a2 && n2) return `${label} von ${a2} auf ${n2}`
      if (n2) return `${label} auf ${n2} gesetzt`
      return `${label} entfernt`
    }
    return `${label} geändert`
  }

  if (felder.length <= 3) return `${aufzaehlung(felder.map(f => f.label))} geändert`
  return `${felder.length} Angaben geändert`
}

// ---------------------------------------------------------------------------------------------------------
// Objekt (Name und Link)

/** Anzeigename des betroffenen Objekts; nie eine volle IBAN. */
export function objektName(z: Pick<AuditZeile, 'table_name' | 'old_values' | 'new_values'>): string {
  const v = z.new_values ?? z.old_values ?? {}
  const s = (k: string): string | null => {
    const x = v[k]
    return typeof x === 'string' && x.trim() ? x.trim() : null
  }
  let n: string | null
  switch (z.table_name) {
    case 'bank_transactions': n = s('counterpart_name'); break
    case 'transactions': n = s('merchant'); break
    case 'depot_transactions':
    case 'savings_plans': n = s('fund_name'); break
    case 'valuables': n = s('name') ?? ([s('marke'), s('modell')].filter(Boolean).join(' ') || null); break
    default: n = s('name') ?? s('fund_name') ?? s('symbol')
  }
  if (!n) return tabellenLabel(z.table_name)
  if (IBAN_MUSTER.test(n)) return maskiereIban(n)
  return kuerze(n, 40)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ziel fuer den Link zum Objekt: Detailseite, wo es eine gibt; sonst die Bereichsseite; geloeschte: kein Link. */
export function objektLink(z: Pick<AuditZeile, 'table_name' | 'record_id' | 'action'>): string | null {
  if (z.action.toUpperCase() === 'DELETE') return null
  const id = z.record_id && UUID.test(z.record_id) ? z.record_id : null
  switch (z.table_name) {
    case 'accounts': return id ? `/finance/accounts/${id}` : '/finance/accounts'
    case 'contracts': return id ? `/finance/contracts/${id}` : '/finance/contracts'
    case 'transactions':
    case 'bank_transactions': return '/finance/transactions'
    case 'debts': return '/finance/debts'
    case 'savings_goals': return '/finance/goals'
    case 'valuables': return '/inventar'
    case 'depots':
    case 'depot_transactions':
    case 'savings_plans': return '/depot'
    case 'assets': return '/crypto'
    case 'budget_categories':
    case 'budget_items': return '/finance/budget'
    case 'categories': return '/finance/categories'
    default: return null
  }
}

// ---------------------------------------------------------------------------------------------------------
// Zeitraum und Cursor

export type ZeitraumKey = 'alle' | '24h' | '7d' | '30d' | '90d'

export const ZEITRAEUME: { key: ZeitraumKey; label: string }[] = [
  { key: 'alle', label: 'Gesamter Zeitraum' },
  { key: '24h', label: 'Letzte 24 Stunden' },
  { key: '7d', label: 'Letzte 7 Tage' },
  { key: '30d', label: 'Letzte 30 Tage' },
  { key: '90d', label: 'Letzte 90 Tage' },
]

export function zeitraumAb(key: string | null | undefined, jetzt: Date = new Date()): string | null {
  const std: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90 }
  const h = key ? std[key] : undefined
  return h ? new Date(jetzt.getTime() - h * STD).toISOString() : null
}

export type Cursor = { createdAt: string; id: number }

export function cursorKodieren(c: Cursor): string {
  return `${c.createdAt}|${c.id}`
}

/** Strenge Pruefung: der Cursor landet in einem PostgREST-Filter. */
export function cursorLesen(s: string | null | undefined): Cursor | null {
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})?)\|(\d{1,15})$/.exec(s)
  if (!m || Number.isNaN(new Date(m[1]).getTime())) return null
  return { createdAt: m[1], id: Number(m[2]) }
}
