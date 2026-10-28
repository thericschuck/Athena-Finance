import { applyOwnerScope, type ScopeContext, type ScopeFilterable } from '@/lib/haushalt/scope'

/**
 * Scope-Filter fuer Haushaltstabellen (Depot/Krypto/Inventar): eigene ODER geteilte Zeilen (ich/partner), alle Peers (gemeinsam).
 * Fuer OWNER-ONLY-Daten gibt es keinen Helfer: dort bleibt es `.eq('user_id', userId)` (siehe docs/haushalt-scope-api.md).
 */
export function scopeUserId(ctx: ScopeContext): string {
  return ctx.userId
}

export function scopedOwner<Q extends ScopeFilterable<Q>>(
  query: Q,
  ctx: ScopeContext,
  opts: { sharedColumn: boolean } = { sharedColumn: true },
): Q {
  return applyOwnerScope(query, ctx, opts)
}
