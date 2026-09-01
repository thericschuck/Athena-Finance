import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import {
  erzeugeArtwork,
  artworkVerfuegbar,
  HINWEIS_MAX,
  MAX_VORLAGEN,
  OHNE_SCHLUESSEL,
} from '@/lib/inventar/artwork'

type DB = SupabaseClient<Database>

export type ActionContext = { supabase: DB; userId: string }

/**
 * Eine schreibende Aktion, die Athena VORSCHLAGEN darf.
 *
 * Der Modellaufruf führt `execute` niemals selbst aus — das Werkzeug in
 * tools.ts legt nur eine Zeile in `ai_pending_actions` an (Status `pending`)
 * und gibt deren ID zurück. Erst eine ausdrückliche Bestätigung im UI ruft
 * `runWriteAction` auf (siehe app/(dashboard)/assistant/actions.ts).
 *
 * Daraus folgt die Aufteilung:
 *  - `schema`    validiert BEIDE Male — beim Vorschlagen und erneut beim
 *                Ausführen. Zwischen beiden Zeitpunkten liegt eine Runde durch
 *                die Datenbank (jsonb), deshalb wird der Input beim Ausführen
 *                nicht als bereits geprüft angenommen.
 *  - `summarize` erzeugt den Satz, den die Nutzerin/der Nutzer im
 *                Bestätigungs-Dialog liest. Er muss aus echten Daten bestehen
 *                (Kategoriename statt UUID), sonst ist die Bestätigung
 *                wertlos — man kann nicht zustimmen, was man nicht sieht.
 *  - `execute`   schreibt. Jede Query filtert zusätzlich auf `user_id`, obwohl
 *                RLS das ohnehin täte: die Aktion läuft mit dem Client der
 *                Nutzerin/des Nutzers, doppelter Boden kostet hier nichts.
 */
type ActionDefinition<S extends z.ZodType> = {
  /** Klartext-Name der Aktion fürs UI. Der rohe Bezeichner
      (`categorizeTransactions`) sagt niemandem etwas. */
  label: string
  /** Wird 1:1 zur Werkzeugbeschreibung für das Modell. */
  description: string
  schema: S
  summarize: (input: z.infer<S>, ctx: ActionContext) => Promise<string>
  /** Aufschlüsselung unter der Zusammenfassung: `summarize` sagt WAS passiert,
      `details` sagen WOMIT. Bei „2 Buchungen der Kategorie Abo zuordnen" ist
      genau das die Frage, die vor dem Klick offen bleibt — welche zwei? */
  details?: (input: z.infer<S>, ctx: ActionContext) => Promise<ActionDetail[]>
  /** Prüfung VOR dem Vorschlag. Liefert eine Klartext-Begründung, wenn die
      Aktion am aktuellen Datenstand gar nicht ausführbar wäre (Kategorie mit
      Unterkategorien löschen, Kategorie unter sich selbst hängen). Das Modell
      bekommt sie als Werkzeugfehler zurück und kann den Aufruf korrigieren,
      statt Eric eine Karte hinzulegen, die beim Klick scheitert. `null` heißt
      „in Ordnung". Läuft ein zweites Mal bei der Bestätigung, weil sich der
      Datenstand zwischen Vorschlag und Klick geändert haben kann. */
  validate?: (input: z.infer<S>, ctx: ActionContext) => Promise<string | null>
  execute: (input: z.infer<S>, ctx: ActionContext) => Promise<Record<string, unknown>>
}

/** Eine Zeile der Aufschlüsselung im Bestätigungs-Dialog. */
export type ActionDetail = {
  /** Worum es geht: Buchungstext, Feldname. */
  label: string
  /** Der konkrete Wert: Betrag, Datum, „alt → neu". */
  value?: string
  /** Kleingedrucktes unter dem Label: Datum, bisherige Kategorie. */
  hint?: string
}

/** Mehr Zeilen liest im Chat niemand — der Rest wird nur noch gezählt. */
const DETAIL_LIMIT = 8

/** Für Struktur-Vorschläge (Kategoriebaum) etwas mehr: hier ist die Liste
    nicht Beleg für eine Zahl, sondern selbst der Inhalt der Entscheidung. */
const STRUCTURE_DETAIL_LIMIT = 20

function defineAction<S extends z.ZodType>(def: ActionDefinition<S>): ActionDefinition<S> {
  return def
}

const money = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value)

const eur = (value: number) => money(value)

/** Betrag oder Gedankenstrich — in der Aufschlüsselung ist eine leere Zelle
    nicht von „0 €" zu unterscheiden. */
const eurOr = (value: number | null | undefined) => (value == null ? '—' : eur(value))

/** ISO-Datum als de-DE. Unparsbare Eingaben werden durchgereicht statt zu
    „Invalid Date" zu werden — der Rohwert ist immer noch informativer. */
const day = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? iso
    : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed)
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  yearly: 'jährlich',
  weekly: 'wöchentlich',
  once: 'einmalig',
}

const PRIORITY_LABELS: Record<string, string> = { high: 'hoch', medium: 'mittel', low: 'niedrig' }

const GOAL_STATUS_LABELS: Record<string, string> = {
  active: 'aktiv',
  paused: 'pausiert',
  reached: 'erreicht',
  cancelled: 'abgebrochen',
}

const SEVERITY_LABELS: Record<string, string> = {
  info: 'Info',
  warning: 'Warnung',
  critical: 'Kritisch',
}

/**
 * `unified_transactions` führt zwei physische Tabellen zusammen (siehe
 * migration 20260821010000). Zum Schreiben muss die Quelle wieder aufgelöst
 * werden — `source` aus der View sagt, welche Tabelle die Zeile besitzt.
 */
const TRANSACTION_SOURCE = z.enum(['manual', 'bank_sync'])
type TransactionSource = z.infer<typeof TRANSACTION_SOURCE>

function transactionTable(source: TransactionSource) {
  return source === 'bank_sync' ? ('bank_transactions' as const) : ('transactions' as const)
}

async function categoryLabel(ctx: ActionContext, categoryId: string | null): Promise<string> {
  if (!categoryId) return 'Ohne Kategorie'
  const { data } = await ctx.supabase
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  return data?.name ?? 'Unbekannte Kategorie'
}

/** Wirft, wenn die Kategorie nicht existiert oder nicht dem Nutzer gehört —
    eine halluzinierte UUID soll nicht als stiller No-Op durchgehen. */
async function assertCategory(ctx: ActionContext, categoryId: string | null) {
  if (!categoryId) return
  const { data } = await ctx.supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!data) throw new Error(`Kategorie ${categoryId} existiert nicht`)
}


// ─────────────────────────────────────────────────────────────────────────────
// Kategorien
// ─────────────────────────────────────────────────────────────────────────────

/** Die drei Typen, die das Kategorie-Formular kennt (`categories.type` ist in
    der DB freier Text — hier bewusst eng, damit Athena keine vierte Variante
    erfindet, die im UI dann als unbekannter Typ landet). */
const CATEGORY_TYPE = z.enum(['expense', 'income', 'neutral'])

const CATEGORY_TYPE_LABELS: Record<string, string> = {
  expense: 'Ausgabe',
  income: 'Einnahme',
  neutral: 'Neutral',
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Ein Emoji, kein Wort — das Feld wird im UI als einzelnes Zeichen vor dem
    Namen gerendert. Zwei Codepoints, weil zusammengesetzte Emoji (Flaggen,
    Varianten wie 🏘️) länger als eins sind. */
const CATEGORY_ICON = z.string().min(1).max(8)

type CategoryLite = {
  id: string
  name: string
  type: string
  parent_id: string | null
  color: string | null
  icon: string | null
  budget_monthly: number | null
}

/**
 * Lädt ALLE Kategorien des Nutzers als Map. Jede Kategorie-Aktion braucht mehr
 * als die eine, die sie ändert — Elternteil, Kinder, Namensdubletten — und die
 * Menge ist klein (Dutzende), deshalb ein Rundgang statt N Einzelabfragen.
 */
async function loadCategoryMap(ctx: ActionContext): Promise<Map<string, CategoryLite>> {
  const { data } = await ctx.supabase
    .from('categories')
    .select('id, name, type, parent_id, color, icon, budget_monthly')
    .eq('user_id', ctx.userId)
  return new Map((data ?? []).map((row) => [row.id, row as CategoryLite]))
}

/** „Lebenserhaltung › Freizeit" — eine nackte UUID ist im Bestätigungsdialog
    wertlos, und der reine Name („Abo") sagt nicht, wo die Kategorie hängt. */
function categoryPath(map: Map<string, CategoryLite>, id: string): string {
  const row = map.get(id)
  if (!row) return id
  const parent = row.parent_id ? map.get(row.parent_id) : null
  return parent ? `${parent.name} › ${row.name}` : row.name
}

function childrenOf(map: Map<string, CategoryLite>, id: string): CategoryLite[] {
  return Array.from(map.values()).filter((c) => c.parent_id === id)
}

/** Was an einer Kategorie hängt. Entscheidend für Löschen/Zusammenführen:
    `categories.parent_id`, `transactions.category_id`, `bank_transactions.
    category_id` und `contracts.category_id` sind alle `on delete set null` —
    ein Löschen scheitert also nie, es entkategorisiert stillschweigend. Genau
    diese Zahl muss deshalb auf der Karte stehen. */
async function categoryLinkCounts(
  ctx: ActionContext,
  ids: string[],
): Promise<Map<string, { transactions: number; contracts: number }>> {
  const counts = new Map(ids.map((id) => [id, { transactions: 0, contracts: 0 }]))
  if (ids.length === 0) return counts

  const [manual, bank, contracts] = await Promise.all([
    ctx.supabase.from('transactions').select('category_id').eq('user_id', ctx.userId).in('category_id', ids),
    ctx.supabase.from('bank_transactions').select('category_id').eq('user_id', ctx.userId).in('category_id', ids),
    ctx.supabase.from('contracts').select('category_id').eq('user_id', ctx.userId).in('category_id', ids),
  ])

  for (const row of [...(manual.data ?? []), ...(bank.data ?? [])]) {
    const entry = row.category_id ? counts.get(row.category_id) : undefined
    if (entry) entry.transactions += 1
  }
  for (const row of contracts.data ?? []) {
    const entry = row.category_id ? counts.get(row.category_id) : undefined
    if (entry) entry.contracts += 1
  }
  return counts
}

/** Nächster freier `sort_order` auf der jeweiligen Ebene, damit neu angelegte
    Kategorien hinten einsortiert werden statt vor bestehende zu springen. */
async function nextSortOrder(ctx: ActionContext): Promise<number> {
  const { data } = await ctx.supabase
    .from('categories')
    .select('sort_order')
    .eq('user_id', ctx.userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.sort_order ?? 0) + 1
}

const bookingsLabel = (n: number) => `${n} Buchung${n === 1 ? '' : 'en'}`
const contractsLabel = (n: number) => `${n} ${n === 1 ? 'Vertrag' : 'Verträge'}`

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Name eines Inventarstuecks fuer die Bestaetigungskarte. Faellt auf die rohe ID zurueck,
 * statt zu werfen: die Karte ist die Darstellung des Vorschlags, nicht der Vorschlag selbst.
 */
async function valuableName(id: string, ctx: ActionContext): Promise<string> {
  const { data } = await ctx.supabase
    .from('valuables')
    .select('name, marke, modell')
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!data) return id
  const row = data as { name: string; marke: string | null; modell: string | null }
  const bezeichnung = [row.marke, row.modell].filter(Boolean).join(' ')
  return bezeichnung && bezeichnung !== row.name ? `${row.name} (${bezeichnung})` : row.name
}

export const WRITE_ACTIONS = {
  // ── Kategorisierung ────────────────────────────────────────────────────────
  categorizeTransactions: defineAction({
    label: 'Buchungen kategorisieren',
    description:
      'Ordnet einer oder mehreren Buchungen eine Kategorie zu. Nutze das, wenn unkategorisierte ' +
      'Buchungen aufgefallen sind. Die IDs und die `source` stammen aus getTransactions. ' +
      'Wird der Nutzerin/dem Nutzer als Vorschlag gezeigt und erst nach Bestätigung ausgeführt.',
    schema: z.object({
      categoryId: z.string().describe('Ziel-Kategorie, ID aus getCategories'),
      transactions: z
        .array(
          z.object({
            id: z.string(),
            source: TRANSACTION_SOURCE.describe('`source`-Feld der Buchung aus getTransactions'),
          }),
        )
        .min(1)
        .max(200),
    }),
    summarize: async ({ categoryId, transactions }, ctx) => {
      const label = await categoryLabel(ctx, categoryId)
      const n = transactions.length
      return `${n} Buchung${n === 1 ? '' : 'en'} der Kategorie „${label}" zuordnen`
    },
    // Ohne diese Liste steht auf der Karte nur eine Anzahl — man bestätigt
    // dann eine Zahl, nicht eine Zuordnung.
    details: async ({ transactions }, ctx) => {
      const shown = transactions.slice(0, DETAIL_LIMIT)
      const { data } = await ctx.supabase
        .from('unified_transactions')
        .select('id, date, description, merchant, signed_amount, category_name')
        .eq('user_id', ctx.userId)
        .in(
          'id',
          shown.map((t) => t.id),
        )
      const byId = new Map((data ?? []).flatMap((row) => (row.id ? [[row.id, row] as const] : [])))

      const rows: ActionDetail[] = shown.map((t) => {
        const row = byId.get(t.id)
        // Eine ID, die die View nicht kennt, ist ein echtes Problem — sie
        // stumm als leere Zeile zu zeigen, würde es verstecken.
        if (!row) return { label: 'Buchung nicht gefunden', hint: t.id }
        return {
          label: row.description || row.merchant || 'Ohne Buchungstext',
          value: eurOr(row.signed_amount),
          // Die Ziel-Kategorie steht schon in der Zusammenfassung; hier zählt,
          // was überschrieben wird.
          hint: `${day(row.date)} · bisher ${row.category_name ?? 'ohne Kategorie'}`,
        }
      })

      const rest = transactions.length - shown.length
      if (rest > 0) rows.push({ label: `… und ${rest} weitere` })
      return rows
    },
    execute: async ({ categoryId, transactions }, ctx) => {
      await assertCategory(ctx, categoryId)
      // Nach Quelltabelle gruppieren, damit zwei Updates statt N reichen.
      const byTable = new Map<'transactions' | 'bank_transactions', string[]>()
      for (const t of transactions) {
        const table = transactionTable(t.source)
        byTable.set(table, [...(byTable.get(table) ?? []), t.id])
      }
      let updated = 0
      for (const [table, ids] of byTable) {
        const { data, error } = await ctx.supabase
          .from(table)
          .update({ category_id: categoryId })
          .eq('user_id', ctx.userId)
          .in('id', ids)
          .select('id')
        if (error) throw new Error(error.message)
        updated += data?.length ?? 0
      }
      return { updated, requested: transactions.length }
    },
  }),

  // ── Kategorien ─────────────────────────────────────────────────────────────
  createCategories: defineAction({
    label: 'Kategorien anlegen',
    description:
      'Legt eine oder mehrere Kategorien an, jede optional gleich mit ihren Unterkategorien. ' +
      'Nutze das, wenn eine Kategorie fehlt — viele Buchungen ohne Kategorie, oder eine ' +
      'Sammelkategorie, die sich sinnvoll aufteilen lässt (getCategoryUsage zeigt beides). ' +
      'Die App kennt GENAU ZWEI Ebenen: Hauptkategorie und Unterkategorie; eine Unterkategorie ' +
      'kann selbst keine Unterkategorien haben. Schlage eine ganze Struktur in EINEM Aufruf vor, ' +
      'nicht eine Kategorie pro Vorschlag.',
    schema: z.object({
      categories: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            type: CATEGORY_TYPE,
            parentId: z
              .string()
              .nullish()
              .describe('ID einer bestehenden HAUPTkategorie. Leer = neue Hauptkategorie.'),
            color: z.string().regex(HEX_COLOR, 'Hex-Farbe wie #4f46e5').nullish(),
            icon: CATEGORY_ICON.nullish().describe('Ein Emoji, z. B. 🛒'),
            budgetMonthly: z.number().min(0).nullish().describe('Monatsbudget in €'),
            subcategories: z
              .array(
                z.object({
                  name: z.string().min(1).max(60),
                  type: CATEGORY_TYPE.optional().describe('Standard: Typ der Hauptkategorie'),
                  color: z.string().regex(HEX_COLOR, 'Hex-Farbe wie #4f46e5').nullish(),
                  icon: CATEGORY_ICON.nullish(),
                  budgetMonthly: z.number().min(0).nullish(),
                }),
              )
              .max(20)
              .default([])
              .describe('Nur zulässig, solange `parentId` leer ist — zwei Ebenen sind das Maximum.'),
          }),
        )
        .min(1)
        .max(20),
    }),
    validate: async ({ categories }, ctx) => {
      const map = await loadCategoryMap(ctx)
      // Namensdubletten fallen der DB nicht auf (kein Unique-Index), machen aber
      // jede spätere Kategorisierung zweideutig — „welche der beiden Freizeit?".
      const existing = new Set(
        Array.from(map.values()).map((c) => `${c.parent_id ?? ''}|${c.name.trim().toLowerCase()}`),
      )
      const problems: string[] = []
      const seen = new Set<string>()

      for (const c of categories) {
        if (c.parentId) {
          const parent = map.get(c.parentId)
          if (!parent) {
            problems.push(`Hauptkategorie ${c.parentId} existiert nicht`)
          } else if (parent.parent_id) {
            problems.push(
              `„${parent.name}" ist selbst eine Unterkategorie — „${c.name}" kann nicht darunter, ` +
                'die App kennt nur zwei Ebenen',
            )
          }
          if (c.subcategories.length > 0) {
            problems.push(
              `„${c.name}" soll unter eine Hauptkategorie UND eigene Unterkategorien haben — ` +
                'eine Unterkategorie kann keine weiteren Unterkategorien haben',
            )
          }
        }

        const key = `${c.parentId ?? ''}|${c.name.trim().toLowerCase()}`
        if (existing.has(key)) problems.push(`„${c.name}" gibt es auf dieser Ebene schon`)
        if (seen.has(key)) problems.push(`„${c.name}" kommt in diesem Vorschlag zweimal vor`)
        seen.add(key)

        const subSeen = new Set<string>()
        for (const sub of c.subcategories) {
          const subKey = sub.name.trim().toLowerCase()
          if (subSeen.has(subKey)) {
            problems.push(`Unterkategorie „${sub.name}" kommt unter „${c.name}" zweimal vor`)
          }
          subSeen.add(subKey)
        }
      }
      return problems.length > 0 ? problems.join('; ') : null
    },
    summarize: async ({ categories }, ctx) => {
      const subCount = categories.reduce((n, c) => n + c.subcategories.length, 0)
      const total = categories.length + subCount
      if (total === 1) {
        const only = categories[0]
        const map = only.parentId ? await loadCategoryMap(ctx) : null
        const under = map && only.parentId ? ` unter „${categoryPath(map, only.parentId)}"` : ''
        return `Kategorie „${only.name}"${under} anlegen`
      }
      return (
        `${total} Kategorien anlegen` +
        (subCount > 0 ? ` (${categories.length} Haupt-, ${subCount} Unterkategorien)` : '')
      )
    },
    // Bei einer Struktur IST die Struktur die Entscheidung — „7 Kategorien
    // anlegen" allein ist nichts, dem man zustimmen könnte.
    details: async ({ categories }, ctx) => {
      const map = categories.some((c) => c.parentId) ? await loadCategoryMap(ctx) : null
      const rows: ActionDetail[] = []

      const describe = (type: string, budget: number | null | undefined) => {
        const parts = [CATEGORY_TYPE_LABELS[type] ?? type]
        if (budget != null) parts.push(`Budget ${eur(budget)}/Monat`)
        return parts.join(' · ')
      }

      for (const c of categories) {
        rows.push({
          label: `${c.icon ? `${c.icon} ` : ''}${c.name}`,
          value: describe(c.type, c.budgetMonthly),
          hint: map && c.parentId ? `unter ${categoryPath(map, c.parentId)}` : 'neue Hauptkategorie',
        })
        for (const sub of c.subcategories) {
          rows.push({
            label: `↳ ${sub.icon ? `${sub.icon} ` : ''}${sub.name}`,
            value: describe(sub.type ?? c.type, sub.budgetMonthly),
            hint: `unter ${c.name}`,
          })
        }
      }

      if (rows.length <= STRUCTURE_DETAIL_LIMIT) return rows
      const shown = rows.slice(0, STRUCTURE_DETAIL_LIMIT)
      shown.push({ label: `… und ${rows.length - STRUCTURE_DETAIL_LIMIT} weitere` })
      return shown
    },
    execute: async ({ categories }, ctx) => {
      let sortOrder = await nextSortOrder(ctx)
      const created: string[] = []

      // Sequenziell, weil jede Unterkategorie die ID ihrer gerade angelegten
      // Hauptkategorie braucht. Bricht ein Insert ab, bleibt das bis dahin
      // Angelegte stehen — es ist unter /finance/categories sichtbar und dort
      // von Hand korrigierbar; ein Rollback über mehrere Statements hinweg gibt
      // es über PostgREST nicht.
      for (const c of categories) {
        const { data: parent, error } = await ctx.supabase
          .from('categories')
          .insert({
            user_id: ctx.userId,
            name: c.name.trim(),
            type: c.type,
            parent_id: c.parentId ?? null,
            color: c.color ?? null,
            icon: c.icon ?? null,
            budget_monthly: c.budgetMonthly ?? null,
            sort_order: sortOrder++,
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        created.push(parent.id)

        if (c.subcategories.length === 0) continue
        const { data: subs, error: subError } = await ctx.supabase
          .from('categories')
          .insert(
            c.subcategories.map((sub) => ({
              user_id: ctx.userId,
              name: sub.name.trim(),
              type: sub.type ?? c.type,
              parent_id: parent.id,
              color: sub.color ?? null,
              icon: sub.icon ?? null,
              budget_monthly: sub.budgetMonthly ?? null,
              sort_order: sortOrder++,
            })),
          )
          .select('id')
        if (subError) throw new Error(subError.message)
        created.push(...(subs ?? []).map((s) => s.id))
      }
      return { created: created.length, categoryIds: created }
    },
  }),

  updateCategory: defineAction({
    label: 'Kategorie bearbeiten',
    description:
      'Ändert eine bestehende Kategorie: Name, Typ, Zuordnung unter eine Hauptkategorie, Farbe, ' +
      'Emoji oder Monatsbudget. Die Buchungen bleiben zugeordnet — es ändert sich nur die ' +
      'Kategorie selbst. Zum Umhängen `parentId` auf eine Hauptkategorie setzen; `null` macht sie ' +
      'wieder zur Hauptkategorie. Nur die Felder mitschicken, die sich ändern sollen.',
    schema: z.object({
      categoryId: z.string(),
      name: z.string().min(1).max(60).optional(),
      type: CATEGORY_TYPE.optional(),
      parentId: z.string().nullish().describe('Hauptkategorie-ID, oder null für „keine"'),
      color: z.string().regex(HEX_COLOR, 'Hex-Farbe wie #4f46e5').nullish(),
      icon: CATEGORY_ICON.nullish(),
      budgetMonthly: z.number().min(0).nullish(),
    }),
    validate: async ({ categoryId, ...changes }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const row = map.get(categoryId)
      if (!row) return `Kategorie ${categoryId} existiert nicht`

      const problems: string[] = []
      const nextParentId = changes.parentId !== undefined ? (changes.parentId ?? null) : row.parent_id

      if (changes.parentId) {
        if (changes.parentId === categoryId) {
          problems.push(`„${row.name}" kann nicht ihre eigene Hauptkategorie sein`)
        } else {
          const parent = map.get(changes.parentId)
          if (!parent) {
            problems.push(`Hauptkategorie ${changes.parentId} existiert nicht`)
          } else if (parent.parent_id) {
            problems.push(
              `„${parent.name}" ist selbst eine Unterkategorie — die App kennt nur zwei Ebenen`,
            )
          }
        }
        const children = childrenOf(map, categoryId)
        if (children.length > 0) {
          problems.push(
            `„${row.name}" hat selbst ${children.length} Unterkategorie${
              children.length === 1 ? '' : 'n'
            } (${children.map((c) => c.name).join(', ')}) und kann deshalb nicht unter eine ` +
              'Hauptkategorie — häng zuerst die Unterkategorien um',
          )
        }
      }

      if (changes.name) {
        const clash = Array.from(map.values()).find(
          (c) =>
            c.id !== categoryId &&
            (c.parent_id ?? null) === nextParentId &&
            c.name.trim().toLowerCase() === changes.name!.trim().toLowerCase(),
        )
        if (clash) problems.push(`„${changes.name}" gibt es auf dieser Ebene schon`)
      }

      if (Object.values(changes).every((value) => value === undefined)) {
        problems.push('Es ist kein zu änderndes Feld angegeben')
      }
      return problems.length > 0 ? problems.join('; ') : null
    },
    summarize: async ({ categoryId, ...changes }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const parts: string[] = []
      if (changes.name !== undefined) parts.push(`Name → „${changes.name}"`)
      if (changes.type !== undefined)
        parts.push(`Typ → ${CATEGORY_TYPE_LABELS[changes.type] ?? changes.type}`)
      if (changes.parentId !== undefined) {
        parts.push(
          `Hauptkategorie → ${changes.parentId ? `„${categoryPath(map, changes.parentId)}"` : 'keine'}`,
        )
      }
      if (changes.budgetMonthly !== undefined) {
        parts.push(
          `Budget → ${changes.budgetMonthly != null ? `${eur(changes.budgetMonthly)}/Monat` : '—'}`,
        )
      }
      if (changes.icon !== undefined) parts.push('Emoji')
      if (changes.color !== undefined) parts.push('Farbe')
      return `Kategorie „${categoryPath(map, categoryId)}" ändern: ${parts.join(', ') || 'keine Änderung'}`
    },
    details: async ({ categoryId, ...changes }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const row = map.get(categoryId)
      const usage = (await categoryLinkCounts(ctx, [categoryId])).get(categoryId)

      const rows: ActionDetail[] = [
        {
          label: 'Kategorie',
          value: categoryPath(map, categoryId),
          hint: usage ? `${bookingsLabel(usage.transactions)} zugeordnet` : undefined,
        },
      ]
      const change = (label: string, before: string, after: string) =>
        rows.push({ label, value: `${before} → ${after}` })

      if (changes.name !== undefined) change('Name', row?.name ?? '—', changes.name)
      if (changes.type !== undefined) {
        change(
          'Typ',
          CATEGORY_TYPE_LABELS[row?.type ?? ''] ?? row?.type ?? '—',
          CATEGORY_TYPE_LABELS[changes.type] ?? changes.type,
        )
      }
      if (changes.parentId !== undefined) {
        change(
          'Hauptkategorie',
          row?.parent_id ? categoryPath(map, row.parent_id) : 'keine',
          changes.parentId ? categoryPath(map, changes.parentId) : 'keine',
        )
      }
      if (changes.budgetMonthly !== undefined) {
        change('Budget/Monat', eurOr(row?.budget_monthly), eurOr(changes.budgetMonthly))
      }
      if (changes.icon !== undefined) change('Emoji', row?.icon ?? '—', changes.icon ?? '—')
      if (changes.color !== undefined) change('Farbe', row?.color ?? '—', changes.color ?? '—')
      return rows
    },
    execute: async ({ categoryId, ...changes }, ctx) => {
      const patch: Record<string, unknown> = {}
      if (changes.name !== undefined) patch.name = changes.name.trim()
      if (changes.type !== undefined) patch.type = changes.type
      if (changes.parentId !== undefined) patch.parent_id = changes.parentId ?? null
      if (changes.color !== undefined) patch.color = changes.color ?? null
      if (changes.icon !== undefined) patch.icon = changes.icon ?? null
      if (changes.budgetMonthly !== undefined) patch.budget_monthly = changes.budgetMonthly ?? null
      if (Object.keys(patch).length === 0) throw new Error('Keine Änderung angegeben')

      const { data, error } = await ctx.supabase
        .from('categories')
        .update(patch)
        .eq('id', categoryId)
        .eq('user_id', ctx.userId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Kategorie nicht gefunden')
      return { categoryId: data.id, changed: Object.keys(patch) }
    },
  }),

  deleteCategories: defineAction({
    label: 'Kategorien löschen',
    description:
      'Löscht Kategorien endgültig. Buchungen und Verträge werden dabei NICHT gelöscht, verlieren ' +
      'aber ihre Kategorie und stehen danach unter „Ohne Kategorie". Nutze das nur für Kategorien, ' +
      'an denen praktisch nichts hängt (vorher getCategoryUsage prüfen) — hängen Buchungen daran, ' +
      'ist mergeCategories fast immer das Richtige, dort bleibt die Zuordnung erhalten. Eine ' +
      'Kategorie mit Unterkategorien lässt sich nur löschen, wenn diese im selben Aufruf stehen.',
    schema: z.object({
      categoryIds: z.array(z.string()).min(1).max(20),
    }),
    validate: async ({ categoryIds }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const ids = new Set(categoryIds)
      const problems: string[] = []

      for (const id of categoryIds) {
        const row = map.get(id)
        if (!row) {
          problems.push(`Kategorie ${id} existiert nicht`)
          continue
        }
        // `categories.parent_id` ist `on delete set null`: übrig gebliebene
        // Unterkategorien würden stillschweigend zu Hauptkategorien und lägen
        // danach neben ihrem früheren Elternteil in der Liste.
        const orphans = childrenOf(map, id).filter((c) => !ids.has(c.id))
        if (orphans.length > 0) {
          problems.push(
            `„${row.name}" hat noch die Unterkategorie${orphans.length === 1 ? '' : 'n'} ` +
              `${orphans.map((c) => `„${c.name}"`).join(', ')} — entweder mit löschen, vorher ` +
              'umhängen oder stattdessen zusammenführen',
          )
        }
      }
      return problems.length > 0 ? problems.join('; ') : null
    },
    summarize: async ({ categoryIds }, ctx) => {
      const map = await loadCategoryMap(ctx)
      if (categoryIds.length === 1) return `Kategorie „${categoryPath(map, categoryIds[0])}" löschen`
      return `${categoryIds.length} Kategorien löschen`
    },
    details: async ({ categoryIds }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const counts = await categoryLinkCounts(ctx, categoryIds)
      const shown = categoryIds.slice(0, DETAIL_LIMIT)

      const rows: ActionDetail[] = shown.map((id) => {
        const usage = counts.get(id)
        const hints: string[] = []
        if (usage?.transactions) {
          hints.push(`${bookingsLabel(usage.transactions)} verlieren die Kategorie`)
        }
        if (usage?.contracts) hints.push(`${contractsLabel(usage.contracts)} betroffen`)
        return {
          label: categoryPath(map, id),
          value: CATEGORY_TYPE_LABELS[map.get(id)?.type ?? ''] ?? map.get(id)?.type ?? '—',
          hint: hints.join(' · ') || 'nichts zugeordnet',
        }
      })

      const rest = categoryIds.length - shown.length
      if (rest > 0) rows.push({ label: `… und ${rest} weitere` })

      const affected = categoryIds.reduce((n, id) => n + (counts.get(id)?.transactions ?? 0), 0)
      if (affected > 0) {
        rows.push({
          label: 'Achtung',
          value: `${bookingsLabel(affected)} bleiben ohne Kategorie`,
          hint: 'Die Buchungen selbst bleiben erhalten. Soll die Zuordnung bleiben: zusammenführen statt löschen.',
        })
      }
      return rows
    },
    execute: async ({ categoryIds }, ctx) => {
      const { data, error } = await ctx.supabase
        .from('categories')
        .delete()
        .eq('user_id', ctx.userId)
        .in('id', categoryIds)
        .select('id')
      if (error) throw new Error(error.message)
      return { deleted: data?.length ?? 0, requested: categoryIds.length }
    },
  }),

  mergeCategories: defineAction({
    label: 'Kategorien zusammenführen',
    description:
      'Führt eine oder mehrere Kategorien in eine Ziel-Kategorie zusammen: alle Buchungen und ' +
      'Verträge der Quellen werden auf das Ziel umgehängt, ihre Unterkategorien wandern unter das ' +
      'Ziel, danach werden die Quellen gelöscht. Der Weg, um Dubletten und Fast-Dubletten ' +
      'aufzuräumen, ohne die Zuordnung von Buchungen zu verlieren.',
    schema: z.object({
      sourceCategoryIds: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe('Kategorien, die aufgelöst werden'),
      targetCategoryId: z.string().describe('Kategorie, die alles aufnimmt und bestehen bleibt'),
    }),
    validate: async ({ sourceCategoryIds, targetCategoryId }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const target = map.get(targetCategoryId)
      const problems: string[] = []
      if (!target) problems.push(`Ziel-Kategorie ${targetCategoryId} existiert nicht`)

      const seen = new Set<string>()
      for (const id of sourceCategoryIds) {
        if (id === targetCategoryId) {
          problems.push('Quelle und Ziel sind dieselbe Kategorie')
          continue
        }
        if (seen.has(id)) problems.push(`Kategorie ${id} steht zweimal in der Quellenliste`)
        seen.add(id)

        const row = map.get(id)
        if (!row) {
          problems.push(`Kategorie ${id} existiert nicht`)
          continue
        }
        const children = childrenOf(map, id).filter((c) => !sourceCategoryIds.includes(c.id))
        if (children.length > 0 && target?.parent_id) {
          problems.push(
            `„${row.name}" hat Unterkategorien; sie unter die Unterkategorie „${target.name}" zu ` +
              'hängen ergäbe eine dritte Ebene, die die App nicht kennt',
          )
        }
      }
      return problems.length > 0 ? problems.join('; ') : null
    },
    summarize: async ({ sourceCategoryIds, targetCategoryId }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const targetName = categoryPath(map, targetCategoryId)
      if (sourceCategoryIds.length === 1) {
        return `Kategorie „${categoryPath(map, sourceCategoryIds[0])}" in „${targetName}" zusammenführen`
      }
      return `${sourceCategoryIds.length} Kategorien in „${targetName}" zusammenführen`
    },
    details: async ({ sourceCategoryIds, targetCategoryId }, ctx) => {
      const map = await loadCategoryMap(ctx)
      const counts = await categoryLinkCounts(ctx, [...sourceCategoryIds, targetCategoryId])
      const target = map.get(targetCategoryId)

      const rows: ActionDetail[] = [
        {
          label: 'Ziel',
          value: categoryPath(map, targetCategoryId),
          hint: `${CATEGORY_TYPE_LABELS[target?.type ?? ''] ?? target?.type ?? '—'} · bisher ${bookingsLabel(
            counts.get(targetCategoryId)?.transactions ?? 0,
          )}`,
        },
      ]

      const shown = sourceCategoryIds.slice(0, DETAIL_LIMIT)
      for (const id of shown) {
        const row = map.get(id)
        const hints: string[] = []
        const children = childrenOf(map, id).filter((c) => !sourceCategoryIds.includes(c.id))
        if (children.length > 0) {
          hints.push(
            `${children.length} Unterkategorie${children.length === 1 ? '' : 'n'} wandern mit`,
          )
        }
        // Ein Typwechsel ist erlaubt, verschiebt die Beträge aber in jeder
        // Auswertung zwischen Einnahmen und Ausgaben — das gehört auf die Karte.
        if (row && target && row.type !== target.type) {
          hints.push(
            `Typwechsel ${CATEGORY_TYPE_LABELS[row.type] ?? row.type} → ${
              CATEGORY_TYPE_LABELS[target.type] ?? target.type
            }`,
          )
        }
        rows.push({
          label: categoryPath(map, id),
          value: `${bookingsLabel(counts.get(id)?.transactions ?? 0)} umhängen`,
          hint: hints.join(' · ') || undefined,
        })
      }

      const rest = sourceCategoryIds.length - shown.length
      if (rest > 0) rows.push({ label: `… und ${rest} weitere Quelle${rest === 1 ? '' : 'n'}` })
      return rows
    },
    execute: async ({ sourceCategoryIds, targetCategoryId }, ctx) => {
      const sources = sourceCategoryIds.filter((id) => id !== targetCategoryId)
      if (sources.length === 0) throw new Error('Keine Quell-Kategorie übrig')
      await assertCategory(ctx, targetCategoryId)

      let movedTransactions = 0
      for (const table of ['transactions', 'bank_transactions'] as const) {
        const { data, error } = await ctx.supabase
          .from(table)
          .update({ category_id: targetCategoryId })
          .eq('user_id', ctx.userId)
          .in('category_id', sources)
          .select('id')
        if (error) throw new Error(error.message)
        movedTransactions += data?.length ?? 0
      }

      const { data: movedContracts, error: contractError } = await ctx.supabase
        .from('contracts')
        .update({ category_id: targetCategoryId })
        .eq('user_id', ctx.userId)
        .in('category_id', sources)
        .select('id')
      if (contractError) throw new Error(contractError.message)

      // Unterkategorien umhängen, BEVOR gelöscht wird — sonst setzt
      // `on delete set null` ihr parent_id auf null und sie stehen danach als
      // eigenständige Hauptkategorien in der Liste.
      const map = await loadCategoryMap(ctx)
      const childIds = sources
        .flatMap((id) => childrenOf(map, id))
        .map((c) => c.id)
        .filter((id) => !sources.includes(id) && id !== targetCategoryId)
      let reparented = 0
      if (childIds.length > 0) {
        const { data, error } = await ctx.supabase
          .from('categories')
          .update({ parent_id: targetCategoryId })
          .eq('user_id', ctx.userId)
          .in('id', childIds)
          .select('id')
        if (error) throw new Error(error.message)
        reparented = data?.length ?? 0
      }

      const { data: deleted, error: deleteError } = await ctx.supabase
        .from('categories')
        .delete()
        .eq('user_id', ctx.userId)
        .in('id', sources)
        .select('id')
      if (deleteError) throw new Error(deleteError.message)

      return {
        movedTransactions,
        movedContracts: movedContracts?.length ?? 0,
        reparentedSubcategories: reparented,
        deleted: deleted?.length ?? 0,
      }
    },
  }),

  // ── Sparziele ──────────────────────────────────────────────────────────────
  createSavingsGoal: defineAction({
    label: 'Sparziel anlegen',
    description: 'Legt ein neues Sparziel an (Zielbetrag, optional Zieldatum und monatliche Rate).',
    schema: z.object({
      description: z.string().min(1).max(200),
      targetAmount: z.number().positive(),
      currentAmount: z.number().min(0).default(0),
      targetDate: z.string().nullish().describe('ISO-Datum YYYY-MM-DD'),
      monthlySavingsRate: z.number().min(0).nullish(),
      priority: z.enum(['high', 'medium', 'low']).default('medium'),
    }),
    summarize: async (input) =>
      `Sparziel „${input.description}" über ${eur(input.targetAmount)} anlegen` +
      (input.targetDate ? ` (Zieldatum ${input.targetDate})` : '') +
      (input.monthlySavingsRate ? `, ${eur(input.monthlySavingsRate)}/Monat` : ''),
    details: async (input) => [
      { label: 'Zielbetrag', value: eur(input.targetAmount) },
      { label: 'Startstand', value: eur(input.currentAmount) },
      { label: 'Zieldatum', value: day(input.targetDate) },
      { label: 'Monatliche Rate', value: eurOr(input.monthlySavingsRate) },
      { label: 'Priorität', value: PRIORITY_LABELS[input.priority] ?? input.priority },
    ],
    execute: async (input, ctx) => {
      const { data, error } = await ctx.supabase
        .from('savings_goals')
        .insert({
          user_id: ctx.userId,
          description: input.description,
          target_amount: input.targetAmount,
          current_amount: input.currentAmount,
          target_date: input.targetDate ?? null,
          monthly_savings_rate: input.monthlySavingsRate ?? null,
          priority: input.priority,
          status: 'active',
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return { goalId: data.id }
    },
  }),

  updateSavingsGoal: defineAction({
    label: 'Sparziel ändern',
    description: 'Ändert ein bestehendes Sparziel (Stand, Zielbetrag, Zieldatum, Rate oder Status).',
    schema: z.object({
      goalId: z.string(),
      currentAmount: z.number().min(0).optional(),
      targetAmount: z.number().positive().optional(),
      targetDate: z.string().nullish(),
      monthlySavingsRate: z.number().min(0).nullish(),
      status: z.enum(['active', 'paused', 'reached', 'cancelled']).optional(),
    }),
    summarize: async ({ goalId, ...changes }, ctx) => {
      const { data } = await ctx.supabase
        .from('savings_goals')
        .select('description')
        .eq('id', goalId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      const parts: string[] = []
      if (changes.currentAmount !== undefined) parts.push(`Stand → ${eur(changes.currentAmount)}`)
      if (changes.targetAmount !== undefined) parts.push(`Ziel → ${eur(changes.targetAmount)}`)
      if (changes.targetDate !== undefined) parts.push(`Zieldatum → ${changes.targetDate ?? '—'}`)
      if (changes.monthlySavingsRate !== undefined)
        parts.push(`Rate → ${changes.monthlySavingsRate ? eur(changes.monthlySavingsRate) : '—'}`)
      if (changes.status) parts.push(`Status → ${changes.status}`)
      return `Sparziel „${data?.description ?? goalId}" ändern: ${parts.join(', ') || 'keine Änderung'}`
    },
    // Jede Zeile zeigt „alt → neu": bei einer Änderung ist der Ausgangswert
    // die Hälfte der Information.
    details: async ({ goalId, ...changes }, ctx) => {
      const { data } = await ctx.supabase
        .from('savings_goals')
        .select('description, current_amount, target_amount, target_date, monthly_savings_rate, status')
        .eq('id', goalId)
        .eq('user_id', ctx.userId)
        .maybeSingle()

      const rows: ActionDetail[] = [{ label: 'Sparziel', value: data?.description ?? goalId }]
      const change = (label: string, before: string, after: string) =>
        rows.push({ label, value: `${before} → ${after}` })

      if (changes.currentAmount !== undefined)
        change('Stand', eurOr(data?.current_amount), eur(changes.currentAmount))
      if (changes.targetAmount !== undefined)
        change('Zielbetrag', eurOr(data?.target_amount), eur(changes.targetAmount))
      if (changes.targetDate !== undefined)
        change('Zieldatum', day(data?.target_date), day(changes.targetDate))
      if (changes.monthlySavingsRate !== undefined)
        change('Rate', eurOr(data?.monthly_savings_rate), eurOr(changes.monthlySavingsRate))
      if (changes.status)
        change(
          'Status',
          GOAL_STATUS_LABELS[data?.status ?? ''] ?? data?.status ?? '—',
          GOAL_STATUS_LABELS[changes.status] ?? changes.status,
        )
      return rows
    },
    execute: async ({ goalId, ...changes }, ctx) => {
      const patch: Record<string, unknown> = {}
      if (changes.currentAmount !== undefined) patch.current_amount = changes.currentAmount
      if (changes.targetAmount !== undefined) patch.target_amount = changes.targetAmount
      if (changes.targetDate !== undefined) patch.target_date = changes.targetDate ?? null
      if (changes.monthlySavingsRate !== undefined)
        patch.monthly_savings_rate = changes.monthlySavingsRate ?? null
      if (changes.status) patch.status = changes.status
      if (Object.keys(patch).length === 0) throw new Error('Keine Änderung angegeben')

      const { data, error } = await ctx.supabase
        .from('savings_goals')
        .update(patch)
        .eq('id', goalId)
        .eq('user_id', ctx.userId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Sparziel nicht gefunden')
      return { goalId: data.id, changed: Object.keys(patch) }
    },
  }),

  // ── Verträge ───────────────────────────────────────────────────────────────
  createContract: defineAction({
    label: 'Vertrag anlegen',
    description:
      'Legt einen wiederkehrenden Vertrag an (Abo, Versicherung, Miete). Nutze das, wenn in den ' +
      'Buchungen eine regelmäßige Zahlung auftaucht, für die noch kein Vertrag existiert.',
    schema: z.object({
      name: z.string().min(1).max(200),
      provider: z.string().max(200).nullish(),
      type: z.string().min(1).describe('z. B. subscription, insurance, rent, utility'),
      frequency: z.enum(['monthly', 'quarterly', 'yearly', 'weekly', 'once']),
      amount: z.number(),
      currency: z.string().length(3).default('EUR'),
      startDate: z.string().describe('ISO-Datum YYYY-MM-DD'),
      noticeDays: z.number().int().min(0).default(0),
      accountId: z.string().nullish(),
      categoryId: z.string().nullish(),
    }),
    summarize: async (input) =>
      `Vertrag „${input.name}"${input.provider ? ` (${input.provider})` : ''} anlegen: ` +
      `${money(input.amount, input.currency)} ${FREQUENCY_LABELS[input.frequency] ?? input.frequency}, ` +
      `ab ${day(input.startDate)}`,
    details: async (input, ctx) => {
      const rows: ActionDetail[] = [
        {
          label: 'Betrag',
          value: `${money(input.amount, input.currency)} ${FREQUENCY_LABELS[input.frequency] ?? input.frequency}`,
        },
        { label: 'Anbieter', value: input.provider ?? '—' },
        { label: 'Art', value: input.type },
        { label: 'Beginnt am', value: day(input.startDate) },
        {
          label: 'Kündigungsfrist',
          value: input.noticeDays ? `${input.noticeDays} Tage` : 'keine',
        },
      ]
      if (input.categoryId)
        rows.push({ label: 'Kategorie', value: await categoryLabel(ctx, input.categoryId) })
      return rows
    },
    execute: async (input, ctx) => {
      await assertCategory(ctx, input.categoryId ?? null)
      const { data, error } = await ctx.supabase
        .from('contracts')
        .insert({
          user_id: ctx.userId,
          name: input.name,
          provider: input.provider ?? null,
          type: input.type,
          frequency: input.frequency,
          amount: input.amount,
          currency: input.currency,
          start_date: input.startDate,
          notice_days: input.noticeDays,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          is_active: true,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return { contractId: data.id }
    },
  }),

  deactivateContract: defineAction({
    label: 'Vertrag deaktivieren',
    description: 'Setzt einen Vertrag auf inaktiv (z. B. nach einer Kündigung). Löscht ihn nicht.',
    schema: z.object({
      contractId: z.string(),
      endDate: z.string().nullish().describe('ISO-Datum, an dem der Vertrag endet'),
    }),
    summarize: async ({ contractId, endDate }, ctx) => {
      const { data } = await ctx.supabase
        .from('contracts')
        .select('name')
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      return `Vertrag „${data?.name ?? contractId}" deaktivieren${endDate ? ` zum ${day(endDate)}` : ''}`
    },
    details: async ({ contractId, endDate }, ctx) => {
      const { data } = await ctx.supabase
        .from('contracts')
        .select('name, provider, amount, currency, frequency')
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      return [
        { label: 'Vertrag', value: data?.name ?? contractId, hint: data?.provider ?? undefined },
        {
          label: 'Kosten bisher',
          value: data
            ? `${money(data.amount ?? 0, data.currency ?? 'EUR')} ${
                FREQUENCY_LABELS[data.frequency ?? ''] ?? data.frequency ?? ''
              }`.trim()
            : '—',
        },
        { label: 'Endet am', value: day(endDate) },
      ]
    },
    execute: async ({ contractId, endDate }, ctx) => {
      const { data, error } = await ctx.supabase
        .from('contracts')
        .update({ is_active: false, end_date: endDate ?? null })
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Vertrag nicht gefunden')
      return { contractId: data.id }
    },
  }),

  // ── Hinweise ───────────────────────────────────────────────────────────────
  createInsight: defineAction({
    label: 'Hinweis anlegen',
    description:
      'Legt einen dauerhaften Hinweis auf dem Dashboard an — für Beobachtungen, die über dieses ' +
      'Gespräch hinaus wichtig bleiben (auslaufende Frist, auffälliger Kostenanstieg). Nicht für ' +
      'Dinge nutzen, die schon in der Chat-Antwort stehen.',
    schema: z.object({
      type: z.string().min(1).max(50).describe('Kurzer Slug, z. B. contract_notice, spending_spike'),
      severity: z.enum(['info', 'warning', 'critical']).default('info'),
      title: z.string().min(1).max(200),
      body: z.string().max(2000).nullish(),
      payload: z.record(z.string(), z.unknown()).nullish(),
    }),
    summarize: async (input) =>
      `Hinweis „${input.title}" auf dem Dashboard anlegen (${SEVERITY_LABELS[input.severity] ?? input.severity})`,
    details: async (input) => {
      const rows: ActionDetail[] = [
        { label: 'Schweregrad', value: SEVERITY_LABELS[input.severity] ?? input.severity },
        { label: 'Typ', value: input.type },
      ]
      if (input.body) rows.push({ label: 'Text', value: input.body })
      return rows
    },
    execute: async (input, ctx) => {
      const { data, error } = await ctx.supabase
        .from('insights')
        .insert({
          user_id: ctx.userId,
          type: input.type,
          severity: input.severity,
          title: input.title,
          body: input.body ?? null,
          payload: (input.payload ?? null) as Json,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return { insightId: data.id }
    },
  }),

  // ── Inventar: Artwork ──────────────────────────────────────────────────────
  //
  // Die einzige Aktion, die Geld nach draußen ausgibt (ein Bildlauf bei OpenAI) und die
  // einzige, die 15–60 s braucht. Beides ist ein Grund mehr, sie wie jede andere Schreib-
  // aktion hinter die Bestätigung zu stellen statt sie sofort auszuführen.
  generateValuableArtwork: defineAction({
    label: 'Artwork erzeugen',
    description:
      'Zeichnet eine Illustration für einen Gegenstand aus dem Inventar und legt sie dort als ' +
      'zusätzliches Bild ab — vorhandene Fotos und älteres Artwork bleiben unangetastet, das ' +
      'neue Bild wird das angezeigte Hauptbild. Vorher getValuables aufrufen, um die id zu ' +
      'bekommen, und getValuableImages, um zu sehen, welche Vorlagen es gibt und mit welchem ' +
      'Prompt die letzte Runde lief. ' +
      'basisBildIds: bis zu vier Bilder DIESES Gegenstands als Vorlage. Fotos ⇒ das Ergebnis ' +
      'zeigt sein echtes Stück statt einer Katalogversion aus dem Modellgedächtnis; mehrere ' +
      'Fotos (Vorder-, Rückseite, Detail) ergeben ein Objekt, das rundum stimmt. Ein früheres ' +
      'Artwork als einzige Vorlage ⇒ Verfeinerungsrunde: das Bild bleibt, wie es war, und ' +
      'ändert sich nur dort, wo der hinweis es verlangt. Leer ⇒ frei nach der Beschreibung. ' +
      'hinweis: der eine Satz, der diese Runde von der letzten unterscheidet („dunklerer ' +
      'Hintergrund", „mehr Patina am Gehäuse", „Zifferblatt frontaler"). Deutsch oder ' +
      'Englisch, beides geht. ' +
      'Schlage IMMER nur eine Runde auf einmal vor und warte das Ergebnis ab, bevor du die ' +
      'nächste vorschlägst — jede kostet Geld, und ohne das fertige Bild weißt du nicht, was ' +
      'überhaupt noch zu ändern ist.',
    schema: z.object({
      valuableId: z.string().uuid(),
      basisBildIds: z.array(z.string().uuid()).max(MAX_VORLAGEN).default([]),
      hinweis: z.string().max(HINWEIS_MAX).nullish(),
      qualitaet: z
        .enum(['auto', 'high'])
        .default('auto')
        .describe('high kostet ein Vielfaches — nur wenn Eric ausdrücklich mehr Qualität will'),
    }),
    validate: async (input, ctx) => {
      if (!artworkVerfuegbar()) return OHNE_SCHLUESSEL

      const { data: item } = await ctx.supabase
        .from('valuables')
        .select('id')
        .eq('id', input.valuableId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      if (!item) return 'Gegenstand nicht gefunden'

      if (input.basisBildIds.length === 0) return null
      // Die Zugehörigkeit hier schon prüfen und nicht erst beim Ausführen: sonst steht die
      // Karte bei Eric und scheitert beim Klick an einer Bild-ID, die das Modell geraten hat.
      const { data: bilder } = await ctx.supabase
        .from('valuable_images')
        .select('id')
        .in('id', input.basisBildIds)
        .eq('valuable_id', input.valuableId)
        .eq('user_id', ctx.userId)
      const gefunden = new Set((bilder ?? []).map((b) => b.id))
      const fehlend = input.basisBildIds.filter((id) => !gefunden.has(id))
      if (fehlend.length > 0) {
        return `Diese Bilder gehören nicht zu dem Gegenstand: ${fehlend.join(', ')}`
      }
      return null
    },
    summarize: async (input, ctx) => {
      const name = await valuableName(input.valuableId, ctx)
      const woraus =
        input.basisBildIds.length === 0
          ? 'frei nach der Beschreibung'
          : `nach ${input.basisBildIds.length} ${input.basisBildIds.length === 1 ? 'Vorlage' : 'Vorlagen'}`
      return `Artwork für „${name}" zeichnen — ${woraus}`
    },
    details: async (input, ctx) => {
      const rows: ActionDetail[] = [
        { label: 'Gegenstand', value: await valuableName(input.valuableId, ctx) },
      ]

      if (input.basisBildIds.length === 0) {
        rows.push({
          label: 'Vorlage',
          value: 'keine',
          hint: 'wird allein aus Marke, Modell, Referenz, Zustand und Notizen gezeichnet',
        })
      } else {
        const { data } = await ctx.supabase
          .from('valuable_images')
          .select('id, art, created_at')
          .in('id', input.basisBildIds)
          .eq('user_id', ctx.userId)
        const bilder = (data ?? []) as { id: string; art: string; created_at: string }[]
        const fotos = bilder.filter((b) => b.art === 'foto').length
        const artworks = bilder.length - fotos
        rows.push({
          label: 'Vorlage',
          value: [fotos && `${fotos} Foto${fotos === 1 ? '' : 's'}`, artworks && `${artworks}× Artwork`]
            .filter(Boolean)
            .join(' + '),
          hint:
            artworks > 0 && fotos === 0
              ? 'Verfeinerungsrunde — das bestehende Bild bleibt, nur der Wunsch unten wird umgesetzt'
              : 'das Ergebnis zeigt dein Stück, nicht die Katalogversion',
        })
      }

      if (input.hinweis?.trim()) {
        rows.push({ label: 'Änderungswunsch', value: input.hinweis.trim() })
      }
      if (input.qualitaet === 'high') {
        rows.push({ label: 'Qualität', value: 'hoch', hint: 'kostet ein Vielfaches des Standards' })
      }

      rows.push({
        label: 'Kosten & Dauer',
        value: '1 Bildlauf',
        hint: 'geht an OpenAI und dauert meist 15–60 Sekunden',
      })
      return rows
    },
    execute: async (input, ctx) => {
      // Wirft ArtworkFehler; confirmPendingAction fängt das, setzt den Vorschlag auf
      // `failed` und zeigt die Meldung auf der Karte.
      const ergebnis = await erzeugeArtwork(ctx.supabase, ctx.userId, {
        valuableId: input.valuableId,
        basisBildIds: input.basisBildIds,
        hinweis: input.hinweis,
        qualitaet: input.qualitaet,
      })
      // `bildId` ist der Haken, an dem die Karte im Chat das fertige Bild nachlädt (siehe
      // PendingActionCard) — der Bucket ist privat, eine fertige URL wäre nach einer Stunde
      // tot und im gespeicherten Ergebnis für immer kaputt.
      //
      // Der volle Prompt bleibt hier bewusst draußen: er steht schon an der Bildzeile
      // (valuable_images.prompt), und diese Rückgabe landet in ai_pending_actions.result
      // UND im Log — zweimal 1.200 Zeichen für dieselbe Zeichenkette.
      return {
        bildId: ergebnis.bildId,
        valuableId: input.valuableId,
        basis: ergebnis.basis,
        vorlagen: ergebnis.vorlagen,
        hinweis: ergebnis.hinweis,
      }
    },
  }),
} satisfies Record<string, ActionDefinition<z.ZodType>>

export type WriteActionName = keyof typeof WRITE_ACTIONS

export function isWriteActionName(name: string): name is WriteActionName {
  return Object.hasOwn(WRITE_ACTIONS, name)
}

/**
 * Prüft einen Vorschlag gegen den aktuellen Datenstand, ohne etwas zu ändern.
 * Gibt `null` zurück, wenn die Aktion ausführbar ist, sonst den Grund im
 * Klartext.
 *
 * Zwei Aufrufer, aus zwei Gründen: das Vorschlags-Werkzeug in tools.ts, damit
 * das Modell eine unmögliche Aktion sofort als Werkzeugfehler zurückbekommt und
 * korrigieren kann statt Eric eine Karte hinzulegen, die beim Klick scheitert —
 * und `runWriteAction`, weil zwischen Vorschlag und Klick beliebig viel Zeit
 * liegt und die Kategorie, auf die sich der Vorschlag bezieht, inzwischen
 * gelöscht sein kann.
 */
export async function validateWriteAction(
  name: WriteActionName,
  input: unknown,
  ctx: ActionContext,
): Promise<string | null> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  if (!action.validate) return null
  const parsed = action.schema.safeParse(input)
  if (!parsed.success) {
    return `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join(', ')}`
  }
  return action.validate(parsed.data, ctx)
}

/**
 * Führt eine bestätigte Aktion aus. Validiert den in der DB gelagerten Input
 * erneut gegen das Schema — zwischen Vorschlag und Bestätigung liegt eine
 * jsonb-Runde, und `execute` soll sich auf nichts verlassen, was seit dem
 * Vorschlag nicht mehr geprüft wurde.
 */
export async function runWriteAction(
  name: WriteActionName,
  rawInput: unknown,
  ctx: ActionContext,
): Promise<Record<string, unknown>> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  const parsed = action.schema.safeParse(rawInput)
  if (!parsed.success) {
    throw new Error(`Ungültige Eingabe für ${name}: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
  }
  const problem = await action.validate?.(parsed.data, ctx)
  if (problem) throw new Error(problem)
  return action.execute(parsed.data, ctx)
}

/**
 * Baut die Karte, die der Nutzer vor der Bestätigung sieht: den Klartext-Satz
 * und die Aufschlüsselung darunter.
 *
 * Beides ist bewusst fehlertolerant. Eine Zusammenfassung, die an einer
 * fehlenden Zeile scheitert, dürfte den Vorschlag nicht mit sich reißen — der
 * Vorschlag ist die Arbeit, die Beschriftung nur ihre Darstellung.
 */
export async function describeWriteAction(
  name: WriteActionName,
  input: unknown,
  ctx: ActionContext,
): Promise<{ label: string; summary: string; details: ActionDetail[] }> {
  const action = WRITE_ACTIONS[name] as ActionDefinition<z.ZodType>
  const parsed = action.schema.safeParse(input)
  if (!parsed.success) return { label: action.label, summary: `${name} ausführen`, details: [] }

  const [summary, details] = await Promise.all([
    action.summarize(parsed.data, ctx).catch(() => `${name} ausführen`),
    action.details?.(parsed.data, ctx).catch(() => [] as ActionDetail[]) ?? [],
  ])
  return { label: action.label, summary, details }
}
