import { baueTage } from './historie.ts'
import { erkenneEinmalposten, type EinmalBuchung, type EinmalKandidat, type Ueberschreibung } from './einmalig.ts'
import { historieReicht, lernStart, type ScopeKurz } from './scope-regeln.ts'
import type { TagesSumme } from './zyklus.ts'

/**
 * Aus den Buchungen eines Scopes die Eingaben fürs Zyklusmodell: Lernbeginn, Einmalposten/Einlagen, Tagessummen.
 * Reine Funktion (laden.ts ruft sie mit den geladenen Buchungen auf, die Tests mit Fixtures).
 * Scope 'ich': keine Begrenzung des Lernbeginns, identisch zum bisherigen Ablauf.
 */

export type ScopeBuchung = EinmalBuchung & { account_id: string | null }

export type ScopeHistorie = {
  /** Erster Tag, ab dem gelernt wird (null: gesamte Historie). */
  start: string | null
  zuWenigHistorie: boolean
  tage: TagesSumme[]
  kandidaten: EinmalKandidat[]
  ausgeschlossen: Set<string>
}

export function baueScopeHistorie(
  scope: ScopeKurz, buchungenRoh: ScopeBuchung[], liquideKontoIds: readonly string[], ue: Ueberschreibung, heute: string,
): ScopeHistorie {
  const ersteJeKonto = new Map<string, string>()
  for (const b of buchungenRoh) {
    if (!b.account_id) continue
    const d = b.date.slice(0, 10)
    const k = ersteJeKonto.get(b.account_id)
    if (!k || d < k) ersteJeKonto.set(b.account_id, d)
  }
  const start = lernStart(scope, ersteJeKonto, liquideKontoIds)
  const imScope = start ? buchungenRoh.filter(b => b.date.slice(0, 10) >= start) : buchungenRoh
  // Die Einlagen-Regel (herabgestufte Haushalts-Umbuchungen) gilt nur für Partner/Gemeinsam; 'ich' bleibt exakt wie bisher.
  const buchungen = scope === 'ich' ? imScope.map(b => (b.herabgestuft ? { ...b, herabgestuft: undefined } : b)) : imScope
  const einmal = erkenneEinmalposten(buchungen, ue, heute)
  const tage = baueTage(buchungen, einmal.ausgeschlossen)
  return {
    start, zuWenigHistorie: !historieReicht(start, heute), tage,
    kandidaten: einmal.kandidaten, ausgeschlossen: einmal.ausgeschlossen,
  }
}
