import { z } from 'zod'
import { type ActionDetail, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'
import { money, day, FREQUENCY_LABELS } from '@/lib/assistant/actions/format'
import { categoryLabel, assertCategory } from '@/lib/assistant/actions/shared'

export const contractActions = {
  // ── Verträge ───────────────────────────────────────────────────────────────
  createContract: defineAction({
    label: 'Vertrag anlegen',
    description:
      'Legt einen wiederkehrenden Vertrag an (Abo, Versicherung, Miete). Nutze das, wenn in den ' +
      'Buchungen eine regelmäßige Zahlung auftaucht, für die noch kein Vertrag existiert.',
    schema: z.object({
      name: z.string().min(1).max(200),
      provider: z.string().max(200).nullish(),
      type: z.string().min(1).describe('z. B. subscription, insurance, rent, utility'),
      frequency: z.enum(['monthly', 'quarterly', 'yearly', 'weekly']),
      amount: z.number(),
      currency: z.string().length(3).default('EUR'),
      startDate: z.string().describe('ISO-Datum YYYY-MM-DD'),
      noticeDays: z.number().int().min(0).default(0),
      accountId: z.string().nullish(),
      categoryId: z.string().nullish(),
    }),
    summarize: async (input) =>
      `Vertrag „${input.name}"${input.provider ? ` (${input.provider})` : ''} anlegen: ` +
      `${money(input.amount, input.currency)} ${FREQUENCY_LABELS[input.frequency] ?? input.frequency}, ` +
      `ab ${day(input.startDate)}`,
    details: async (input, ctx) => {
      const rows: ActionDetail[] = [
        {
          label: 'Betrag',
          value: `${money(input.amount, input.currency)} ${FREQUENCY_LABELS[input.frequency] ?? input.frequency}`,
        },
        { label: 'Anbieter', value: input.provider ?? '—' },
        { label: 'Art', value: input.type },
        { label: 'Beginnt am', value: day(input.startDate) },
        {
          label: 'Kündigungsfrist',
          value: input.noticeDays ? `${input.noticeDays} Tage` : 'keine',
        },
      ]
      if (input.categoryId)
        rows.push({ label: 'Kategorie', value: await categoryLabel(ctx, input.categoryId) })
      return rows
    },
    execute: async (input, ctx) => {
      await assertCategory(ctx, input.categoryId ?? null)
      const { data, error } = await ctx.supabase
        .from('contracts')
        .insert({
          user_id: ctx.userId,
          name: input.name,
          provider: input.provider ?? null,
          type: input.type,
          frequency: input.frequency,
          amount: input.amount,
          currency: input.currency,
          start_date: input.startDate,
          notice_days: input.noticeDays,
          account_id: input.accountId ?? null,
          category_id: input.categoryId ?? null,
          is_active: true,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      return { contractId: data.id }
    },
  }),

  deactivateContract: defineAction({
    label: 'Vertrag deaktivieren',
    description: 'Setzt einen Vertrag auf inaktiv (z. B. nach einer Kündigung). Löscht ihn nicht.',
    schema: z.object({
      contractId: z.string(),
      endDate: z.string().nullish().describe('ISO-Datum, an dem der Vertrag endet'),
    }),
    summarize: async ({ contractId, endDate }, ctx) => {
      const { data } = await ctx.supabase
        .from('contracts')
        .select('name')
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      return `Vertrag „${data?.name ?? contractId}" deaktivieren${endDate ? ` zum ${day(endDate)}` : ''}`
    },
    details: async ({ contractId, endDate }, ctx) => {
      const { data } = await ctx.supabase
        .from('contracts')
        .select('name, provider, amount, currency, frequency')
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      return [
        { label: 'Vertrag', value: data?.name ?? contractId, hint: data?.provider ?? undefined },
        {
          label: 'Kosten bisher',
          value: data
            ? `${money(data.amount ?? 0, data.currency ?? 'EUR')} ${
                FREQUENCY_LABELS[data.frequency ?? ''] ?? data.frequency ?? ''
              }`.trim()
            : '—',
        },
        { label: 'Endet am', value: day(endDate) },
      ]
    },
    execute: async ({ contractId, endDate }, ctx) => {
      const { data, error } = await ctx.supabase
        .from('contracts')
        .update({ is_active: false, end_date: endDate ?? null })
        .eq('id', contractId)
        .eq('user_id', ctx.userId)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Vertrag nicht gefunden')
      return { contractId: data.id }
    },
  }),
} satisfies Record<string, ActionDefinition<z.ZodType>>
