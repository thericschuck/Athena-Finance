import { getAuthUser } from '@/lib/supabase/server'
import { getFlowTransactionsScope } from '@/lib/data/flows-scope'
import { INCLUDE_ALL } from '@/lib/finance/flow-calc'
import { buildCashflow } from '@/lib/analyse/aufbereiten'
import type { AnalyseAbschnittProps } from '@/lib/analyse/typen'
import { CashflowKalenderUrl } from './CashflowKalenderUrl'

/**
 * Cashflow-Kalender mit eigener Abfrage: er braucht die GESAMTE Historie bis Ende des nächsten
 * Monats (man kann beliebig weit zurückblättern), und das ist die größte Abfrage der Seite. Als
 * eigene Server-Komponente hinter einer Suspense-Grenze (siehe page.tsx) blockiert sie den Rest
 * der Seite nicht.
 *
 * Unabhängig vom Zeitraum und vom Schalter: Anlagen und Forderungen kommen mit, sind aber grau
 * markiert, wenn der Schalter sie ausblendet (`buildCashflow`).
 */
export async function AnalyseKalender({ daten }: AnalyseAbschnittProps) {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const [j, m] = daten.heute.split('-').map(Number)
  // Ende des NÄCHSTEN Monats (Tag 0 des übernächsten).
  const kalenderEnde = new Date(Date.UTC(j, m + 1, 0)).toISOString().slice(0, 10)

  const buchungen = await getFlowTransactionsScope(supabase, daten.scopeCtx, {
    to: kalenderEnde,
    accountIds: daten.kontoIds.length > 0 ? daten.kontoIds : undefined,
    include: INCLUDE_ALL,
  })
  return <CashflowKalenderUrl events={buildCashflow(buchungen, daten.include)} heute={daten.heute} />
}
