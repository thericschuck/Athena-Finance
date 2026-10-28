import { tool } from 'ai'
import { z } from 'zod'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'
import { scopeKonten } from '@/lib/assistant/tools/scope'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { HERAB_SPALTEN, effektiveBuchungen, herabstufungsIds, wendeHerabFilterAn } from '@/lib/haushalt/umbuchung'
import { ladeBuchungenImScope } from '@/lib/assistant/tools/buchungen'

export function buildTransactionTools(supabase: DB, ctx: ScopeContext) {
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
        // Haushalt: Typ-Filter und Zeilen nach effektiver Art (Umbuchung ohne Gegenkonto im Scope = Einnahme/Ausgabe), lib/haushalt/umbuchung.ts.
        const herab = herabstufungsIds(ctx)
        const spalten = 'id, date, amount, signed_amount, currency, type, flow_kind, merchant, description, category_id, category_name, account_id, source'
        let query = scopeKonten(supabase
          .from('unified_transactions')
          // `source` MUSS mit: categorizeTransactions braucht es, um beim
          // Schreiben die richtige Quelltabelle (transactions vs.
          // bank_transactions) zu treffen — die View führt beide zusammen.
          .select(herab ? `${spalten}, ${HERAB_SPALTEN}` : spalten, { count: 'exact' }), ctx)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false })
          .range(offset, offset + cappedLimit - 1)
        if (categoryId) query = query.eq('category_id', categoryId)
        if (accountId) query = query.eq('account_id', accountId)
        if (type) query = herab ? wendeHerabFilterAn(query, herab, { type }) : query.eq('type', type)

        const { data, error, count } = await query
        if (error) return { error: error.message }

        const zeilen = herab
          ? effektiveBuchungen((data ?? []) as unknown as (Parameters<typeof effektiveBuchungen>[0][number] & Record<string, unknown>)[], herab)
              // Interne Hilfsspalten der Herabstufung gehoeren nicht in die Antwort des Assistenten.
              .map((zeile) => {
                const rest: Record<string, unknown> = { ...zeile }
                for (const k of ['counterpart_account_id', 'flow_kind_extern', 'type_db']) delete rest[k]
                return rest
              })
          : (data ?? [])
        const items = zeilen.map((row) => untrust(row as typeof row & Record<string, unknown>, ['merchant', 'description']))
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
        // Alles, was als Einnahme/Ausgabe zählt (counts_in_flow: echt, anlage, forderung).
        // Umbuchungen zwischen eigenen Konten und Anfangsbestände fehlen — siehe
        // unified_transactions. `income`/`expense` sind die Konsum-Sicht (nur echt); Anlage und
        // Forderungen stehen getrennt daneben, damit eine Krypto-Einzahlung nicht als "Ausgaben"
        // erzählt wird, obwohl das Vermögen gleich geblieben ist.
        let data
        try {
          // Seitenweise geladen: eine einzelne Abfrage lieferte still nur die ersten 1.000 Zeilen.
          data = await ladeBuchungenImScope(supabase, ctx, { from: startDate, to: endDate })
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Abfrage fehlgeschlagen' }
        }

        type Side = { income: number; expense: number }
        type Entry = { label: string; income: number; expense: number; anlage: Side; forderung: Side }
        const blank = (): Side => ({ income: 0, expense: 0 })
        const groups = new Map<string, Entry>()
        for (const row of data) {
          // Nach Hauptkategorie gruppiert (Lebenserhaltung statt Lebensmittel, Freizeit, …).
          const key =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.root_category_id ?? row.category_id ?? 'uncategorized')
          const label =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.root_category_name ?? row.category_name ?? 'Ohne Kategorie')
          const entry = groups.get(key) ?? { label, income: 0, expense: 0, anlage: blank(), forderung: blank() }
          const side: 'income' | 'expense' = row.type === 'income' ? 'income' : 'expense'
          if (row.flow_kind === 'anlage') entry.anlage[side] += row.amount
          else if (row.flow_kind === 'forderung') entry.forderung[side] += row.amount
          else entry[side] += row.amount
          groups.set(key, entry)
        }

        const round = (n: number) => Math.round(n * 100) / 100
        const list = Array.from(groups.values())
          .map(g => ({
            label: g.label,
            income: round(g.income), expense: round(g.expense),
            anlage: { income: round(g.anlage.income), expense: round(g.anlage.expense) },
            forderung: { income: round(g.forderung.income), expense: round(g.forderung.expense) },
          }))
          .sort((a, b) => b.expense - a.expense)
        return {
          groupBy,
          hinweis: 'income/expense = Konsum (ohne Anlage und Forderungen). Anlage und Forderung stehen getrennt.',
          groups: list,
        }
      },
    }),
  }
}
