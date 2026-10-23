import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getBewegungFlows, getBewegungSnapshots } from '@/lib/data/verlauf-bewegung'
import { bewegungsMonate, type BewegungSnapshot } from '@/lib/verlauf/bewegung'
import BewegungsPanel from './BewegungsPanel'

/**
 * „Warum hat sich mein Vermögen bewegt?" — lädt die Rohdaten, rechnet die Monate einmal und
 * reicht sie an das Panel weiter, das den Zeitraum per State umschaltet. So braucht die
 * Komponente keine searchParams und die Seite bleibt statisch cachebar.
 */
export async function BewegungsAnalyse(
  { supabase, uid, locale, snapshots }: {
    supabase: SupabaseClient<Database>; uid: string; locale: string
    /** Schon geladene Snapshots (der Net-Worth-Tab hat sie): spart die zweite Komplettabfrage. */
    snapshots?: BewegungSnapshot[]
  },
) {
  const [snaps, flows] = await Promise.all([
    snapshots ?? getBewegungSnapshots(supabase, uid),
    getBewegungFlows(supabase, uid),
  ])
  const monate = bewegungsMonate(snaps, flows)
  if (monate.length === 0) return null
  return <BewegungsPanel monate={monate} locale={locale} />
}
