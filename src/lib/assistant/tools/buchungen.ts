import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hatPartner, type ScopeContext } from '@/lib/haushalt/scope'
import { getFlowTransactionsFuerNutzer, type FlowScope, type FlowTransaction } from '@/lib/data/flows'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'

/**
 * Einnahmen/Ausgaben fuer die Athena-Werkzeuge. Regressionsgarantie wie in scope.ts: ohne Partner exakt die alte Abfrage
 * (`user_id = userId`, owner-only, auch im Service-Role-Review-Lauf); mit Partner der Scope (Konten im Scope, Herabstufung).
 */
export function ladeBuchungenImScope(
  supabase: SupabaseClient<Database>, ctx: ScopeContext, scope: FlowScope = {},
): Promise<FlowTransaction[]> {
  return hatPartner(ctx)
    ? getFlowTransactionsScope(supabase, ctx, scope)
    : getFlowTransactionsFuerNutzer(supabase, ctx.userId, scope)
}
