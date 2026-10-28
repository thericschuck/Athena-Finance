import type { ScopeArg } from '@/lib/data/scope-arg'

/**
 * Schalter fuer die Spalte `shared` in der View `valuables_current` (Migration 20261102100000_valuables_current_shared).
 *
 * Env `VALUABLES_SHARED_LIVE='true'` erst setzen, NACHDEM die Migration live angewendet ist. Ohne den Schalter (Default)
 * bleibt der alte Umweg aktiv (Stueck-IDs aus `valuables` ueber applyOwnerScope, dann View per id) und der Code bricht
 * vor der Migration nicht (die View kennt `shared` dann nicht, ein Filter oder Select darauf gaebe 42703).
 *
 * ENTFAELLT: nach dem Live-Gang der Migration und gesetztem Schalter in Vercel (Production + Preview). Dann Schalter,
 * Umweg (scopedValuableIds-Zweig in inventar.ts/overview.ts) und diese Datei entfernen, `sharedColumn: true` fest setzen.
 */
export function valuablesSharedLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.VALUABLES_SHARED_LIVE === 'true'
}

/** true = die View kann direkt ueber `shared` gefiltert werden (Legacy-String-Pfad filtert immer direkt nach user_id). */
export function valuablesViewDirekt(who: ScopeArg, live: boolean = valuablesSharedLive()): boolean {
  return typeof who === 'string' || live
}

/** Spaltenliste der View; `shared` nur, wenn die View sie liefert (sonst 42703). */
export function valuablesSpalten(basis: string, live: boolean = valuablesSharedLive()): string {
  return live ? `${basis}, shared` : basis
}
