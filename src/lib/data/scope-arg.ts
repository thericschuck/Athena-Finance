import type { ScopeContext } from '@/lib/haushalt/scope'

/**
 * Uebergangs-Parameter fuer Datenfunktionen, die auch ausserhalb von Paket A (Analyse, Dashboard, Assistant, Cron) aufgerufen
 * werden: `ScopeContext` = scope-faehig, `string` (userId) = altes Verhalten (`user_id = userId`, owner-only).
 * Sobald alle Aufrufer auf `ScopeContext` umgestellt sind, kann der String-Zweig entfallen.
 */
export type ScopeArg = ScopeContext | string

export function istScopeContext(w: ScopeArg): w is ScopeContext {
  return typeof w !== 'string'
}

export function userIdVon(w: ScopeArg): string {
  return typeof w === 'string' ? w : w.userId
}
