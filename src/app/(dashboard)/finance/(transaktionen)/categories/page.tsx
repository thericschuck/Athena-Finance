import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { AddCategoryDialog } from '@/components/finance/category-form'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPeriodSelector } from '@/components/ui/period-selector'
import { KategorienKennzahlenLeiste } from '@/components/kategorien/KategorienKennzahlenLeiste'
import { KategorienAnsicht } from '@/components/kategorien/KategorienAnsicht'
import { ladeKategorienSeite } from '@/lib/data/kategorien-seite'
import { kategorienKennzahlen, summeBaum } from '@/lib/kategorien/berechnen'
import { parsePeriod } from '@/lib/period'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const [{ period: rawPeriod }, { supabase, user }] = await Promise.all([searchParams, requireAuthUser()])
  const period = parsePeriod(rawPeriod)
  const { baum, flat, euerZeilen, locale } = await ladeKategorienSeite(supabase, await resolveScope(supabase, user!), period)

  return (
    <UrlFiltersProvider>
      <div className="space-y-4 p-4 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Kategorien</h1>
          {/* Der Zeitraum steuert nur die Nutzung (Summen); die Anzahl „gesamt“ zählt alle Buchungen. */}
          <div className="flex flex-wrap items-center gap-2">
            <UrlPeriodSelector current={period} />
            <AddCategoryDialog allCategories={flat} euerZeilen={euerZeilen} />
          </div>
        </div>

        {flat.length > 0 && (
          <KategorienKennzahlenLeiste
            k={kategorienKennzahlen(baum)}
            summe={summeBaum(baum)}
            zeitraum={period}
            locale={locale}
          />
        )}

        <FilterPending>
          <KategorienAnsicht baum={baum} flat={flat} euerZeilen={euerZeilen} locale={locale} zeitraum={period} />
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
