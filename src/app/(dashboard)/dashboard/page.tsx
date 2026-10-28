import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getSettings } from '@/lib/settings'
import { ladeDashboard } from '@/lib/data/dashboard-seite'
import { baueAufteilung } from '@/lib/dashboard/aufteilung'
import { ladeDashPrognose } from '@/lib/data/dashboard-prognose'
import { heuteBerlin } from '@/lib/data/analyse-seite'
import { FixedCostsWidget } from '@/components/finance/fixed-costs-widget'
import { PortfolioDonut } from '@/components/dashboard/portfolio-donut'
import { FinanceAnalyticsLazy } from '@/components/dashboard/FinanceAnalyticsLazy'
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
import { AufteilungPlatzhalter } from '@/components/dashboard/DashPlatzhalter'
import { dashboardLeer } from '@/lib/dashboard/leer'
import { Skeleton, SkeletonChart } from '@/components/ui/skeleton'
import { ladeErsteSchritteZaehler } from '@/lib/data/erste-schritte'
import { CHECKLISTE_KEY, checklisteFlag, checklisteStatus, sollFertigVermerken } from '@/lib/leer/erste-schritte'
import { ChecklisteFertigVermerk } from '@/components/leer/ChecklisteFertigVermerk'
import { ErsteSchritteKarte } from '@/components/leer/ErsteSchritteKarte'
import type { ChecklisteAnsicht } from '@/lib/leer/erste-schritte'

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
  // Scope und Einstellungen sind unabhaengig: eine Rundreise-Stufe statt zwei (Layout teilt dieselben Ergebnisse per cache()).
  const [ctx, settings] = await Promise.all([resolveScope(supabase, user), getSettings(user.id)])
  const heute = heuteBerlin()
  // Die Prognose haengt nicht am Kern: gleich anstossen, damit sie parallel zu seinen Abfragen
  // laeuft statt erst, wenn die Kennzahlen rendern. `cache()` teilt das Ergebnis mit den Abschnitten.
  if (ctx.accountIds.length > 0) void ladeDashPrognose(ctx, heute)
  // Checkliste "Erste Schritte": Vermerk aus den ohnehin geladenen Einstellungen. Mit Vermerk (ausgeblendet/fertig)
  // laeuft KEINE Zaehl-Abfrage; ohne Vermerk starten die Zaehler jetzt parallel zum Kern statt nach ihm.
  // Schlaegt das Zaehlen fehl, gibt es null -> keine Karte, nie eine kaputte Seite.
  const flag = checklisteFlag(settings[CHECKLISTE_KEY])
  const zaehlerP = flag ? null : ladeErsteSchritteZaehler(supabase, ctx).catch(() => null)
  const kern = await ladeDashboard(supabase, ctx, settings, heute)
  const zaehler = zaehlerP ? await zaehlerP : null
  const checkliste = checklisteStatus(zaehler, flag)
  // 'fertig' nur im Scope 'ich' vermerken (siehe sollFertigVermerken); geschrieben wird nach dem Rendern vom Client.
  const fertigVermerken = zaehler !== null && sollFertigVermerken(zaehler, ctx.scope, flag)
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

      {fertigVermerken && <ChecklisteFertigVermerk />}
      <DashboardInhalt
        kern={kern} props={props} aufteilung={aufteilung}
        checkliste={typeof checkliste === 'object' ? checkliste : null}
      />
    </div>
  )
}

function DashboardInhalt({ kern, props, aufteilung, checkliste }: {
  kern: Awaited<ReturnType<typeof ladeDashboard>>
  props: { kern: Awaited<ReturnType<typeof ladeDashboard>> }
  aufteilung: ReturnType<typeof baueAufteilung>
  checkliste: ChecklisteAnsicht | null
}) {
  const leer = dashboardLeer(kern)
  const hatAufteilung = aufteilung.total > 0 && aufteilung.posten.length > 0
  return (
    <>
      {/* Schmale Zeilen oben: Kennzahlen, Hinweise, Zustand. */}
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-lg" />}>
        <DashKennzahlen {...props} />
      </Suspense>
      {/* Ohne Daten sagt "Keine offenen Hinweise" nichts: die Zeile entfaellt, solange es nichts zu zeigen gibt. */}
      {!(leer.leer && kern.insights.length === 0) && <DashHinweise insights={kern.insights} />}
      {!leer.keineBuchungen && (
        <Suspense fallback={<Skeleton className="h-10 w-full rounded-lg" />}>
          <DashZustand {...props} />
        </Suspense>
      )}
      {/* Handy/Tablet: Checkliste direkt unter den Hinweisen. Ab lg steht sie in der rechten Spalte von Zeile 2
          (gleiche Karte, geteilter Ausgeblendet-Zustand). */}
      {checkliste && (
        <div className="lg:hidden">
          <ErsteSchritteKarte ansicht={checkliste} />
        </div>
      )}

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

      {/* Drei Spalten, die die Hoehe der Aufteilung (acht Legendenzeilen) teilen. Monat und
          Ausblick sind kompakt und stehen oben; darunter fuellen Konten und Sparziele den Rest
          der Spalte (flex-1, intern scrollbar) — statt dass die Karten gestreckt werden und
          unter ihrem Inhalt leer bleiben. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          <DashMonat {...props} />
          <div className="flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
            <DashKonten {...props} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Suspense fallback={<Skeleton className="h-[290px] rounded-lg border border-border" />}>
            <DashAusblick {...props} />
          </Suspense>
          <div className="flex min-h-0 flex-1 flex-col [&>*]:min-h-0 [&>*]:flex-1">
            <DashSparziele {...props} />
          </div>
        </div>
        {/* Jedes Konto, jedes Depot und Krypto als eigener Posten: dieselben Bausteine wie in der
            Net-Worth-Kennzahl, nur aufgeschluesselt (lib/dashboard/aufteilung.ts). Ab lg steht die kompakte
            Checkliste ueber der Aufteilung; ohne Posten fuellt ein Geister-Ring den Rest der Spalte, damit
            kein Loch entsteht (auf dem Handy entfaellt er, dort waere er nur Platzverbrauch). */}
        <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
          {checkliste && (
            <div className="hidden lg:block">
              <ErsteSchritteKarte ansicht={checkliste} schmal />
            </div>
          )}
          {hatAufteilung ? (
            <div className="min-h-0 flex-1 [&>*]:h-full">
              <PortfolioDonut
                posten={aufteilung.posten}
                total={aufteilung.total}
                minus={aufteilung.minus}
                locale={kern.locale}
              />
            </div>
          ) : (
            <div className="hidden min-h-0 flex-1 flex-col lg:flex [&>*]:flex-1">
              <AufteilungPlatzhalter />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <DashAnlagen {...props} />
        </div>
        <FixedCostsWidget
          totalMonthly={kern.fixkosten.total}
          contracts={kern.fixkosten.vertraege}
          accounts={kern.fixkosten.konten}
        />
      </div>

      {kern.analytik.summaries.length > 0 && (
        <FinanceAnalyticsLazy
          summaries={kern.analytik.summaries}
          categorySeries={kern.analytik.categorySeries}
          locale={kern.locale}
        />
      )}
    </>
  )
}
