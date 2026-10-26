import Link from 'next/link'
import { requireAuthUser } from '@/lib/supabase/server'
import { AddAccountDialog } from '@/components/finance/account-form'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPeriodSelector } from '@/components/ui/period-selector'
import { BankSyncPanel } from '@/components/bank/bank-sync-panel'
import { SyncedHoldingsSection } from '@/components/bank/synced-holdings-section'
import { KontenKennzahlenLeiste } from '@/components/konten/KontenKennzahlenLeiste'
import { KontenListe, type GruppeAnzeige } from '@/components/konten/KontenListe'
import { KontenDepots } from '@/components/konten/KontenDepots'
import {
  KontenSortierungProvider, ReihenfolgeKnopf, SortierFehler,
} from '@/components/konten/KontenSortierung'
import { ladeKontenSeite } from '@/lib/data/konten-seite'
import { gruppiereKonten, kontenKennzahlen, standAnzeige } from '@/lib/konten/berechnen'
import { parsePeriod } from '@/lib/period'

export const dynamic = 'force-dynamic'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; inaktive?: string }>
}) {
  const [{ period: rawPeriod, inaktive: rawInaktive }, { supabase, user }] = await Promise.all([
    searchParams,
    requireAuthUser(),
  ])

  const period = parsePeriod(rawPeriod)
  const mitInaktiven = rawInaktive === '1'
  const { zeilen, depots, locale } = await ladeKontenSeite(supabase, user!.id, period)

  const kennzahlen = kontenKennzahlen(zeilen)
  const jetzt = new Date()
  const gruppen: GruppeAnzeige[] = gruppiereKonten(zeilen, mitInaktiven).map((g) => ({
    key: g.key,
    label: g.label,
    summe: g.summe,
    fremdwaehrung: g.fremdwaehrung,
    konten: g.konten.map((zeile) => ({ zeile, stand: standAnzeige(zeile.stand, jetzt) })),
  }))
  const reihenfolge = Object.fromEntries(gruppen.map((g) => [g.key, g.konten.map((k) => k.zeile.id)]))
  const kannSortieren = gruppen.some((g) => g.konten.length > 1)

  // Der Chip schaltet nur `inaktive`; der Zeitraum bleibt erhalten.
  const query = new URLSearchParams()
  if (rawPeriod) query.set('period', rawPeriod)
  if (!mitInaktiven) query.set('inaktive', '1')
  const inaktiveHref = query.size > 0 ? `?${query.toString()}` : '?'

  return (
    <UrlFiltersProvider>
      <KontenSortierungProvider gruppen={reihenfolge}>
        <div className="space-y-4 p-4 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Konten</h1>
            {/* Der Zeitraum steuert nur Verlauf und Δ; der Saldo ist immer der aktuelle. */}
            <div className="flex flex-wrap items-center gap-2">
              <UrlPeriodSelector current={period} />
              <AddAccountDialog />
              <BankSyncPanel />
              {kannSortieren && <ReihenfolgeKnopf />}
            </div>
          </div>
          <SortierFehler />

          {zeilen.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
              <p className="text-sm font-medium">Noch keine Konten</p>
              <p className="mt-1 text-sm text-muted-foreground">Füge dein erstes Konto hinzu, um loszulegen.</p>
            </div>
          ) : (
            <FilterPending>
              <div className="space-y-4">
                <KontenKennzahlenLeiste k={kennzahlen} locale={locale} />
                {kennzahlen.anzahlInaktiv > 0 && (
                  <div className="flex justify-end">
                    <Link
                      href={inaktiveHref}
                      scroll={false}
                      className="inline-flex h-10 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground sm:h-8"
                    >
                      {mitInaktiven ? 'Inaktive ausblenden' : `Inaktive (${kennzahlen.anzahlInaktiv})`}
                    </Link>
                  </div>
                )}
                <KontenListe gruppen={gruppen} locale={locale} />
              </div>
            </FilterPending>
          )}

          <KontenDepots depots={depots} locale={locale} />

          {/* Über FinTS mitgelieferte Fondsbestände (Union Investment o. ä.) — der Nachbar der Depots. */}
          <SyncedHoldingsSection />
        </div>
      </KontenSortierungProvider>
    </UrlFiltersProvider>
  )
}
