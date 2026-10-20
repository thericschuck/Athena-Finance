import { z } from 'zod'
import { defineAction, type ActionContext, type ActionDefinition, type ActionDetail } from '@/lib/assistant/actions/types'
import { DETAIL_LIMIT, STRUCTURE_DETAIL_LIMIT, eur, eurOr } from '@/lib/assistant/actions/format'
import { assertCategory } from '@/lib/assistant/actions/shared'

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

export const categoryActions = {
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
} satisfies Record<string, ActionDefinition<z.ZodType>>
