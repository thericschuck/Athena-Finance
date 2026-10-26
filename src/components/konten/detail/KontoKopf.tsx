import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import {
  AddTransactionDialog,
} from '@/components/finance/transaction-form'
import { ExportTransactionsButton, ImportTransactionsDialog } from '@/components/finance/transaction-csv'
import { SaldoSetzenDialog } from '@/components/konten/SaldoSetzenDialog'
import type { KontoDetailDaten } from '@/lib/data/konto-detail'
import { TYP_LABELS } from '@/lib/konten/berechnen'

/**
 * Kopf der Konto-Detailseite: Zurück-Link, Farbpunkt, Name, Zeile Typ · Institution · Währung und
 * die Aktionen.
 *
 * Aktionen ohne Popover: Add/Import sind Dialoge, die beim Schließen eines Menü-Popovers mit
 * verschwänden. Mobil steht „Buchung hinzufügen“ volle Breite oben, darunter Export/Import (und bei
 * manuellen Konten „Saldo setzen“) in einem 2er-Raster; die Knöpfe der Fremdkomponenten werden per
 * Variantenselektor auf Breite und 40 px Höhe gezogen. Ab sm eine Reihe, primärer Knopf rechts.
 */
export function KontoKopf({
  daten, kontostand,
}: {
  daten: KontoDetailDaten
  kontostand: number
}) {
  const { account, accounts, categories, locale } = daten
  const manuell = !account.bank_iban

  // Fremde Trigger-Buttons: mobil volle Breite und mind. 40 px hoch.
  const mobilKnopf = 'max-sm:[&_a]:block max-sm:[&_button]:min-h-10 max-sm:[&_button]:w-full'

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/finance/accounts"
        className="-mb-1 inline-flex min-h-10 w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
      >
        <ChevronLeft className="size-4" />
        Alle Konten
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="size-4 shrink-0 rounded-full"
            style={{ backgroundColor: account.color ?? 'var(--muted-foreground)' }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{account.name}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {TYP_LABELS[account.type] ?? account.type}
              {account.institution ? ` · ${account.institution}` : ''}
              {' · '}{account.currency}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:items-center sm:justify-end">
          <div className={`col-span-2 order-first sm:order-last sm:col-auto ${mobilKnopf}`}>
            <AddTransactionDialog
              accounts={accounts ?? []}
              categories={categories ?? []}
              defaultAccountId={account.id}
            />
          </div>
          <div className={mobilKnopf}>
            <ExportTransactionsButton accountId={account.id} />
          </div>
          <div className={mobilKnopf}>
            <ImportTransactionsDialog accountId={account.id} accountName={account.name} />
          </div>
          {manuell && (
            <div className={`col-span-2 empty:hidden sm:col-auto ${mobilKnopf}`}>
              <SaldoSetzenDialog
                kontoId={account.id}
                name={account.name}
                aktuell={kontostand}
                waehrung={account.currency}
                locale={locale}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
