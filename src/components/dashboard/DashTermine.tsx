import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { fuehreZusammen, TERMINE_FENSTER } from '@/lib/dashboard/termine'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DashTermineListe } from './DashTermineListe'

/**
 * „Als Nächstes": die nächsten Termine in EINER Liste — bekannte Zahlungen aus der Prognose
 * (Verträge, Einmalposten) und auslaufende Kündigungsfristen aus dem Dashboard-Kern.
 *
 * Geladen wird das grösste wählbare Fenster (30 Tage); der kleine Umschalter 14/30 schneidet im
 * Client nur noch zu, ohne neue Abfrage. Fällt die Prognose aus, bleiben die Kündigungsfristen:
 * die Liste ist dann unvollständig, sagt das aber.
 *
 * Erinnerungen (lib/reminders) sind bewusst NICHT dabei: sie sind schlüsselbasierte Hinweise ohne
 * eigenes Fälligkeitsdatum, die Kündigungsfristen darin stammen ohnehin aus denselben Verträgen.
 */
export async function DashTermine({ kern }: DashAbschnittProps) {
  const basis = await ladeDashPrognose(kern.scopeCtx, kern.heute)
  const maxTage = TERMINE_FENSTER[TERMINE_FENSTER.length - 1]

  const zeilen = fuehreZusammen(
    kern.heute,
    maxTage,
    basis?.szenario.termine ?? [],
    kern.kuendbar.map(k => ({ id: k.id, name: k.name, days: k.days })),
  )

  return (
    <DashTermineListe
      zeilen={zeilen}
      locale={kern.locale}
      dateFormat={kern.dateFormat}
      ohnePrognose={basis === null}
    />
  )
}
