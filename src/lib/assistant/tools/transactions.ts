import { tool } from 'ai'
import { z } from 'zod'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'

export function buildTransactionTools(supabase: DB, userId: string) {
  return {
    // ── Transaktionen (Detail, paginiert) ────────────────────────────────────
    getTransactions: tool({
      description:
        'Liest einzelne Buchungen in einem Zeitraum, optional gefiltert nach Kategorie/Konto/Typ. ' +
        'Für Fragen über längere Zeiträume ("wie hat sich mein Sparverhalten über 6 Monate entwickelt") ' +
        'ZUERST getSpendingSummary versuchen — das liefert kompakte Summen statt vieler Einzelzeilen. ' +
        'Dieses Tool ist für gezielte Detailsuche ("zeig mir die Buchung von Amazon letzte Woche").',
      inputSchema: z.object({
        startDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        endDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        categoryId: z.string().optional(),
        accountId: z.string().optional(),
        type: z.enum(['income', 'expense', 'transfer']).optional(),
        limit: z.number().int().min(1).max(ROW_CAP).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ startDate, endDate, categoryId, accountId, type, limit, offset }) => {
        const cappedLimit = Math.min(limit, ROW_CAP)
        // unified_transactions (see migration 20260821010000) merges in FinTS-synced bank
        // transactions for linked accounts, so the assistant sees the same picture as Finance.
        let query = supabase
          .from('unified_transactions')
          // `source` MUSS mit: categorizeTransactions braucht es, um beim
          // Schreiben die richtige Quelltabelle (transactions vs.
          // bank_transactions) zu treffen — die View führt beide zusammen.
          .select(
            'id, date, amount, signed_amount, currency, type, flow_kind, merchant, description, category_id, category_name, account_id, source',
            { count: 'exact' },
          )
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .range(offset, offset + cappedLimit - 1)
        if (categoryId) query = query.eq('category_id', categoryId)
        if (accountId) query = query.eq('account_id', accountId)
        if (type) query = query.eq('type', type)

        const { data, error, count } = await query
        if (error) return { error: error.message }

        const items = (data ?? []).map((row) => untrust(row, ['merchant', 'description']))
        const total = count ?? items.length
        const hasMore = offset + items.length < total
        return {
          items,
          totalCount: total,
          hasMore,
          nextOffset: hasMore ? offset + cappedLimit : null,
          truncated: limit > ROW_CAP,
        }
      },
    }),

    // ── Ausgaben-Zusammenfassung (Aggregat) ──────────────────────────────────
    getSpendingSummary: tool({
      description:
        'Summiert Einnahmen/Ausgaben über einen Zeitraum, gruppiert nach Kategorie oder Monat — ' +
        'kompaktes Ergebnis unabhängig von der Zeitraumlänge. Der bevorzugte Weg für Planungsfragen ' +
        '("kann ich mir X leisten", "wie viel gebe ich normalerweise für Y aus").',
      inputSchema: z.object({
        startDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        endDate: z.string().describe('ISO-Datum (YYYY-MM-DD), inklusive'),
        groupBy: z.enum(['category', 'month']).default('category'),
      }),
      execute: async ({ startDate, endDate, groupBy }) => {
        const { data, error } = await supabase
          .from('unified_transactions')
          .select('amount, amount_base, type, date, category_id, category_name')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          // Nur echte Einnahmen/Ausgaben. `neq('type','transfer')` reichte nicht:
          // Krypto-Kaeufe, Bauspar-Einzahlungen und Schuldenrueckzahlungen zaehlten
          // als Konsum mit — siehe unified_transactions.flow_kind.
          .eq('flow_kind', 'echt')
        if (error) return { error: error.message }

        const groups = new Map<string, { label: string; income: number; expense: number }>()
        for (const row of data ?? []) {
          if (row.date == null || row.amount == null || row.type == null) continue
          const key =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.category_id ?? 'uncategorized')
          const label =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.category_name ?? 'Ohne Kategorie')
          const entry = groups.get(key) ?? { label, income: 0, expense: 0 }
          const betrag = row.amount_base ?? row.amount
          if (row.type === 'income') entry.income += betrag
          else entry.expense += betrag
          groups.set(key, entry)
        }

        return {
          groupBy,
          groups: Array.from(groups.values()).sort((a, b) => b.expense - a.expense),
        }
      },
    }),
  }
}
