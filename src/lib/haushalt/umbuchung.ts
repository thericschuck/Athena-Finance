/**
 * Gemeinsame Quelle der IBAN-basierten Umbuchungsregel (vorher mehrfach kopiert in bank/auswertung,
 * bank/buchungen, bank/feste-kosten).
 *
 * Eine Buchung ist im aktuellen Scope eine neutrale Umbuchung, wenn ihre Gegen-IBAN ein Konto IM SCOPE ist
 * (`ctx.ibans`). Ein Haushaltskonto ausserhalb des Scopes (z. B. privat Malik aus Sicht von 'ich') zaehlt
 * dagegen als normale Ausgabe/Einnahme (siehe `umbuchungsArt` in scope.ts).
 *
 * Reines Modul ohne Alias-Imports (laeuft auch unter `node --test`). Nicht zu verwechseln mit
 * `istUmbuchung(type)` in vertraege/rechnen.ts: das klassifiziert Vertragsarten (Sparraten), nicht Buchungen.
 */
import { normIban } from './scope.ts'

/** Normalisierte Menge der Scope-IBANs (Eingabe fuer `istUmbuchungIban`). */
export function ibanSet(ibans: readonly string[]): Set<string> {
  return new Set(ibans.map(normIban))
}

/** `true`, wenn die Gegen-IBAN zu einem Konto in der Menge gehoert (Menge bereits normalisiert, z. B. via `ibanSet`). */
export function istUmbuchungIban(counterpartIban: string | null | undefined, eigene: ReadonlySet<string>): boolean {
  return !!counterpartIban && eigene.has(normIban(counterpartIban))
}

// ---------------------------------------------------------------------------------------------------------------------
// Herabstufung haushaltsweiter Umbuchungen (unified_transactions / monthly_umbuchungen)
// ---------------------------------------------------------------------------------------------------------------------

/** Minimale Form einer Zeile aus unified_transactions bzw. monthly_umbuchungen. */
export type UmbuchungsZeile = {
  flow_kind: string | null
  account_id: string | null
  counterpart_account_id: string | null
  flow_kind_extern: string | null
}

/**
 * Verbindliche Regel: `flow_kind = 'umbuchung'` ist die HAUSHALTSWEITE Klassifikation. Eine solche Zeile ist im Scope
 * eine ECHTE Buchung (mit `flow_kind_extern`), wenn ihr Konto im Scope liegt und das Gegenkonto fehlt oder nicht im Scope liegt.
 * `accountIds` = `ctx.accountIds` (fuer alle Scopes die richtige Menge).
 */
export function wirdHerabgestuft(z: UmbuchungsZeile, accountIds: ReadonlySet<string> | readonly string[]): boolean {
  if (z.flow_kind !== 'umbuchung' || !z.account_id) return false
  const set = accountIds instanceof Set ? accountIds : new Set(accountIds as readonly string[])
  if (!set.has(z.account_id)) return false
  return !z.counterpart_account_id || !set.has(z.counterpart_account_id)
}

/** Effektive Art im Scope: herabgestufte Umbuchung -> `flow_kind_extern`, sonst unveraendert (`umbuchung` bleibt neutral). */
export function effektiverFlowKind(z: UmbuchungsZeile, accountIds: ReadonlySet<string> | readonly string[]): string | null {
  return wirdHerabgestuft(z, accountIds) ? z.flow_kind_extern : z.flow_kind
}
