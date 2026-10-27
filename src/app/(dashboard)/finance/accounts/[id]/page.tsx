import { notFound } from 'next/navigation'
import { requireAuthUser } from '@/lib/supabase/server'
import { resolveScope } from '@/lib/haushalt/resolve'
import { ladeKontoDetail } from '@/lib/data/konto-detail'
import { rechneDetail, saldoSpanne } from '@/lib/konten/detail'
import { standAnzeige } from '@/lib/konten/berechnen'
import { parsePeriod, periodCutoff, type Period } from '@/lib/period'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPeriodSelector } from '@/components/ui/period-selector'
import { AccountBalanceChart, type AccountBalancePoint } from '@/components/finance/account-balance-chart'
import { AccountTxToolbar, MonthChip } from '@/components/finance/account-tx-toolbar'
import { KontoKopf } from '@/components/konten/detail/KontoKopf'
import { KontoHighlights } from '@/components/konten/detail/KontoHighlights'
import { KontoKarten } from '@/components/konten/detail/KontoKarten'
import { KontoMonatsKarte } from '@/components/konten/detail/KontoMonatsKarte'
import { KontoKennzahlen } from '@/components/konten/detail/KontoKennzahlen'
import { KontoDatenZeile } from '@/components/konten/detail/KontoDatenZeile'
import { BuchungenListe } from '@/components/konten/detail/BuchungenListe'
import { KontoSeiten } from '@/components/konten/detail/KontoSeiten'
import { heuteBerlin, monatLabel } from '@/components/konten/detail/format'
import { LeerZustand } from '@/components/leer/LeerZustand'
import { ZuletztGeaendert } from '@/components/aenderungen/ZuletztGeaendert'
import { letzteAenderung } from '@/lib/data/aenderungen'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    period?: string
    /** Volltextsuche in Beschreibung und Empfänger. */
    q?: string
    /** Kategorie-ID, oder `none` für "ohne Kategorie". */
    cat?: string
    /** income | expense | transfer */
    txtype?: string
    /** `date-desc` (Default) | `date-asc` | `amount-desc` | `amount-asc` */
    sort?: string
    /** `YYYY-MM` — gesetzt durch Klick auf eine Säule im Monatschart. */
    month?: string
    /** Seite der Buchungsliste, 1-basiert. */
    seite?: string
  }>
}

export default async function AccountDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp, { supabase, user }] = await Promise.all([
    params, searchParams, requireAuthUser(),
  ])
  // Eine Nicht-UUID würde in der Abfrage nur einen Datenbankfehler auslösen.
  if (!UUID.test(id)) notFound()

  const scopeCtx = await resolveScope(supabase, user!)
  const detail = await ladeKontoDetail(supabase, scopeCtx, id)
  if (!detail) notFound()
  const zuletzt = await letzteAenderung(supabase, scopeCtx, 'accounts', id)
  const { account, accounts, categories, rows, balanceHistory, locale, dateFormat } = detail
  const currency = account.currency

  // Ein Zeitraum für die ganze Seite: Kennzahlen, Chart, Auswertung und Tabelle zeigen denselben Ausschnitt.
  const period: Period = parsePeriod(sp.period)
  const cutoff = periodCutoff(period)

  const d = rechneDetail(rows, {
    cutoff,
    month: sp.month,
    q: sp.q,
    cat: sp.cat,
    txtype: sp.txtype,
    sort: sp.sort,
    seite: Number.parseInt(sp.seite ?? '', 10) || 1,
  })

  const monatText = d.aktiverMonat ? monatLabel(d.aktiverMonat, locale) : null

  // ── Kontostand und Verlauf ────────────────────────────────────────────────────
  // Der Kontostand ist der letzte bekannte Saldo, NICHT Einnahmen − Ausgaben (das wäre nur die
  // Bewegung im Zeitraum): bei Bankkonten der von der Bank gemeldete, sonst der letzte Snapshot.
  const alleSalden: AccountBalancePoint[] = balanceHistory.map(b => ({
    snapshot_date: b.snapshot_date,
    balance: b.balance,
  }))
  const letzterSnapshot = alleSalden.at(-1)?.balance ?? null
  // Manuelle Konten: die Buchungssumme ist der Stand, der Snapshot hängt bis zum nächsten Lauf hinterher
  // (der Daily-Snapshot läuft um 23:59, eine neue Buchung — z. B. „Saldo setzen“ — löst keinen aus). Der
  // Snapshot bleibt Rückfall, falls es keine Summe gibt.
  const manuell = !account.bank_iban
  const liveSumme = manuell ? detail.buchungssumme : null
  const kontostand = detail.bankSaldo ?? liveSumme ?? letzterSnapshot ?? detail.buchungssumme ?? d.netto
  const quelle =
    detail.bankSaldo !== null ? 'bank' : liveSumme !== null ? 'buchungen' : letzterSnapshot !== null ? 'snapshot' : 'buchungen'

  const verlauf = cutoff ? alleSalden.filter(b => b.snapshot_date >= cutoff) : [...alleSalden]
  // Punkt für heute nur, wenn es keinen echten Snapshot von heute gibt: bei Bankkonten schreibt
  // der Trigger fn_ensure_linked_account den gemeldeten Saldo als heutige Zeile, die gilt.
  const heute = heuteBerlin()
  // Der heutige Punkt ist immer der aktuelle Kontostand: ein vorhandener Snapshot von heute kann älter
  // sein als eine Buchung vom selben Tag und wird dann überschrieben.
  const heutigerPunkt = verlauf.findIndex(p => p.snapshot_date === heute)
  if (heutigerPunkt >= 0) verlauf[heutigerPunkt] = { snapshot_date: heute, balance: kontostand }
  else verlauf.push({ snapshot_date: heute, balance: kontostand })

  const gesamt = rows.length
  const filterAktiv = d.gefiltert

  // ── Abschnitte ────────────────────────────────────────────────────────────────
  const spanne = saldoSpanne(verlauf)
  const zeigeVerlauf = verlauf.length >= 2
  const zeigeMonate = d.monate.length >= 2

  const buchungen = (
    <div id="konto-buchungen" className="scroll-mt-4 rounded-lg border border-border bg-card">
      <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold text-foreground">Buchungen</h2>
          {gesamt > d.imMonat.length && (
            <span className="text-xs text-muted-foreground">{gesamt} insgesamt auf diesem Konto</span>
          )}
        </div>
        {gesamt > 0 && (
        <AccountTxToolbar
          categories={categories ?? []}
          usedCategoryIds={d.genutzteKategorien}
          shown={d.tabelle.length}
          total={d.imMonat.length}
        />
        )}
      </div>

      {gesamt === 0 ? (
        <LeerZustand
          variante="eingebettet"
          titel="Noch keine Buchungen"
          text="Hier erscheinen alle Buchungen dieses Kontos, sobald die Bank synchronisiert, eine CSV importiert oder eine Buchung erfasst ist."
          aktion={{ label: 'Buchung hinzufügen oder importieren', href: '/finance/transactions' }}
          sekundaer={account.bank_iban ? undefined : { label: 'Bank verbinden', href: '/settings' }}
        />
      ) : d.tabelle.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            {gesamt === 0 ? 'Noch keine Buchungen' : filterAktiv ? 'Keine Treffer' : 'Keine Buchungen in diesem Zeitraum'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {gesamt === 0
              ? 'Erfasse die erste Buchung für dieses Konto oder importiere eine CSV-Datei.'
              : filterAktiv
                ? 'Passe Suche oder Filter an.'
                : `Insgesamt ${gesamt} Buchungen — wähle oben einen größeren Zeitraum.`}
          </p>
        </div>
      ) : (
        <>
          <BuchungenListe
            zeilen={d.seitenZeilen}
            accounts={accounts ?? []}
            categories={categories ?? []}
            locale={locale}
            dateFormat={dateFormat}
          />
          <KontoSeiten seite={d.seite} seiten={d.seiten} gesamt={d.tabelle.length} locale={locale} />
        </>
      )}
    </div>
  )

  return (
    // `seite` wird bei jedem anderen Filterwechsel zurückgesetzt; alles sind Server-Filter.
    <UrlFiltersProvider resetKeys="seite">
      <div className="flex flex-col gap-5 p-4 sm:p-8">
        <KontoKopf daten={detail} kontostand={kontostand} />
        <ZuletztGeaendert info={zuletzt} className="-mt-3" />

        {/* Ein Zeitraum (und ggf. ein Monat) gilt für alles darunter. Ohne jede Buchung gibt es
            nichts einzugrenzen: Zeitraumwahl und Kennzahlen mit lauter Nullen entfallen. */}
        {gesamt > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <UrlPeriodSelector current={period} className="max-sm:[&_button]:min-h-10 max-sm:[&_button]:px-3" />
            {monatText && <MonthChip label={monatText} />}
          </div>
          <p className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {d.imMonat.length} {d.imMonat.length === 1 ? 'Buchung' : 'Buchungen'}
              {monatText ? ` in ${monatText}` : ' im Zeitraum'}
            </span>
            <a href="#konto-buchungen" className="inline-flex min-h-10 items-center font-medium text-foreground/80 sm:hidden">
              ↓ Zu den Buchungen
            </a>
          </p>
        </div>
        )}

        <FilterPending className="flex min-w-0 flex-col gap-5">
          {gesamt > 0 && (
          <KontoKennzahlen
            kontostand={kontostand}
            quelle={quelle}
            einnahmen={d.einnahmen}
            ausgaben={d.ausgaben}
            netto={d.netto}
            anzahl={d.imZeitraum.length}
            zeitraum={period}
            currency={currency}
            locale={locale}
          />
          )}
          <KontoHighlights
            spanne={zeigeVerlauf ? spanne : null}
            groessteAusgabe={d.groessteAusgaben[0] ?? null}
            proMonat={d.proMonat}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
          />
          <KontoDatenZeile
            kontoId={account.id}
            name={account.name}
            iban={account.iban ?? account.bank_iban}
            istBank={Boolean(account.bank_iban)}
            stand={standAnzeige(detail.stand, new Date())}
            bankSaldo={detail.bankSaldo}
            buchungssumme={detail.buchungssumme}
            abweichung={detail.abweichung}
            currency={currency}
            locale={locale}
            period={period}
          />

          {(zeigeVerlauf || zeigeMonate) && (
            <div className={`grid min-w-0 items-start gap-4 ${zeigeVerlauf && zeigeMonate ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
              {zeigeVerlauf && (
                <AccountBalanceChart points={verlauf} period={period} currency={currency} color={account.color} />
              )}
              {zeigeMonate && (
                <KontoMonatsKarte monate={d.monate} aktiverMonat={d.aktiverMonat} currency={currency} />
              )}
            </div>
          )}

          <KontoKarten
            kategorien={d.topKategorien}
            kategorienMax={d.kategorienMax}
            gegenparteien={d.gegenparteien}
            groessteAusgaben={d.groessteAusgaben}
            groessteEinnahmen={d.groessteEinnahmen}
            monatLabel={monatText}
            currency={currency}
            locale={locale}
            dateFormat={dateFormat}
          />

          {buchungen}
        </FilterPending>
      </div>
    </UrlFiltersProvider>
  )
}
