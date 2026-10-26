import { Landmark } from 'lucide-react'
import {
  DeleteTransactionButton,
  EditTransactionDialog,
  TransactionCategorySelect,
  TransactionDescriptionCell,
} from '@/components/finance/transaction-form'
import { SortableHeader } from '@/components/finance/account-tx-toolbar'
import type { AccountOptionRow } from '@/lib/data/finance-accounts'
import type { AccountTransactionRow, CategoryOptionRow } from '@/lib/data/finance-transactions'
import { fmtDate } from '@/lib/format'
import type { Database } from '@/types/database'
import { formatBuchung } from './format'

type TxRow = Database['public']['Tables']['transactions']['Row']

/**
 * Buchungen der aktuellen Seite. Eine Struktur für beide Größen (kein doppeltes Rendern, damit
 * Kategorie-Auswahl und Dialoge nur einmal im DOM stehen):
 *  - Desktop (md+): Raster mit fünf Spalten Datum | Kategorie | Beschreibung | Betrag | Aktionen.
 *  - Mobil: Kartenzeile. Zeile 1 Beschreibung + Betrag rechts, Zeile 2 Datum, Kategorie,
 *    Umbuchungs-Marke und Aktionen. Der Wrapper der zweiten Zeile ist ab md `display: contents`,
 *    seine Kinder besetzen dann die Spalten des Rasters.
 *
 * Server-Komponente; Aktionen sind mobil immer sichtbar, am Desktop bei Hover oder Fokus.
 */

const SPALTEN = 'md:grid-cols-[6.5rem_minmax(0,14rem)_minmax(0,1fr)_9rem_5rem]'

function UmbuchungsMarke({ className }: { className: string }) {
  return (
    <span className={`shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ${className}`}>
      Umbuchung
    </span>
  )
}

export function BuchungenListe({
  zeilen, accounts, categories, locale, dateFormat,
}: {
  zeilen: AccountTransactionRow[]
  accounts: AccountOptionRow[]
  categories: CategoryOptionRow[]
  locale: string
  dateFormat: string
}) {
  return (
    <div role="table" aria-label="Buchungen">
      <div
        role="row"
        className={`hidden gap-x-4 border-b border-border bg-muted/40 px-4 py-3 text-sm md:grid ${SPALTEN}`}
      >
        <SortableHeader field="date" label="Datum" />
        <div role="columnheader" className="font-medium text-muted-foreground">Kategorie</div>
        <div role="columnheader" className="font-medium text-muted-foreground">Beschreibung</div>
        <SortableHeader field="amount" label="Betrag" align="right" />
        <div role="columnheader" className="sr-only">Aktionen</div>
      </div>

      <div role="rowgroup" className="divide-y divide-border">
        {zeilen.map(tx => {
          const { sign, display, net } = formatBuchung(tx.signed_amount, tx.amount, tx.currency, locale)
          const istUmbuchung = tx.type === 'transfer'
          const betragFarbe =
            istUmbuchung ? 'text-muted-foreground'
            : net > 0 ? 'text-success'
            : net < 0 ? 'text-danger'
            : 'text-foreground'

          return (
            <div
              key={tx.id}
              role="row"
              className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-muted/30 md:gap-x-4 ${SPALTEN}`}
            >
              <div role="cell" className="min-w-0 md:col-start-3 md:row-start-1">
                <TransactionDescriptionCell
                  merchant={tx.merchant}
                  description={tx.description}
                  badge={istUmbuchung && <UmbuchungsMarke className="hidden md:inline-flex" />}
                />
              </div>

              <div
                role="cell"
                className={`self-start whitespace-nowrap text-right text-sm font-medium tabular-nums md:col-start-4 md:row-start-1 md:self-center ${betragFarbe}`}
              >
                {sign}{display}
              </div>

              <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 md:contents">
                <span role="cell" className="text-xs tabular-nums text-muted-foreground md:col-start-1 md:row-start-1 md:text-sm">
                  {fmtDate(tx.date, dateFormat)}
                </span>
                <div role="cell" className="min-w-0 md:col-start-2 md:row-start-1">
                  <TransactionCategorySelect
                    tx={{
                      id: tx.id,
                      category_id: tx.category_id,
                      source: tx.source,
                      category_source: tx.category_source,
                      ai_category_id: tx.ai_category_id,
                    }}
                    categories={categories}
                  />
                </div>
                {istUmbuchung && <UmbuchungsMarke className="md:hidden" />}
                <div
                  role="cell"
                  className="ml-auto flex items-center justify-end md:col-start-5 md:row-start-1"
                >
                  {tx.source === 'bank_sync' ? (
                    <span
                      className="flex size-10 items-center justify-center md:size-8"
                      title="Automatisch aus Banking synchronisiert"
                    >
                      <Landmark className="size-3.5 text-muted-foreground" aria-label="Aus Banking synchronisiert" />
                    </span>
                  ) : (
                    // Mobil immer sichtbar (kein Hover am Handy), am Desktop bei Hover oder Tastaturfokus.
                    <span className="flex items-center gap-0.5 opacity-100 transition-opacity max-md:[&_button]:size-10 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                      {/* Die Dialoge erwarten die Zeile der Tabelle `transactions`; die View liefert dieselben Spalten. */}
                      <EditTransactionDialog tx={tx as unknown as TxRow} accounts={accounts} categories={categories} />
                      <DeleteTransactionButton tx={tx as unknown as TxRow} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
