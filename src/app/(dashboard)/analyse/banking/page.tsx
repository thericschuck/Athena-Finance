import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { ladeBankSeite, type BankSeitenParams } from '@/lib/data/bank-seite'
import { berechneScope, normIban } from '@/lib/bank/scope'
import { monthlySeries } from '@/lib/finance/flow-calc'
import { FlowKindToggle } from '@/components/finance/flow-kind-toggle'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { BankZeitraum } from '@/components/bank/BankZeitraum'
import { BankSyncInsel } from '@/components/bank/BankSyncInsel'
import { BankTrend } from '@/components/bank/BankTrend'
import { BankFilterChips, type FilterChip } from '@/components/bank/BankFilterChips'
import { BankBalanceChart } from '@/components/bank/bank-balance-chart'
import { BankKennzahlen } from '@/components/bank/BankKennzahlen'
import { BankKontokarten } from '@/components/bank/BankKontokarten'
import { BankGesamtverlauf } from '@/components/bank/BankGesamtverlauf'
import { BankKategorien } from '@/components/bank/BankKategorien'
import { BankGegenparteien } from '@/components/bank/BankGegenparteien'
import { BankFesteKosten } from '@/components/bank/BankFesteKosten'
import { BankMuster } from '@/components/bank/BankMuster'
import { BankDatenzustand } from '@/components/bank/BankDatenzustand'
import { BankOffeneKategorien } from '@/components/bank/BankOffeneKategorien'
import { BankBuchungen } from '@/components/bank/BankBuchungen'

/**
 * Bankdaten — Auswertung der gesyncten Bankbuchungen über alle Konten, Unterpunkt von Analyse.
 *
 * Server-Komponente: alle Daten kommen in EINEM Durchgang (lib/data/bank-seite.ts), die
 * Abschnitte bekommen fertige Daten und eine auf Zeitraum/Konto/Monat zugeschnittene Sicht
 * (lib/bank/scope.ts). Vorher war die Seite eine Client-Komponente, die nach dem Laden vier
 * Routen nacheinander abfragte — mit Skeleton-Flackern und Wasserfall.
 *
 * Der Unterschied zur Übersicht unter `/analyse` ist der Ausschnitt: dort zählen
 * Bankbuchungen UND manuelle Einträge, hier nur die gesyncten Bankbuchungen, Konto für
 * Konto. Die Auswertungen rechnen nach derselben Regel wie Dashboard und Analyse (View
 * `monthly_flows`: ohne Umbuchungen, Anlagen und Forderungen nur mit dem Schalter); die
 * Buchungsliste und die Kontostandskurven bleiben auf den Rohdaten, so wie die Bank sie
 * geliefert hat — die Ansicht, in der man einen Importfehler überhaupt erkennen kann.
 * Zeitraum, Konto, Monat, Gegenpartei und Kategorie stehen in der URL.
 */

export default async function BankAnalysePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const roh = await searchParams
  // Doppelte Parameter (`?konto=a&konto=b`) liefern ein Array: der erste Wert gilt.
  const params = Object.fromEntries(
    Object.entries(roh).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  ) as BankSeitenParams

  const { supabase, user } = await requireAuthUser()
  const settings = await getSettings(user!.id)
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())

  const daten = await ladeBankSeite(supabase, user!.id, params, settings, heute)
  const scope = berechneScope(daten)
  const props = { daten, scope }

  const trendMonate = monthlySeries(scope.flowsOhneMonat, daten.include)
    .map(m => ({ month: m.month, income: m.income, expense: m.expense }))

  // Konten mit Bewegungen — über die volle Historie geprüft, nicht über den Zeitraum: ein
  // Konto ohne Buchung im Fenster behält seine flache Linie und fällt nicht aus dem Raster.
  const kontenMitVerlauf = daten.balances.filter(b =>
    daten.transactions.some(t => normIban(t.account_iban) === normIban(b.account_iban)),
  )

  const monatsName = daten.monat
    ? new Date(Number(daten.monat.slice(0, 4)), Number(daten.monat.slice(5, 7)) - 1, 1)
        .toLocaleDateString(daten.locale, { month: 'long', year: 'numeric' })
    : null
  const kontoName = daten.konto
    ? daten.balances.find(b => normIban(b.account_iban) === normIban(daten.konto!))?.account_name ?? daten.konto
    : null
  const katName = daten.kat === 'offen'
    ? 'Ohne Kategorie'
    : daten.kat ? daten.categories.find(c => c.id === daten.kat)?.name ?? 'Kategorie' : null
  const chips: FilterChip[] = [
    ...(monatsName ? [{ key: 'month' as const, label: `Nur ${monatsName}` }] : []),
    ...(kontoName ? [{ key: 'konto' as const, label: `Konto: ${kontoName}` }] : []),
    ...(daten.partei ? [{ key: 'partei' as const, label: `Gegenpartei: ${daten.partei}` }] : []),
    ...(katName ? [{ key: 'kat' as const, label: `Kategorie: ${katName}` }] : []),
  ]

  return (
    // Zeitraum, Konto und Monat schreiben in die URL und lösen ein Server-Rendering aus.
    // Der Provider markiert den Klick sofort und blendet über <FilterPending> die alten
    // Zahlen ab, bis die neuen da sind.
    <UrlFiltersProvider replace>
      <div className="space-y-8 p-4 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bankdaten</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Alle Bankkonten auf den gesyncten Bankbuchungen — ohne manuelle Buchungen. Ein Klick
              auf eine Kontokarte beschränkt alles darunter auf dieses Konto.
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Zeitraum</span>
              <BankZeitraum current={daten.periode} />
            </div>
            <BankSyncInsel />
          </div>
        </div>

        <FilterPending className="space-y-8">
          <div className="space-y-8">
            <BankDatenzustand {...props} />
            <BankKennzahlen {...props} />
            <BankOffeneKategorien {...props} />
            <BankKontokarten {...props} />

            <BankGesamtverlauf {...props} />
            {kontenMitVerlauf.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kontenMitVerlauf.map(b => (
                  <BankBalanceChart
                    key={b.account_iban}
                    accountName={b.account_name ?? b.account_iban}
                    currentBalance={b.booked_balance}
                    transactions={daten.transactions.filter(t => normIban(t.account_iban) === normIban(b.account_iban))}
                    from={daten.cutoff ?? undefined}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <BankFilterChips chips={chips} />
              <FlowKindToggle />
              <p className="text-xs text-muted-foreground/70">
                Die Auswertungen zählen wie Dashboard und Analyse: ohne Umbuchungen zwischen eigenen
                Konten, Anlagen und Forderungen nur mit dem Schalter. Im Kontostandsverlauf und in
                der Buchungsliste stehen alle Bankbuchungen.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BankTrend months={trendMonate} selectedMonth={daten.monat} />
              <BankKategorien {...props} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BankGegenparteien {...props} />
              <BankFesteKosten {...props} />
            </div>

            <BankMuster {...props} />

            <BankBuchungen {...props} />
          </div>
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
