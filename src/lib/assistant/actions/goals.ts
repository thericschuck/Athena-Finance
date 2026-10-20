import { z } from 'zod'
import { type ActionDetail, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'
import { eur, eurOr, day, PRIORITY_LABELS, GOAL_STATUS_LABELS } from '@/lib/assistant/actions/format'

export const goalActions = {
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
} satisfies Record<string, ActionDefinition<z.ZodType>>
