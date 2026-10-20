/** Reine Fehler-Helfer des FinTS-Sidecars (nur Typ-Import, zur Laufzeit importfrei, testbar). */
import type { BankClientStateMap } from './sidecar'

/**
 * True if this error is the sidecar refusing to wait for an app approval (--no-sca).
 * Callers use it to surface "bitte einmal manuell synchronisieren" instead of a bank error.
 */
export function isScaRequiredError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'sca_required'
}

/** The client state a failed sidecar run still managed to produce, if any. */
export function stateFromError(err: unknown): BankClientStateMap | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  return (err as { state?: BankClientStateMap }).state
}
