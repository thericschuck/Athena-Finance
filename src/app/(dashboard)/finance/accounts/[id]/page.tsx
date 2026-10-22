import { requireAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AddTransactionDialog, EditTransactionDialog, DeleteTransactionButton, TransactionCategorySelect, TransactionDescriptionCell } from '@/components/finance/transaction-form'
import { ExportTransactionsButton, ImportTransactionsDialog } from '@/components/finance/transaction-csv'
import { AccountBalanceChart, type AccountBalancePoint } from '@/components/finance/account-balance-chart'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPeriodSelector } from '@/components/ui/period-selector'
import { AccountMonthChart, type MonthDatum } from '@/components/finance/account-month-chart'
import { AccountTxToolbar, SortableHeader, MonthChip } from '@/components/finance/account-tx-toolbar'
import { parsePeriod, periodCutoff, type Period } from '@/lib/period'
import { fetchBalanceHistory } from '@/lib/account-history'
import { Database } from '@/types/database'
import {
  getAccount,
  getActiveAccountOptions,
  type AccountOptionRow as Account,
} from '@/lib/data/finance-accounts'
import {
  getAccountTransactions,
  getCategoryOptions,
  type AccountTransactionRow as UnifiedRow,
  type CategoryOptionRow as Category,
} from '@/lib/data/finance-transactions'
import { ChevronLeft, Landmark } from 'lucide-react'

type TxRow = Database['public']['Tables']['transactions']['Row']

const TYPE_LABELS: Record<string, string> = {
  checking:         'Girokonto',
  savings:          'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment:       'Depot',
  crypto:           'Krypto',
  cash:             'Bargeld',
  credit:           'Kreditkarte',
  other:            'Sonstiges',
}


// `signedAmount` kommt aus der view-Spalte `signed_amount` -- die trägt die echte Richtung
// (negativ bei Abgang) schon korrekt, auch für Transfers zwischen eigenen Konten. Über `type`
// herzuleiten reichte nur für 'income'/'expense'; 'transfer' fiel sonst in den else-Zweig und
// zeigte den Betrag (immer positiv, weil `amount` = abs()) fälschlich immer mit "+" an.
function formatAmount(signedAmount: number, amount: number, currency: string, locale: string) {
  const net = signedAmount
  const sign = net > 0 ? '+' : net < 0 ? '-' : ''
  const display = ['BTC', 'ETH'].includes(currency)
    ? `${Math.abs(amount).toFixed(6)} ${currency}`
    : fmtCurrency(Math.abs(amount), currency, locale, { fractionDigits: 2 })
  return { sign, display, net }
}

function formatCurrency(amount: number, currency: string, locale: string) {
  if (['BTC', 'ETH'].includes(currency)) return `${amount.toFixed(6)} ${currency}`
  return fmtCurrency(amount, currency, locale, { fractionDigits: 2 })
}

function formatDate(dateStr: string, dateFormat: string) {
  return fmtDate(dateStr, dateFormat)
}

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
    /** `YYYY-MM` — gesetzt durch Klick auf eine Saeule im Monatschart. */
    month?: string
  }>
}

export default async function AccountDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp, { supabase, user }] = await Promise.all([
    params, searchParams, requireAuthUser(),
  ])
  const { period: rawPeriod, q, cat, txtype, sort, month } = sp
  const period: Period = parsePeriod(rawPeriod)
  const cutoff = periodCutoff(period)

  const [account, accounts, categories, allRows, balanceHistory, settings] = await Promise.all([
    getAccount(supabase, user!.id, id),
    getActiveAccountOptions(supabase, user!.id),
    getCategoryOptions(supabase, user!.id),
    getAccountTransactions(supabase, user!.id, id),
    // Seitenweise: „Geschaeftsanteile" hat ueber 3.000 Snapshots seit 2018, und eine
    // einzelne Abfrage liefert davon nur die aeltesten 1.000 (bis Maerz 2021). Der
    // Kontostand unten kommt aus `at(-1)` und waere damit fuenf Jahre alt.
    fetchBalanceHistory(supabase, { accountId: id }),
    getSettings(user!.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const dateFormat = (settings.date_format as string) ?? 'dd.MM.yyyy'

  if (!account) notFound()

  // Ein Zeitraum fuer die ganze Seite: Chart, Kennzahlen und Tabelle zeigen denselben
  // Ausschnitt. Vorher galt der Umschalter nur fuer den Chart, waehrend die Karten daneben
  // die komplette Historie summierten — der Chart sagte "1J", der Saldo meinte "seit 2018".
  const rows = cutoff ? allRows.filter(t => t.date >= cutoff) : allRows
  const currency = account.currency

  // Einnahmen/Ausgaben nach derselben Regel wie Dashboard und Analyse: Umbuchungen zwischen
  // eigenen Konten und Anfangsbestände zählen nicht, Anlagen und Forderungen schon. Die
  // Tabelle darunter zeigt weiterhin ALLE Buchungen des Kontos.
  const countsAsFlow = (t: { flow_kind: string }) => t.flow_kind !== 'umbuchung' && t.flow_kind !== 'anfangsbestand'
  const income  = rows.filter(t => t.type === 'income'  && countsAsFlow(t)).reduce((s, t) => s + t.amount, 0)
  const expense = rows.filter(t => t.type === 'expense' && countsAsFlow(t)).reduce((s, t) => s + t.amount, 0)
  const net     = income - expense

  // Ein per Klick gewaehlter Monat grenzt Kategorien und Tabelle weiter ein. Nur gueltig,
  // wenn er im aktuellen Zeitraum ueberhaupt vorkommt — sonst bliebe nach einem
  // Zeitraumwechsel ein Filter aktiv, dessen Saeule nirgends mehr zu sehen ist.
  const monthsInRange = new Set(rows.map(t => t.date.slice(0, 7)))
  const activeMonth = month && monthsInRange.has(month) ? month : null
  const monthRows = activeMonth ? rows.filter(t => t.date.slice(0, 7) === activeMonth) : rows

  const monthLabel = activeMonth
    ? new Date(Number(activeMonth.slice(0, 4)), Number(activeMonth.slice(5, 7)) - 1, 1)
        .toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : null

  // ── Auswertung ────────────────────────────────────────────────────────────────
  // Bewusst hier auf dem Server aus `rows` gerechnet und nicht im Browser: so wandern
  // fertige Monatssummen zum Client statt 575 Einzelbuchungen.
  const monthMap = new Map<string, { income: number; expense: number }>()
  for (const t of rows) {
    if (t.type !== 'income' && t.type !== 'expense') continue
    if (!countsAsFlow(t)) continue
    const key = t.date.slice(0, 7)
    const e = monthMap.get(key) ?? { income: 0, expense: 0 }
    if (t.type === 'income') e.income += t.amount
    else e.expense -= t.amount   // negativ, damit die Balken unter der Nulllinie liegen
    monthMap.set(key, e)
  }
  const months: MonthDatum[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, net: v.income + v.expense }))

  // Ausgaben je Kategorie. Umbuchungen bleiben draußen — Geld, das auf ein eigenes Konto
  // wandert, ist keine Ausgabe und würde die größten Posten sonst anführen.
  const catMap = new Map<string, { name: string; color: string | null; total: number }>()
  for (const t of monthRows) {
    if (t.type !== 'expense' || !countsAsFlow(t)) continue
    const key = t.category_id ?? '__none__'
    const e = catMap.get(key) ?? {
      name: t.category_name ?? 'Ohne Kategorie',
      color: t.category_color,
      total: 0,
    }
    e.total += t.amount
    catMap.set(key, e)
  }
  const topCategories = [...catMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)
  const catMax = topCategories[0]?.total ?? 0

  const usedCategoryIds = [...new Set(monthRows.map(t => t.category_id).filter(Boolean))] as string[]

  // Auswertungsteile brauchen genug Material. Ein Bausparvertrag mit vier Buchungen seit
  // 2018 bekäme sonst zwei leere Rahmen — dann lieber nichts zeigen.
  const showMonths     = months.length >= 2
  const showCategories = topCategories.length >= 2

  // ── Tabelle: filtern und sortieren ────────────────────────────────────────────
  const needle = (q ?? '').trim().toLowerCase()
  let tableRows = monthRows
  if (needle) {
    tableRows = tableRows.filter(t =>
      (t.description ?? '').toLowerCase().includes(needle) ||
      (t.merchant ?? '').toLowerCase().includes(needle))
  }
  if (cat) {
    tableRows = cat === 'none'
      ? tableRows.filter(t => t.category_id === null)
      : tableRows.filter(t => t.category_id === cat)
  }
  if (txtype) tableRows = tableRows.filter(t => t.type === txtype)

  // Nach Betrag sortieren heißt: nach Größe, nicht nach Vorzeichen. Eine Ausgabe von 700 EUR
  // und eine Einnahme von 700 EUR sind beide "groß" — wer die größten Posten sucht, will sie
  // beide oben sehen, nicht am jeweils anderen Ende der Liste.
  const [sortField, sortDir] = (sort ?? 'date-desc').split('-')
  tableRows = [...tableRows].sort((a, b) => {
    const cmp = sortField === 'amount'
      ? a.amount - b.amount
      : a.date.localeCompare(b.date)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const tableFiltered = Boolean(needle || cat || txtype)

  const allBalancePoints: AccountBalancePoint[] = balanceHistory.map(b => ({
    snapshot_date: b.snapshot_date,
    balance:       b.balance,
  }))
  const balancePoints = cutoff
    ? allBalancePoints.filter(b => b.snapshot_date >= cutoff)
    : allBalancePoints

  // Only fill in today's point from summed transactions when no real snapshot exists yet —
  // for a bank-linked account, today's account_balances row already holds the actual synced
  // bank balance (written by the fn_ensure_linked_account trigger), which is authoritative
  // and must not be overwritten by a client-computed sum.
  // Der Kontostand ist der letzte bekannte Saldo, NICHT income - expense: letzteres ist die
  // Bewegung im Zeitraum. Bei "3M" waeren das ein paar hundert Euro statt der 1.544,57, die
  // tatsaechlich auf dem Konto liegen.
  const currentBalance = allBalancePoints.at(-1)?.balance ?? net

  const todayBalStr = new Date().toISOString().split('T')[0]
  if (!allBalancePoints.some(p => p.snapshot_date === todayBalStr)) {
    // income - expense stammt aus dem gefilterten Fenster und waere als Kontostand falsch,
    // sobald ein Zeitraum aktiv ist. Nur brauchbar, wenn ohnehin die volle Historie zaehlt.
    balancePoints.push({
      snapshot_date: todayBalStr,
      balance: cutoff ? (balancePoints.at(-1)?.balance ?? 0) : income - expense,
    })
  }

  return (
    <UrlFiltersProvider>
    {/* Kein durchgaengiges space-y: die Seite hat drei Gruppen mit unterschiedlicher
        Naehe — Kopf (Zurueck, Titel, Aktionen), Steuerung (Zeitraum) und Inhalt. Ein
        einheitlicher Abstand laesst alles gleich wichtig aussehen. */}
    <div className="p-4 sm:p-8 flex flex-col gap-5">
      {/* Back link */}
      <Link
        href="/finance/accounts"
        className="-mb-2 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="size-4" />
        Alle Konten
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className="size-4 rounded-full shrink-0"
            style={{ backgroundColor: account.color ?? '#94a3b8' }}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {TYPE_LABELS[account.type] ?? account.type}
              {account.institution ? ` · ${account.institution}` : ''}
              {' · '}{currency}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportTransactionsButton accountId={id} />
          <ImportTransactionsDialog accountId={id} accountName={account.name} />
          <AddTransactionDialog
            accounts={accounts ?? []}
            categories={categories ?? []}
            defaultAccountId={id}
          />
        </div>
      </div>

      {/* Ein Zeitraum steuert Kennzahlen, Auswertung und Tabelle gemeinsam. Die Trennlinie
          macht sichtbar, dass alles DARUNTER daran haengt — der Kopf darueber nicht. */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <UrlPeriodSelector current={period} />
          {/* Ohne sichtbare Anzeige waere der Monatsfilter unsichtbar: man saehe nur, dass
              ploetzlich weniger Buchungen da sind, und suchte den Grund woanders. */}
          {monthLabel && <MonthChip label={monthLabel} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {monthRows.length} {monthRows.length === 1 ? 'Buchung' : 'Buchungen'}
          {monthLabel ? ` in ${monthLabel}` : ' im Zeitraum'}
        </p>
      </div>

      <FilterPending className="flex flex-col gap-6">
      {/* Kennzahlen: der Kontostand dominiert, die Bewegungsgroessen ordnen sich unter.
          Vorher standen alle drei als gleich grosse Kaertchen nebeneinander — der
          eigentliche Kontostand kam darin gar nicht vor. */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Kontostand
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(currentBalance, currency, locale)}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Metric label="Einnahmen" value={`+${formatCurrency(income, currency, locale)}`} className="text-success" />
            <Metric label="Ausgaben"  value={`−${formatCurrency(expense, currency, locale)}`} className="text-danger" />
            <Metric
              label="Netto"
              value={`${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net), currency, locale)}`}
              className={net >= 0 ? 'text-success' : 'text-danger'}
            />
          </div>
        </div>
      </div>

      {/* Kontostand-Verlauf */}
      <AccountBalanceChart points={balancePoints} period={period} currency={currency} color={account.color} />

      {/* Monatsvergleich und Kategorien — nur, wenn genug Material da ist. */}
      {(showMonths || showCategories) && (
        <div className={`grid gap-4 ${showMonths && showCategories ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
          {showMonths && (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Monat für Monat
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {months.length > 1 ? 'Monat anklicken zum Eingrenzen' : 'gestrichelt = Netto'}
                </span>
              </div>
              <AccountMonthChart data={months} currency={currency} selectedMonth={activeMonth} />
            </div>
          )}

          {showCategories && (
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Größte Ausgaben nach Kategorie
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {monthLabel ? monthLabel : 'ohne Umbuchungen'}
                </span>
              </div>
              <div className="space-y-2.5">
                {topCategories.map(c => (
                  <div key={c.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3">
                    <span className="truncate text-sm text-foreground">{c.name}</span>
                    <span className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${catMax ? Math.max(4, (c.total / catMax) * 100) : 0}%`,
                          backgroundColor: c.color ?? 'var(--chart-expense)',
                          opacity: c.color ? 1 : 0.75,
                        }}
                      />
                    </span>
                    <span className="text-sm tabular-nums text-danger">
                      −{formatCurrency(c.total, currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Buchungen */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">Buchungen</h2>
            {allRows.length > rows.length && (
              <span className="text-xs text-muted-foreground">
                {allRows.length} insgesamt auf diesem Konto
              </span>
            )}
          </div>
          <AccountTxToolbar
            categories={categories ?? []}
            usedCategoryIds={usedCategoryIds}
            shown={tableRows.length}
            total={monthRows.length}
          />
        </div>

        {tableRows.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-foreground">
              {allRows.length === 0
                ? 'Noch keine Transaktionen'
                : tableFiltered
                  ? 'Keine Treffer'
                  : 'Keine Buchungen in diesem Zeitraum'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {allRows.length === 0
                ? 'Erfasse die erste Transaktion für dieses Konto.'
                : tableFiltered
                  ? 'Passe Suche oder Filter an.'
                  : `Insgesamt ${allRows.length} Buchungen — wähle oben einen größeren Zeitraum.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <SortableHeader field="date" label="Datum" className="w-32" />
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kategorie</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Beschreibung</th>
                  <SortableHeader field="amount" label="Betrag" align="right" />
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tableRows.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} accounts={accounts ?? []} categories={categories ?? []} locale={locale} dateFormat={dateFormat} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </FilterPending>
    </div>
    </UrlFiltersProvider>
  )
}

/** Bewegungsgroesse neben dem Kontostand — kleiner gesetzt, weil sie ihm untergeordnet ist. */
function Metric({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  )
}

function TransactionRow({ tx, accounts, categories, locale, dateFormat }: { tx: UnifiedRow; accounts: Account[]; categories: Category[]; locale: string; dateFormat: string }) {
  const { sign, display, net } = formatAmount(tx.signed_amount, tx.amount, tx.currency, locale)
  const isTransfer = tx.type === 'transfer'
  const amountColor =
    isTransfer ? 'text-muted-foreground'
    : net > 0 ? 'text-success'
    : net < 0 ? 'text-danger'
    : 'text-foreground'

  return (
    <tr className="group hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(tx.date, dateFormat)}</td>
      <td className="px-4 py-3">
        <TransactionCategorySelect
          tx={{ id: tx.id, category_id: tx.category_id, source: tx.source, category_source: tx.category_source, ai_category_id: tx.ai_category_id }}
          categories={categories}
        />
      </td>
      <td className="px-4 py-3 max-w-xs">
        <TransactionDescriptionCell
          merchant={tx.merchant}
          description={tx.description}
          badge={
            isTransfer && (
              <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Umbuchung
              </span>
            )
          }
        />
      </td>
      <td className={`px-4 py-3 text-right font-medium tabular-nums ${amountColor}`}>
        {sign}{display}
      </td>
      <td className="px-2 py-3">
        {tx.source === 'bank_sync' ? (
          <span className="flex items-center justify-end" title="Automatisch aus Banking synchronisiert">
            <Landmark className="size-3.5 text-muted-foreground" />
          </span>
        ) : (
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <EditTransactionDialog tx={tx as unknown as TxRow} accounts={accounts} categories={categories} />
            <DeleteTransactionButton tx={tx as unknown as TxRow} />
          </span>
        )}
      </td>
    </tr>
  )
}
