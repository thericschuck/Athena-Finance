import { z } from 'zod'
import type { ActionContext } from '@/lib/assistant/actions/types'

/**
 * `unified_transactions` führt zwei physische Tabellen zusammen (siehe
 * migration 20260821010000). Zum Schreiben muss die Quelle wieder aufgelöst
 * werden — `source` aus der View sagt, welche Tabelle die Zeile besitzt.
 */
export const TRANSACTION_SOURCE = z.enum(['manual', 'bank_sync'])
export type TransactionSource = z.infer<typeof TRANSACTION_SOURCE>

export function transactionTable(source: TransactionSource) {
  return source === 'bank_sync' ? ('bank_transactions' as const) : ('transactions' as const)
}

export async function categoryLabel(ctx: ActionContext, categoryId: string | null): Promise<string> {
  if (!categoryId) return 'Ohne Kategorie'
  const { data } = await ctx.supabase
    .from('categories')
    .select('name')
    .eq('id', categoryId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  return data?.name ?? 'Unbekannte Kategorie'
}

/** Wirft, wenn die Kategorie nicht existiert oder nicht dem Nutzer gehört —
    eine halluzinierte UUID soll nicht als stiller No-Op durchgehen. */
export async function assertCategory(ctx: ActionContext, categoryId: string | null) {
  if (!categoryId) return
  const { data } = await ctx.supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!data) throw new Error(`Kategorie ${categoryId} existiert nicht`)
}

