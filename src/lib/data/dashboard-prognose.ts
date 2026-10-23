import { cache } from 'react'
import { getAuthUser } from '@/lib/supabase/server'
import { ladePrognoseBasis, type PrognoseBasis } from '@/lib/forecast/laden'

/**
 * Die Cashflow-/Vermögensprognose fürs Dashboard, pro Anfrage genau EINMAL berechnet: Kennzahlen
 * (Liquidität in 30 Tagen), Ausblick-Chart und „Als Nächstes" brauchen alle dieselbe Prognose,
 * und `cache()` lässt die drei Abschnitte sie teilen, ohne dass einer den anderen kennt.
 *
 * Drei Monate reichen fürs Dashboard (die Prognose-Seite selbst rechnet 18). Schlägt die
 * Berechnung fehl, kommt `null`: das Dashboard bleibt benutzbar, nur der Ausblick fehlt.
 */
export const ladeDashPrognose = cache(async (userId: string, heute: string): Promise<PrognoseBasis | null> => {
  try {
    const { supabase } = await getAuthUser()
    return await ladePrognoseBasis(supabase, userId, heute, { monate: 3 })
  } catch {
    return null
  }
})
