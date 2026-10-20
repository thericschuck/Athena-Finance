import { getAuthUser } from '@/lib/supabase/server'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { AddAccountDialog, EditAccountDialog, DeleteAccountButton } from '@/components/finance/account-form'
import {
  getAccounts,
  getManualBalanceSums,
  getBankBalances,
  type AccountRow as Account,
} from '@/lib/data/finance-accounts'
import { getSettings } from '@/lib/settings'
import { fmtCurrency } from '@/lib/format'
import { getDepotsSummaries } from '@/app/actions/depot'
import type { DepotWithSummary } from '@/app/actions/depot'
import { UrlFiltersProvider, FilterPending } from '@/components/providers/url-filters'
import { UrlPeriodSelector } from '@/components/ui/period-selector'
import { AccountSparkline } from '@/components/finance/account-sparkline'
import { BankSyncPanel } from '@/components/bank/bank-sync-panel'
import { SyncedHoldingsSection } from '@/components/bank/synced-holdings-section'
import { parsePeriod, periodCutoff, type Period } from '@/lib/period'
import { fetchBalanceHistory } from '@/lib/account-history'
import { computeAccountBalances } from '@/lib/finance/dashboard-calc'

/**
 * Saldenverlauf eines Kontos im gewaehlten Zeitraum. `first`/`last` mitgefuehrt, weil die
 * Sparkline ihre Punkte immer ueber die volle Breite streckt: ein Konto mit sechs Wochen
 * Historie sieht bei „1J" genauso breit aus wie eines mit zwoelf Monaten. Der abgedeckte
 * Zeitraum steht deshalb im Tooltip, statt die Kurve stillschweigend passend zu machen.
 */
interface AccountHistory {
  values: number[]
  first:  string
  last:   string
}

const TYPE_LABELS: Record<string, string> = {
  checking:         'Girokonto',
  savings:          'Sparkonto',
  building_savings: 'Bausparvertrag',
  investment:       'Depot',
  crypto:           'Krypto',
  cash:             'Bargeld',
  credit:           'Kreditkarte',
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const [{ period: rawPeriod }, { supabase, user }] = await Promise.all([
    searchParams,
    getAuthUser(),
  ])

  const period: Period = parsePeriod(rawPeriod)
  const cutoff = periodCutoff(period)

  const [accounts, transactions, bankBalances, settings, depots] = await Promise.all([
    getAccounts(supabase, user!.id),
    getManualBalanceSums(supabase, user!.id),
    getBankBalances(supabase, user!.id),
    getSettings(user!.id),
    getDepotsSummaries(),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'

  // Verlauf je Konto für die Sparklines. Eigene Query statt eines Joins über `accounts`,
  // weil die Zeilenzahl hier vom Zeitraum abhängt und nicht von der Kontenzahl — bei
  // „Alles" reicht ein Konto (Geschäftsanteile) bis 2018 zurück. Seitenweise, weil das
  // die 1.000-Zeilen-Grenze von PostgREST sonst still am jüngsten Ende abschneidet
  // (Begründung samt Zahlen in `fetchBalanceHistory`).
  const history = await fetchBalanceHistory(supabase, { from: cutoff })

  const historyMap = new Map<string, AccountHistory>()
  for (const row of history) {
    const entry = historyMap.get(row.account_id)
    if (entry) {
      entry.values.push(row.balance)
      entry.last = row.snapshot_date
    } else {
      historyMap.set(row.account_id, {
        values: [row.balance],
        first:  row.snapshot_date,
        last:   row.snapshot_date,
      })
    }
  }

  // Compute balance per account from manually-entered transactions — used for accounts that
  // aren't linked to a synced bank account.
  // For accounts linked via accounts.bank_iban (see migration 20260821010000), the synced
  // bank_balance is the real, live balance — it wins over the summed local transactions.
  // Die Summe je Konto rechnet die DB (View account_balance_sums_manual).
  const bankBalanceByIban = new Map((bankBalances ?? []).map(b => [b.account_iban, b.booked_balance]))
  const balanceMap = computeAccountBalances(accounts ?? [], transactions, bankBalanceByIban)

  return (
    <UrlFiltersProvider>
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Konten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Verwalte deine Bankkonten und Depots
          </p>
        </div>
        <div className="flex items-start gap-3 flex-wrap justify-end">
          {/* Steuert nur den Verlauf; der Kontostand rechts ist immer der aktuelle. */}
          <UrlPeriodSelector current={period} />
          <AddAccountDialog />
          {/* Der FinTS-Sync. Lag bis zum Wegfall des Hauptpunkts „Banking" auf einer
              eigenen Seite — für verknüpfte Konten ist der gesyncte Saldo aber schon der
              Kontostand in der Tabelle unten, der Knopf gehört also hierher. */}
          <BankSyncPanel />
        </div>
      </div>

      {/* Table */}
      {!accounts || accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <FilterPending>
          <AccountTable
            accounts={accounts}
            balanceMap={balanceMap}
            historyMap={historyMap}
            locale={locale}
          />
        </FilterPending>
      )}

      {/* Depot cards */}
      {depots.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Depots</h2>
          {depots.map(d => (
            <DepotCard key={d.id} depot={d} locale={locale} />
          ))}
        </div>
      )}

      {/* Über FinTS mitgelieferte Fondsbestände (Union Investment o.ä.) — sonst nirgends
          zu sehen, und der richtige Nachbar der Depots. */}
      <SyncedHoldingsSection />
    </div>
    </UrlFiltersProvider>
  )
}

function AccountTable({ accounts, balanceMap, historyMap, locale }: {
  accounts: Account[]
  balanceMap: Map<string, number>
  historyMap: Map<string, AccountHistory>
  locale: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Institution</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Währung</th>
            <th className="px-4 py-3 text-center font-medium text-muted-foreground hidden md:table-cell">Verlauf</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Kontostand</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              balance={balanceMap.get(account.id) ?? null}
              history={historyMap.get(account.id) ?? null}
              locale={locale}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AccountRow({ account, balance, history, locale }: {
  account: Account
  balance: number | null
  history: AccountHistory | null
  locale: string
}) {
  const values = history?.values ?? []
  // Veränderung über den gewählten Zeitraum. Ohne diese Zahl ist die Sparkline nur eine
  // Form ohne Maßstab — man sieht, DASS es hoch ging, aber nicht um wie viel.
  const delta = values.length >= 2 ? values[values.length - 1] - values[0] : null

  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale)
  // Reicht die Historie nicht über den ganzen Zeitraum, wird trotzdem gezeigt was da ist —
  // der Tooltip nennt dann den tatsächlich abgedeckten Ausschnitt.
  const rangeLabel = history && values.length >= 2
    ? `Verlauf ${fmtDay(history.first)} – ${fmtDay(history.last)}`
    : undefined

  return (
    <tr className="hover:bg-muted/30 transition-colors group">
      {/* Name + color dot */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{ backgroundColor: account.color ?? '#94a3b8' }}
          />
          <Link
              href={`/finance/accounts/${account.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {account.name}
            </Link>
            {account.bank_iban && (
              // Kein Link mehr: das Ziel war die Banking-Seite, und die gibt es nicht mehr —
              // der Sync steht oben im Kopf dieser Seite. Bleibt als Merkmal „der Saldo
              // rechts kommt per FinTS von der Bank, nicht aus manuellen Buchungen".
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                title={`Per FinTS synchronisiert · ${account.bank_iban}`}
              >
                <Landmark className="size-2.5" />
                Bank
              </span>
            )}
        </div>
      </td>

      {/* Typ */}
      <td className="px-4 py-3 text-muted-foreground">
        {TYPE_LABELS[account.type] ?? account.type}
      </td>

      {/* Institution */}
      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
        {account.institution ?? '—'}
      </td>

      {/* Währung */}
      <td className="px-4 py-3">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
          {account.currency}
        </span>
      </td>

      {/* Verlauf */}
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="flex items-center justify-center gap-2" title={rangeLabel}>
          <AccountSparkline
            values={values}
            color={account.color}
            uid={account.id}
            className="text-muted-foreground"
          />
          {delta !== null && (
            <span
              className={`text-[11px] tabular-nums ${
                delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {fmtCurrency(delta, account.currency, locale, { fractionDigits: 0 })}
            </span>
          )}
        </div>
      </td>

      {/* Kontostand */}
      <td className="px-4 py-3 text-right tabular-nums">
        {balance === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={balance < 0 ? 'text-danger' : ''}>
            {['BTC', 'ETH'].includes(account.currency)
              ? `${balance.toFixed(6)} ${account.currency}`
              : fmtCurrency(balance, account.currency, locale, { fractionDigits: 2 })}
          </span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            account.is_active
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {account.is_active ? 'Aktiv' : 'Inaktiv'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <EditAccountDialog account={account} />
          <DeleteAccountButton account={account} />
        </div>
      </td>
    </tr>
  )
}

function DepotCard({ depot, locale }: { depot: DepotWithSummary; locale: string }) {
  return (
    <Link href="/depot" className="block">
      <div className="rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3">
          {/* Gedämpftes Perlblau statt sattem Tailwind-Blau (#3b82f6) — passt zur warmen
              Athena-Erdtonpalette, statt wie ein generischer Fremdkörper draufgeklatscht zu
              wirken. Der helle Rand gibt dem Punkt den "Perlmutt"-Anklang. */}
          <span
            className="size-2.5 rounded-full shrink-0 border border-white/50"
            style={{ backgroundColor: '#8FAEC2' }}
          />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{depot.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{depot.isin}</p>
          </div>
          <div className="ml-auto text-right shrink-0">
            <p className="font-medium text-foreground tabular-nums">
              {depot.depotValue !== null
                ? fmtCurrency(depot.depotValue, 'EUR', locale, { fractionDigits: 2 })
                : '–'}
            </p>
            {depot.returnPct !== null && (
              <p className="text-xs tabular-nums" style={{ color: depot.returnPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {depot.returnPct >= 0 ? '+' : ''}{depot.returnPct.toFixed(2)} %
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Konten</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Füge dein erstes Konto hinzu, um loszulegen.
      </p>
    </div>
  )
}
