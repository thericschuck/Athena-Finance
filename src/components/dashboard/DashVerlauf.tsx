import Link from 'next/link'
import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { prognoseLinie } from '@/lib/verlauf/prognose-linie'
import { meilensteine } from '@/lib/verlauf/networth'
import { NetWorthChartLazy } from '@/components/verlauf/NetWorthChartLazy'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'

/**
 * Net-Worth-Verlauf: derselbe Chart wie auf der Verlauf-Seite (Zeiträume, nach Topf gestapelt,
 * Prognoselinie mit Bereich, Meilensteine) statt des älteren eigenen Dashboard-Charts. Ein
 * Chart, ein Verhalten — und die Prognose aus dem Prognosesystem statt einer Geraden.
 *
 * Die Prognose lädt sich hier selbst (geteilt über `cache()` mit Kennzahlen und Ausblick); fehlt
 * sie, zeigt der Chart nur den Verlauf.
 */
export async function DashVerlauf({ kern }: DashAbschnittProps) {
  const prognose = await ladeDashPrognose(kern.scopeCtx, kern.heute)
  const projektion = prognose ? prognoseLinie(prognose.szenario.tage) : []
  const hoechster = projektion.length ? Math.max(...projektion.map(p => p.wert)) : kern.netWorth
  // Meilensteine nur, wenn die Prognose sie in Sicht rückt — sonst streckt eine ferne Linie die Achse.
  const ziele = meilensteine(kern.netWorth).filter(m => m <= Math.max(hoechster, kern.netWorth) * 1.25)

  return (
    <div className="min-w-0">
      <NetWorthChartLazy punkte={kern.snapshots} locale={kern.locale} projektion={projektion} meilensteine={ziele} />
      <div className="mt-1 text-right">
        <Link href="/analyse/verlauf" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Zum Verlauf →
        </Link>
      </div>
    </div>
  )
}
