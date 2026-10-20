import { z } from 'zod'
import { type ActionDetail, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'
import { DETAIL_LIMIT, eurOr, day } from '@/lib/assistant/actions/format'
import { TRANSACTION_SOURCE, transactionTable, categoryLabel, assertCategory } from '@/lib/assistant/actions/shared'

export const transactionActions = {
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
} satisfies Record<string, ActionDefinition<z.ZodType>>
