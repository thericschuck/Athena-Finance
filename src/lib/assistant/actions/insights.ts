import { z } from 'zod'
import type { Json } from '@/types/database'
import { type ActionDetail, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'
import { SEVERITY_LABELS } from '@/lib/assistant/actions/format'

export const insightActions = {
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
} satisfies Record<string, ActionDefinition<z.ZodType>>
