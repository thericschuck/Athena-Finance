import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { ladeDashboard } from '@/lib/data/dashboard-seite'
import { baueAufteilung } from '@/lib/dashboard/aufteilung'
import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { heuteBerlin } from '@/lib/data/analyse-seite'
import { FixedCostsWidget } from '@/components/finance/fixed-costs-widget'
import { PortfolioDonut } from '@/components/dashboard/portfolio-donut'
import { FinanceAnalytics } from '@/components/dashboard/finance-analytics'
import { DashKennzahlen } from '@/components/dashboard/DashKennzahlen'
import { DashHinweise } from '@/components/dashboard/DashHinweise'
import { DashZustand } from '@/components/dashboard/DashZustand'
import { DashVerlauf } from '@/components/dashboard/DashVerlauf'
import { DashTermine } from '@/components/dashboard/DashTermine'
import { DashMonat } from '@/components/dashboard/DashMonat'
import { DashAusblick } from '@/components/dashboard/DashAusblick'
import { DashKonten } from '@/components/dashboard/DashKonten'
import { DashAnlagen } from '@/components/dashboard/DashAnlagen'
import { DashSparziele } from '@/components/dashboard/DashSparziele'
import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'

/**
 * Dashboard — ein Blick, ein Cockpit.
 *
 * Aufbau von oben nach unten: eine Kennzahlenleiste (Net Worth mit Veränderung, Monat,
 * Sparquote, Liquidität, nächster Termin), eine Hinweiszeile und eine Zustandszeile (Bank-Sync,
 * Steuer), dann Verlauf mit „Als Nächstes", dann Monat, Ausblick und Aufteilung, darunter die
 * Konten und Anlagen als je EINE Reihe, zuletzt Sparziele, Fixkosten und die Finanzanalyse.
 *
 * Der Kern (Zahlen, die überall stimmen müssen) wird einmal gerechnet (lib/data/dashboard-seite.ts).
 * Was zusätzlich Abfragen braucht — die Prognose, Steuer und Bankstatus — lädt sich selbst hinter
 * <Suspense>, damit das Wichtige zuerst erscheint und der Rest nachläuft. Die Prognose wird
 * dabei pro Anfrage nur einmal berechnet (lib/data/dashboard-prognose.ts).
 */

export default async function DashboardPage() {
  const { supabase, user } = await requireAuthUser()
  const settings = await getSettings(user!.id)
  const heute = heuteBerlin()
  // Die Prognose haengt nicht am Kern: gleich anstossen, damit sie parallel zu seinen Abfragen
  // laeuft statt erst, wenn die Kennzahlen rendern. `cache()` teilt das Ergebnis mit den Abschnitten.
  void ladeDashPrognose(user!.id, heute)
  const kern = await ladeDashboard(supabase, user!.id, settings, heute)
  const props = { kern }
  const aufteilung = baueAufteilung({
    konten: kern.konten,
    depots: kern.depots.map(d => ({ id: d.id, name: d.name, wert: d.depotValue ?? 0 })),
    krypto: kern.buckets.krypto,
  })

  const datumLang = new Date(`${heute}T12:00:00`).toLocaleDateString(kern.locale, {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    // `min-w-0 max-w-full overflow-x-clip`: eine scrollbare Leiste oder ein breiter Chart darf die
    // SEITE nie seitlich verschiebbar machen (Handy).
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 overflow-x-clip p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{datumLang}</p>
      </div>

      {/* Schmale Zeilen oben: Kennzahlen, Hinweise, Zustand. */}
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-lg" />}>
        <DashKennzahlen {...props} />
      </Suspense>
      <DashHinweise insights={kern.insights} />
      <Suspense fallback={null}>
        <DashZustand {...props} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <Suspense fallback={<SkeletonChart variant="area" height={320} />}>
            <DashVerlauf {...props} />
          </Suspense>
        </div>
        <Suspense fallback={<SkeletonChart variant="hbars" height={320} />}>
          <DashTermine {...props} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <DashMonat {...props} />
        <Suspense fallback={<SkeletonChart variant="area" height={240} />}>
          <DashAusblick {...props} />
        </Suspense>
        {/* Jedes Konto, jedes Depot und Krypto als eigener Posten: dieselben Bausteine wie in der
            Net-Worth-Kennzahl, nur aufgeschluesselt (lib/dashboard/aufteilung.ts). */}
        <PortfolioDonut
          posten={aufteilung.posten}
          total={aufteilung.total}
          minus={aufteilung.minus}
          locale={kern.locale}
        />
      </div>

      <DashKonten {...props} />
      <DashAnlagen {...props} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <DashSparziele {...props} />
        <FixedCostsWidget
          totalMonthly={kern.fixkosten.total}
          contracts={kern.fixkosten.vertraege}
          accounts={kern.fixkosten.konten}
        />
      </div>

      {kern.analytik.summaries.length > 0 && (
        <FinanceAnalytics
          summaries={kern.analytik.summaries}
          categorySeries={kern.analytik.categorySeries}
          locale={kern.locale}
        />
      )}
    </div>
  )
}
