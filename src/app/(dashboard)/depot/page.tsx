import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { DepotDashboard } from '@/components/depot/DepotDashboard'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'
import { letzteAenderungen } from '@/lib/data/aenderungen'

export default async function DepotPage() {
  const { supabase, user } = await requireAuthUser()
  const ctx = await resolveScope(supabase, user)

  // Letzte Aenderung je Depot nur bei Haushalt mit Partner (sonst keine Zusatzabfrage).
  let zuletzt: Record<string, import('@/lib/data/aenderungen').ZuletztGeaendertInfo> = {}
  if (ctx.available.length > 1) {
    const { data } = await supabase.from('depots').select('id')
    zuletzt = Object.fromEntries(await letzteAenderungen(supabase, ctx, 'depots', (data ?? []).map(d => d.id)))
  }

  // key: Scope-Wechsel laedt die (clientseitig geholten) Depotdaten neu.
  return <DepotDashboard key={ctx.scope} canShare={ctx.available.length > 1} leerHinweis={<ScopeHinweisFuer ctx={ctx} thema="Depots" />} zuletzt={zuletzt} />
}
