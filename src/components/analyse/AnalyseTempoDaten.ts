import { cache } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'
import { monatPlus } from '@/lib/analyse/vergleich'
import { hochrechnung, tempoReihe, MAX_VORMONATE } from '@/lib/analyse/tempo'
import type { Hochrechnung, TempoReihe } from '@/lib/analyse/tempo'
import type { AnalyseDaten } from '@/lib/analyse/typen'

/**
 * Tempo und Hochrechnung brauchen die Einzelbuchungen der letzten Monate. `daten.txns` reicht
 * dafuer NICHT: es deckt nur den gewaehlten Zeitraum ab (bei 1W oder 1M fehlen die Vormonate).
 * Deshalb holt sich dieser Lader selbst Buchungen ab dem Beginn des siebten Monats davor, mit
 * denselben Konten und demselben Schalter Anlage/Forderung wie die Seite.
 *
 * `cache()` (React) teilt das Ergebnis innerhalb einer Anfrage: Kennzahlen (Hochrechnung) und
 * Tempo-Chart rufen beide auf, gefragt wird die Datenbank nur einmal. Der Schluessel ist die
 * Identitaet des `daten`-Objekts, das die Seite an alle Abschnitte gibt.
 *
 * Gibt nur aufbereitete Reihen zurueck (~31 Punkte), keine Buchungen: so bleibt, was an den
 * Browser geht, klein.
 */

export interface TempoDaten {
  ausgaben: TempoReihe | null
  einnahmen: TempoReihe | null
  hochrechnungAusgaben: Hochrechnung
  hochrechnungEinnahmen: Hochrechnung
}

export const ladeTempoDaten = cache(async (daten: AnalyseDaten): Promise<TempoDaten | null> => {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  // Hoechstens MAX_VORMONATE abgeschlossene Monate plus der laufende.
  const von = monatPlus(daten.heute, -MAX_VORMONATE)
  const buchungen = await getFlowTransactionsScope(supabase, daten.scopeCtx, {
    from: von,
    accountIds: daten.kontoIds.length > 0 ? daten.kontoIds : undefined,
    include: daten.include,
  })

  const opt = { fruehesterMonat: daten.fruehesterMonat }
  return {
    ausgaben: tempoReihe(buchungen, daten.heute, 'ausgaben', opt),
    einnahmen: tempoReihe(buchungen, daten.heute, 'einnahmen', opt),
    hochrechnungAusgaben: hochrechnung(buchungen, daten.heute, 'ausgaben', opt),
    hochrechnungEinnahmen: hochrechnung(buchungen, daten.heute, 'einnahmen', opt),
  }
})
