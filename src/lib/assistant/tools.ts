import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type DB = SupabaseClient<Database>

/**
 * Harte Obergrenze für zeilenbasierte Tools — unabhängig davon, was das
 * Modell anfragt (siehe Plan, "Zeilenbasierte Tools vs. Aggregat-Tools").
 * Kein Tool liest je mehr als das, egal welches `limit` im Input steht.
 */
const ROW_CAP = 200

/**
 * Markiert Freitextfelder aus Nutzer-/Bank-/Fremdquellen als ausdrücklich
 * NICHT vertrauenswürdig, bevor sie ins Tool-Ergebnis (und damit in den
 * Modell-Kontext) wandern — siehe Plan, "Prompt-Injection — konkrete
 * Gegenmaßnahmen". `merchant`/`description`/`notes`/... können Text
 * enthalten, den eine Bank oder der Nutzer selbst eingetragen hat; das
 * Feld heißt danach `untrusted_<name>` statt z. B. nur `description`,
 * damit der System-Prompt darauf verweisen kann, ohne dass das Modell den
 * Unterschied zwischen "Anweisung" und "Daten" selbst erraten muss.
 */
function untrust<T extends Record<string, unknown>>(row: T, fields: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const field of fields) {
    const key = String(field)
    if (key in out) {
      out[`untrusted_${key}`] = out[key]
      delete out[key]
    }
  }
  return out
}

/**
 * Baut den vollständigen Lese-Werkzeuggürtel für EINEN authentifizierten
 * Nutzer. Jedes Tool schließt über `supabase`/`userId` aus dem umgebenden
 * Request — das Zod-Input-Schema jedes Tools enthält deshalb bewusst KEIN
 * `userId`/`accountId`-Feld, das Modell kann fremde Daten also nicht einmal
 * versuchen anzufragen, weil das Schema es strukturell nicht zulässt (siehe
 * Plan, Werkzeuggürtel-Abschnitt). Pro Request neu aufgebaut, kein
 * modulweiter/geteilter Zustand zwischen Nutzern.
 */
export function buildAssistantTools(supabase: DB, userId: string) {
  return {
    // ── Konten ─────────────────────────────────────────────────────────────
    getAccounts: tool({
      description:
        'Listet alle Konten des Nutzers (Giro, Tagesgeld, Cash, …) mit Typ, Währung und Institut. ' +
        'Enthält keine Salden — für aktuelle Salden siehe getNetWorthTrend.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, type, currency, institution, is_active')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) return { error: error.message }
        return { accounts: data ?? [] }
      },
    }),

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
        let query = supabase
          .from('transactions')
          .select('id, date, amount, currency, type, merchant, description, category_id, account_id', {
            count: 'exact',
          })
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
          .from('transactions')
          .select('amount, type, date, category_id, categories(name)')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate)
          .neq('type', 'transfer')
        if (error) return { error: error.message }

        const groups = new Map<string, { label: string; income: number; expense: number }>()
        for (const row of data ?? []) {
          const key =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : (row.category_id ?? 'uncategorized')
          const label =
            groupBy === 'month'
              ? row.date.slice(0, 7)
              : ((row.categories as { name?: string } | null)?.name ?? 'Ohne Kategorie')
          const entry = groups.get(key) ?? { label, income: 0, expense: 0 }
          if (row.type === 'income') entry.income += row.amount
          else entry.expense += row.amount
          groups.set(key, entry)
        }

        return {
          groupBy,
          groups: Array.from(groups.values()).sort((a, b) => b.expense - a.expense),
        }
      },
    }),

    // ── Verträge ─────────────────────────────────────────────────────────────
    getContracts: tool({
      description: 'Listet wiederkehrende Verträge (Miete, Versicherung, Abos, …) mit Frequenz, Betrag und Kündigungsfrist.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(ROW_CAP).default(100),
      }),
      execute: async ({ activeOnly, limit }) => {
        let query = supabase
          .from('contracts')
          .select('id, name, provider, type, frequency, amount, currency, start_date, end_date, notice_days, auto_renews, is_active')
          .eq('user_id', userId)
          .order('name')
          .limit(Math.min(limit, ROW_CAP))
        if (activeOnly) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) return { error: error.message }
        return { contracts: (data ?? []).map((row) => untrust(row, ['provider'])) }
      },
    }),

    // ── Schulden ──────────────────────────────────────────────────────────────
    getDebts: tool({
      description: 'Listet Schulden/Kredite (geliehen oder verliehen) mit ausstehendem Betrag, Zinssatz und monatlicher Rate.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
      }),
      execute: async ({ activeOnly }) => {
        let query = supabase
          .from('debts')
          .select('id, name, type, creditor, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active')
          .eq('user_id', userId)
          .order('outstanding', { ascending: false })
        if (activeOnly) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) return { error: error.message }
        return { debts: (data ?? []).map((row) => untrust(row, ['creditor'])) }
      },
    }),

    // ── Sparziele ─────────────────────────────────────────────────────────────
    getGoals: tool({
      description: 'Listet Sparziele mit Zielbetrag, aktuellem Stand, Zieldatum und monatlicher Sparrate.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('savings_goals')
          .select('id, description, target_amount, current_amount, target_date, monthly_savings_rate, priority, status')
          .eq('user_id', userId)
          .order('priority')
        if (error) return { error: error.message }
        return { goals: (data ?? []).map((row) => untrust(row, ['description'])) }
      },
    }),

    // ── Fixkosten/Budget ──────────────────────────────────────────────────────
    getBudget: tool({
      description:
        'Liefert das Fixkosten-Budget: Budget-Kategorien mit monatlichem Rahmen, die einzelnen Budget-Posten ' +
        'darin, und die Einkommens-Zielvorgaben (Puffer/Steuer/Sparanteil) für die Mindestgehalt-Berechnung.',
      inputSchema: z.object({}),
      execute: async () => {
        const [categories, items, targets] = await Promise.all([
          supabase.from('budget_categories').select('id, name, monthly_budget').eq('user_id', userId).order('sort_order'),
          supabase.from('budget_items').select('id, category_id, name, unit_price, quantity, interval_days').eq('user_id', userId),
          supabase.from('income_targets').select('id, label, buffer_pct, tax_pct, savings_pct').eq('user_id', userId),
        ])
        if (categories.error) return { error: categories.error.message }
        if (items.error) return { error: items.error.message }
        if (targets.error) return { error: targets.error.message }
        return {
          categories: categories.data ?? [],
          items: (items.data ?? []).map((row) => untrust(row, ['name'])),
          incomeTargets: targets.data ?? [],
        }
      },
    }),

    // ── Depot ─────────────────────────────────────────────────────────────────
    getDepotHoldings: tool({
      description: 'Aktueller Depot-Bestand (per FinTS synchronisiert): Wertpapiere, Stückzahl, Kurswert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('depot_holdings')
          .select('isin, name, pieces, market_value, total_value, acquisition_price, currency, valuation_date')
          .eq('user_id', userId)
          .order('total_value', { ascending: false })
        if (error) return { error: error.message }
        return { holdings: (data ?? []).map((row) => untrust(row, ['name'])) }
      },
    }),

    // ── Crypto ────────────────────────────────────────────────────────────────
    getCryptoPortfolio: tool({
      description: 'Aktuelles Crypto-/Asset-Portfolio mit Menge, Einstandspreis und letztem bekannten Marktwert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: assets, error: assetsError } = await supabase
          .from('assets')
          .select('id, name, symbol, type, quantity, avg_buy_price, currency, portfolio_name')
          .eq('user_id', userId)
        if (assetsError) return { error: assetsError.message }
        if (!assets || assets.length === 0) return { assets: [] }

        const assetIds = assets.map((a) => a.id)
        const { data: valuations, error: valuationsError } = await supabase
          .from('asset_valuations')
          .select('asset_id, price_per_unit, total_value, valuation_date')
          .in('asset_id', assetIds)
          .order('valuation_date', { ascending: false })
        if (valuationsError) return { error: valuationsError.message }

        // Nur die jeweils neueste Bewertung pro Asset — valuations ist schon
        // nach valuation_date absteigend sortiert, der erste Treffer pro
        // asset_id gewinnt.
        const latestByAsset = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
        for (const v of valuations ?? []) {
          if (!latestByAsset.has(v.asset_id)) latestByAsset.set(v.asset_id, v)
        }

        return {
          assets: assets.map((a) => ({
            ...a,
            latestValuation: latestByAsset.get(a.id) ?? null,
          })),
        }
      },
    }),

    // ── Vermögensverlauf (Aggregat, monatsweise verdichtet) ──────────────────
    getNetWorthTrend: tool({
      description:
        'Vermögensverlauf der letzten N Monate (Netto-Vermögen und Aufschlüsselung nach Konto/Depot/Crypto/Schulden), ' +
        'ein Wert pro Monat statt täglicher Rohdaten — geeignet für Trendfragen.',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(6),
      }),
      execute: async ({ months }) => {
        const since = new Date()
        since.setMonth(since.getMonth() - months)
        const sinceIso = since.toISOString().slice(0, 10)

        const { data, error } = await supabase
          .from('net_worth_snapshots')
          .select(
            'snapshot_date, net_worth, total_checking, total_savings, total_cash, total_depot, total_crypto, total_debts',
          )
          .eq('user_id', userId)
          .gte('snapshot_date', sinceIso)
          .order('snapshot_date', { ascending: true })
        if (error) return { error: error.message }

        // Ein Snapshot pro Monat statt jedem Tag — der letzte verfügbare
        // innerhalb des Monats gewinnt (überschreibt beim Durchlaufen in
        // aufsteigender Datumsreihenfolge).
        const byMonth = new Map<string, (typeof data)[number]>()
        for (const row of data ?? []) {
          byMonth.set(row.snapshot_date.slice(0, 7), row)
        }

        return { months: Array.from(byMonth.values()) }
      },
    }),
  }
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>
