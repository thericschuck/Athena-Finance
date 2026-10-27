import { applyOwnerScope, type ScopeFilterable } from '@/lib/haushalt/scope'
import type { ScopeArg } from '@/lib/data/scope-arg'

/**
 * Scope-Filter fuer Haushaltstabellen (Paket C: Depot/Krypto/Inventar).
 *  - ScopeContext: eigene ODER geteilte Zeilen (ich/partner), alle Peers (gemeinsam).
 *  - string (userId): strikt nur Zeilen dieses Nutzers, exakt das bisherige `.eq('user_id', userId)`.
 */
export function scopeUserId(who: ScopeArg): string {
  return typeof who === 'string' ? who : who.userId
}

export function scopedOwner<Q extends ScopeFilterable<Q>>(
  query: Q,
  who: ScopeArg,
  opts: { sharedColumn: boolean } = { sharedColumn: true },
): Q {
  if (typeof who === 'string') {
    return applyOwnerScope(query, { ownerIds: [who], includeShared: false }, { sharedColumn: false })
  }
  return applyOwnerScope(query, who, opts)
}
