import { tool } from 'ai'
import { z } from 'zod'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'
import { scopeOwner } from '@/lib/assistant/tools/scope'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildPlanningTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Verträge ─────────────────────────────────────────────────────────────
    getContracts: tool({
      description: 'Listet wiederkehrende Verträge (Miete, Versicherung, Abos, …) mit Frequenz, Betrag und Kündigungsfrist.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(ROW_CAP).default(100),
      }),
      execute: async ({ activeOnly, limit }) => {
        let query = scopeOwner(
          supabase
            .from('contracts')
            .select('id, name, provider, type, frequency, amount, currency, start_date, end_date, notice_days, auto_renews, is_active'),
          ctx,
        )
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
        let query = scopeOwner(
          supabase
            .from('debts')
            .select('id, name, type, creditor, original_amount, outstanding, interest_rate, monthly_payment, due_date, is_active'),
          ctx,
        )
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
        const { data, error } = await scopeOwner(
          supabase
            .from('savings_goals')
            .select('id, description, target_amount, current_amount, target_date, monthly_savings_rate, priority, status'),
          ctx,
        ).order('priority')
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
          scopeOwner(supabase.from('budget_categories').select('id, name, monthly_budget'), ctx).order('sort_order'),
          scopeOwner(supabase.from('budget_items').select('id, category_id, name, unit_price, quantity, interval_days'), ctx),
          // income_targets bleibt owner-only (persönliche Steuer-/Spar-Vorgaben).
          supabase.from('income_targets').select('id, label, buffer_pct, tax_pct, savings_pct').eq('user_id', ctx.userId),
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

  }
}
