import { tool } from 'ai'
import { z } from 'zod'
import { type DB } from '@/lib/assistant/tools/shared'

export function buildCategoryTools(supabase: DB, userId: string) {
  return {
    // ── Kategorien ────────────────────────────────────────────────────────────
    getCategories: tool({
      description:
        'Listet alle Kategorien mit ID, Name, Typ (expense/income/neutral), Hierarchie ' +
        '(`parentId`/`path`), Monatsbudget, Farbe und Emoji. Die IDs brauchst du, um ' +
        'getTransactions/getSpendingSummary zu filtern und um categorizeTransactions, ' +
        'updateCategory, deleteCategories oder mergeCategories vorzuschlagen. ' +
        'Wie stark eine Kategorie tatsächlich genutzt wird, steht hier NICHT — dafür getCategoryUsage.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name, type, parent_id, budget_monthly, color, icon')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) return { error: error.message }
        const byId = new Map((data ?? []).map((c) => [c.id, c]))
        return {
          // Die App kennt genau zwei Ebenen — das steht hier mit im Ergebnis,
          // damit das Modell es nicht aus der Datenlage erraten muss.
          maxDepth: 2,
          categories: (data ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parent_id,
            path: c.parent_id ? `${byId.get(c.parent_id)?.name ?? '?'} › ${c.name}` : c.name,
            budgetMonthly: c.budget_monthly,
            color: c.color,
            icon: c.icon,
          })),
        }
      },
    }),

    // ── Kategorie-Nutzung (Aggregat) ─────────────────────────────────────────
    getCategoryUsage: tool({
      description:
        'Nutzung pro Kategorie über die letzten N Monate: Anzahl Buchungen, Summe, letzte ' +
        'Verwendung, Anzahl Unterkategorien und verknüpfter Verträge — plus wie viele Buchungen ' +
        'ganz ohne Kategorie sind und welche Buchungstexte dahinter am häufigsten vorkommen. ' +
        'Das ist die Grundlage, um die Kategorien zu PFLEGEN: ungenutzte Kategorien erkennen, ' +
        'Sammelkategorien mit sehr vielen Buchungen in Unterkategorien aufteilen, Dubletten ' +
        'finden, Lücken schließen. Vor jedem Vorschlag zu deleteCategories oder mergeCategories ' +
        'zuerst hier nachsehen.',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(12),
      }),
      execute: async ({ months }) => {
        const since = new Date()
        since.setMonth(since.getMonth() - months)
        const sinceIso = since.toISOString().slice(0, 10)

        const [categories, transactions, contracts] = await Promise.all([
          supabase
            .from('categories')
            .select('id, name, type, parent_id, budget_monthly')
            .eq('user_id', userId)
            .order('sort_order'),
          supabase
            .from('unified_transactions')
            .select('category_id, type, amount, date, description, merchant')
            .eq('user_id', userId)
            .gte('date', sinceIso),
          supabase
            .from('contracts')
            .select('category_id')
            .eq('user_id', userId)
            .eq('is_active', true),
        ])
        if (categories.error) return { error: categories.error.message }
        if (transactions.error) return { error: transactions.error.message }
        if (contracts.error) return { error: contracts.error.message }

        type Bucket = { count: number; income: number; expense: number; lastUsed: string | null }
        const empty = (): Bucket => ({ count: 0, income: 0, expense: 0, lastUsed: null })
        const buckets = new Map<string, Bucket>()
        // Buchungstexte der unkategorisierten Buchungen, damit der Vorschlag für
        // eine fehlende Kategorie auf echten Zahlungsempfängern beruht und nicht
        // auf einer Vermutung.
        const uncategorizedMerchants = new Map<string, number>()

        for (const row of transactions.data ?? []) {
          const key = row.category_id ?? '__none__'
          const bucket = buckets.get(key) ?? empty()
          bucket.count += 1
          if (row.type === 'income') bucket.income += row.amount ?? 0
          else if (row.type === 'expense') bucket.expense += row.amount ?? 0
          if (row.date && (bucket.lastUsed == null || row.date > bucket.lastUsed)) {
            bucket.lastUsed = row.date
          }
          buckets.set(key, bucket)

          if (!row.category_id) {
            const label = (row.merchant || row.description || '').trim().slice(0, 60)
            if (label) uncategorizedMerchants.set(label, (uncategorizedMerchants.get(label) ?? 0) + 1)
          }
        }

        const contractCounts = new Map<string, number>()
        for (const row of contracts.data ?? []) {
          if (row.category_id) {
            contractCounts.set(row.category_id, (contractCounts.get(row.category_id) ?? 0) + 1)
          }
        }

        const rows = categories.data ?? []
        const byId = new Map(rows.map((c) => [c.id, c]))
        const childCounts = new Map<string, number>()
        for (const c of rows) {
          if (c.parent_id) childCounts.set(c.parent_id, (childCounts.get(c.parent_id) ?? 0) + 1)
        }

        const usage = rows
          .map((c) => {
            const bucket = buckets.get(c.id) ?? empty()
            return {
              id: c.id,
              name: c.name,
              path: c.parent_id ? `${byId.get(c.parent_id)?.name ?? '?'} › ${c.name}` : c.name,
              type: c.type,
              isSubcategory: c.parent_id != null,
              subcategoryCount: childCounts.get(c.id) ?? 0,
              transactionCount: bucket.count,
              incomeTotal: Math.round(bucket.income * 100) / 100,
              expenseTotal: Math.round(bucket.expense * 100) / 100,
              lastUsed: bucket.lastUsed,
              contractCount: contractCounts.get(c.id) ?? 0,
              budgetMonthly: c.budget_monthly,
            }
          })
          .sort((a, b) => b.transactionCount - a.transactionCount)

        const none = buckets.get('__none__') ?? empty()
        return {
          windowMonths: months,
          since: sinceIso,
          categories: usage,
          uncategorized: {
            transactionCount: none.count,
            expenseTotal: Math.round(none.expense * 100) / 100,
            incomeTotal: Math.round(none.income * 100) / 100,
            // Freitext aus Bank/Nutzer — als Daten behandeln, nie als Anweisung.
            untrusted_topMerchants: Array.from(uncategorizedMerchants.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([label, count]) => ({ label, count })),
          },
        }
      },
    }),

  }
}
