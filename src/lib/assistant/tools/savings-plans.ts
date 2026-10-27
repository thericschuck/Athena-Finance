import { tool } from 'ai'
import { z } from 'zod'
import { untrust, type DB } from '@/lib/assistant/tools/shared'
import { scopeOwner } from '@/lib/assistant/tools/scope'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildSavingsPlanTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Fonds-Sparpläne ──────────────────────────────────────────────────────
    getSavingsPlans: tool({
      description:
        'Die Fonds-Sparpläne (`savings_plans`): ISIN, Fondsname, monatlicher Betrag und Ausführungstag. ' +
        'Diese laufen per Cron und tauchen deshalb in keiner Vertragsliste auf — wer nach den monatlichen ' +
        'Verpflichtungen fragt, braucht sie zusätzlich zu getObligationCalendar.',
      inputSchema: z.object({
        activeOnly: z.boolean().default(true),
      }),
      execute: async ({ activeOnly }) => {
        let query = scopeOwner(
          supabase
            .from('savings_plans')
            .select('id, isin, fund_name, monthly_amount, execution_day, start_date, is_active'),
          ctx,
        )
          .order('monthly_amount', { ascending: false })
        if (activeOnly) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) return { error: error.message }
        const summe = (data ?? [])
          .filter(p => p.is_active)
          .reduce((s, p) => s + Number(p.monthly_amount ?? 0), 0)
        return {
          plans: (data ?? []).map(row => untrust(row, ['fund_name'])),
          summe_monatlich: Math.round(summe * 100) / 100,
        }
      },
    }),

  }
}
