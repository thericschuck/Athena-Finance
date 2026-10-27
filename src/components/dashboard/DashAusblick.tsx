import Link from 'next/link'
import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { AUSBLICK_ZEITRAEUME, reduziereTage } from '@/lib/dashboard/ausblick'
import type { DashAbschnittProps } from '@/lib/dashboard/typen'
import { DashAusblickLazy } from './DashAusblickLazy'

/**
 * Ausblick Liquidität: die erwartete Liquidität der nächsten 30 bis 90 Tage als kleiner Chart mit
 * Kernaussage. Dieselbe Prognose wie die Prognose-Seite (geteilt über `ladeDashPrognose`, pro
 * Anfrage einmal gerechnet); hier kommt nur der auf ~90 Tagespunkte reduzierte Ausschnitt zum
 * Client, nicht die ganze Prognose.
 *
 * Gezeigt wird das Szenario (Prognose mit den gesetzten Annahmen) — wie der grosse Chart dort.
 */
export async function DashAusblick({ kern }: DashAbschnittProps) {
  const basis = await ladeDashPrognose(kern.scopeCtx, kern.heute)
  const maxTage = AUSBLICK_ZEITRAEUME[AUSBLICK_ZEITRAEUME.length - 1]
  const punkte = basis ? reduziereTage(basis.szenario.tage, kern.heute, maxTage) : []

  // Ohne Prognose (Berechnung fehlgeschlagen) oder mit zu wenig Tagen: schmale Karte statt Loch.
  if (punkte.length < 2) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ausblick Liquidität</p>
          <p className="mt-2 text-sm font-medium">Ausblick nicht verfügbar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Die Prognose konnte gerade nicht berechnet werden. Auf der Prognose-Seite steht der Grund.
          </p>
        </div>
        <Link
          href="/finance/prognose"
          className="inline-flex min-h-10 items-center self-start text-xs font-medium text-primary hover:underline"
        >
          Zur Prognose →
        </Link>
      </div>
    )
  }

  return <DashAusblickLazy punkte={punkte} heute={kern.heute} locale={kern.locale} dateFormat={kern.dateFormat} />
}
