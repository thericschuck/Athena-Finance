import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { getSettings } from '@/lib/settings'
import { ladeBankSeite, type BankSeitenParams } from '@/lib/data/bank-seite'
import { berechneScope, normIban } from '@/lib/bank/scope'
import { monthlySeries } from '@/lib/finance/flow-calc'
import { FlowKindToggle } from '@/components/finance/flow-kind-toggle'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { BankZeitraum } from '@/components/bank/BankZeitraum'
import { BankSyncInsel } from '@/components/bank/BankSyncInsel'
import { BankTrend } from '@/components/bank/BankTrend'
import { BankFilterChips } from '@/components/bank/BankFilterChips'
import { AnalyseTabs, type AnalyseTab } from '@/components/analyse/AnalyseTabs'
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
import { Landmark } from 'lucide-react'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ScopeHinweisFuer } from '@/components/leer/ScopeHinweisFuer'

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
  // Scope und Einstellungen sind unabhaengig: eine Rundreise-Stufe statt zwei (Layout teilt dieselben Ergebnisse per cache()).
  const [settings, ctx] = await Promise.all([getSettings(user!.id), resolveScope(supabase, user)])
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())

  const daten = await ladeBankSeite(supabase, ctx, params, settings, heute)
  const scope = berechneScope(daten)
  const props = { daten, scope }
  // Nie eine Bank synchronisiert (kein Kontostand, keine Buchung): erklaeren statt leerer Karten.
  const keineBankdaten = daten.balances.length === 0 && daten.transactions.length === 0

  const trendMonate = monthlySeries(scope.flowsOhneMonat, daten.include)
    .map(m => ({ month: m.month, income: m.income, expense: m.expense }))

  // Konten mit Bewegungen — über die volle Historie geprüft, nicht über den Zeitraum: ein
  // Konto ohne Buchung im Fenster behält seine flache Linie und fällt nicht aus dem Raster.
  const kontenMitVerlauf = daten.balances.filter(b =>
    daten.transactions.some(t => normIban(t.account_iban) === normIban(b.account_iban)),
  )

  // Drei Ansichten statt zehn Karten untereinander (wie die Analyse-Seite). Die Buchungsliste
  // steht darunter, nicht in einem Tab: sie ist das Ziel jedes Klicks in den Auswertungen.
  const tabs: AnalyseTab[] = [
    {
      key: 'ueberblick',
      label: 'Überblick',
      inhalt: (
        <>
          <BankGesamtverlauf {...props} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <BankTrend months={trendMonate} selectedMonth={daten.monat} />
            <BankKategorien {...props} />
          </div>
          <p className="text-xs text-muted-foreground/80">
            Auswertungen zählen wie Dashboard und Analyse (ohne Umbuchungen, Anlagen und Forderungen
            mit dem Schalter). Kontoverlauf und Buchungsliste zeigen alle Bankbuchungen.
          </p>
        </>
      ),
    },
    {
      key: 'auswertung',
      label: 'Auswertung',
      inhalt: (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <BankGegenparteien {...props} />
            <BankFesteKosten {...props} />
          </div>
          <BankMuster {...props} />
        </>
      ),
    },
    {
      key: 'konten',
      label: 'Konten',
      inhalt: kontenMitVerlauf.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
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
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">Keine Kontoverläufe vorhanden.</p>
      ),
    },
  ]

  return (
    // Zeitraum, Konto und Monat schreiben in die URL und lösen ein Server-Rendering aus. Der
    // Provider markiert den Klick sofort und blendet über <FilterPending> die alten Zahlen ab,
    // bis die neuen da sind. Gegenpartei, Kategorie und die gewählte Ansicht (`localKeys`) wirken
    // nur im Browser: sie setzen die URL ohne Server-Rendering, ein Klick lädt also nichts neu.
    <UrlFiltersProvider replace localKeys="partei,kat,ansicht">
      {/* `min-w-0 max-w-full overflow-x-clip`: ein breiter Chart oder eine scrollbare Leiste darf die
          SEITE nie seitlich verschiebbar machen (Handy). */}
      <div className="min-w-0 max-w-full space-y-4 overflow-x-clip p-4 sm:p-6">
        {/* Titel links, Filter und Sync rechts in einer Zeile; auf dem Handy darunter, waagerecht
            scrollbar statt mehrzeilig umgebrochen. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Bankdaten</h1>
          <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FlowKindToggle />
            <BankZeitraum current={daten.periode} />
            <BankSyncInsel />
          </div>
        </div>

        {keineBankdaten ? (
          <div className="space-y-4">
            <ScopeHinweisFuer ctx={ctx} thema="Bankdaten" />
            <LeerZustand
              icon={Landmark}
              titel="Noch keine Bankdaten"
              text="Hier wertest du die per Bank-Sync geholten Buchungen aus, Konto für Konto. Sobald eine Bank verbunden und synchronisiert ist, erscheinen Kontostände, Kategorien und Muster."
              aktion={{ label: 'Bank verbinden', href: '/settings' }}
              sekundaer={{ label: 'Analyse aller Buchungen', href: '/analyse' }}
            />
          </div>
        ) : (
        <FilterPending className="space-y-4">
          <div className="space-y-4">
            {/* Schmale Zeilen oben: Zustand, Kennzahlen, offene Kategorien, Konten. */}
            <BankDatenzustand {...props} />
            <BankKennzahlen {...props} />
            <BankOffeneKategorien {...props} />
            <BankKontokarten {...props} />

            <AnalyseTabs tabs={tabs} />

            <section id="buchungen" className="scroll-mt-4 space-y-3">
              <BankFilterChips
                kategorien={daten.categories.map(c => ({ id: c.id, name: c.name }))}
                konten={daten.balances.map(b => ({ iban: b.account_iban, name: b.account_name ?? b.account_iban }))}
                locale={daten.locale}
              />
              <BankBuchungen {...props} />
            </section>
          </div>
        </FilterPending>
        )}
      </div>
    </UrlFiltersProvider>
  )
}
