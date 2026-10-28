import { cache } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { ladePrognoseBasis, type PrognoseBasis } from '@/lib/forecast/laden'
import type { ScopeContext } from '@/lib/haushalt/scope'

/**
 * Die Cashflow-/Vermögensprognose fürs Dashboard, pro Anfrage genau EINMAL berechnet: Kennzahlen
 * (Liquidität in 30 Tagen), Ausblick-Chart und „Als Nächstes" brauchen alle dieselbe Prognose,
 * und `cache()` lässt die drei Abschnitte sie teilen, ohne dass einer den anderen kennt.
 *
 * Drei Monate reichen fürs Dashboard (die Prognose-Seite selbst rechnet 18). Schlägt die
 * Berechnung fehl (oder fehlt Historie), kommt `null`: das Dashboard bleibt benutzbar, nur der Ausblick fehlt.
 */
export const ladeDashPrognose = cache(async (ctx: ScopeContext, heute: string): Promise<PrognoseBasis | null> => {
  try {
    const { supabase } = await getAuthUser()
    const b = await ladePrognoseBasis(supabase, ctx, heute, { monate: 3 })
    // Ansicht mit weniger als 3 Monaten Historie: keine Scheinprognose, der Ausblick fehlt (die Prognose-Seite erklaert warum).
    return b.zuWenigHistorie ? null : b
  } catch {
    return null
  }
})
