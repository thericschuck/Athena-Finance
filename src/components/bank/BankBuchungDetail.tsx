'use client'

import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { KategorieZelle, type KategorieOption } from './BankBuchungKategorie'
import type { BankTransaction, FinanceCategory } from '@/types/bank'

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const leer = <span className="text-muted-foreground">—</span>

/**
 * Detailansicht einer Buchung. Zeigt auch, was die Liste auslaesst: den Rohtext der Bank
 * (raw_description), die Bank-Referenz, BIC/IBAN der Gegenpartei und beide Daten. Das ist die
 * Stelle, an der man nachsieht, warum eine Buchung so kategorisiert wurde.
 */
export function BankBuchungDetail({
  tx, onClose, umbuchung, locale, dateFormat, kategorien, optionen, onKategorie, speichert,
}: {
  tx: BankTransaction | null
  onClose: () => void
  umbuchung: boolean
  locale: string
  dateFormat: string
  kategorien: ReadonlyMap<string, FinanceCategory>
  optionen: KategorieOption[]
  onKategorie: (id: string, categoryId: string | null) => void
  speichert: boolean
}) {
  return (
    <Sheet open={tx !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {tx && (
          <>
            <SheetHeader>
              <SheetTitle>{tx.counterpart_name ?? 'Buchung'}</SheetTitle>
              <SheetDescription>
                <span className={`text-lg font-semibold tabular-nums ${
                  umbuchung ? 'text-muted-foreground' : tx.amount >= 0 ? 'text-success' : 'text-danger'
                }`}>
                  {tx.amount >= 0 ? '+' : ''}{fmtCurrency(tx.amount, tx.currency || 'EUR', locale, { fractionDigits: 2 })}
                </span>
                {umbuchung && ' · Umbuchung zwischen eigenen Konten'}
              </SheetDescription>
            </SheetHeader>

            <dl className="px-4 pb-6">
              <Feld label="Kategorie">
                <KategorieZelle
                  wert={tx.category_id}
                  kategorien={kategorien}
                  optionen={optionen}
                  onChange={c => onKategorie(tx.id, c)}
                  disabled={speichert}
                />
              </Feld>
              <Feld label="Wertstellung">{fmtDate(tx.value_date, dateFormat)}</Feld>
              <Feld label="Buchungsdatum">{tx.entry_date ? fmtDate(tx.entry_date, dateFormat) : leer}</Feld>
              <Feld label="Verwendungszweck">
                {tx.description ? <span className="whitespace-pre-wrap">{tx.description}</span> : leer}
              </Feld>
              <Feld label="Rohtext der Bank">
                {tx.raw_description ? (
                  <span className="whitespace-pre-wrap font-mono text-xs">{tx.raw_description}</span>
                ) : leer}
              </Feld>
              <Feld label="Gegenpartei">{tx.counterpart_name ?? leer}</Feld>
              <Feld label="Gegen-IBAN">
                {tx.counterpart_iban ? <span className="font-mono text-xs">{tx.counterpart_iban}</span> : leer}
              </Feld>
              <Feld label="Gegen-BIC">
                {tx.counterpart_bic ? <span className="font-mono text-xs">{tx.counterpart_bic}</span> : leer}
              </Feld>
              <Feld label="Konto">
                <span className="font-mono text-xs">{tx.account_iban}</span>
                {tx.account_bic && <span className="ml-2 font-mono text-xs text-muted-foreground">{tx.account_bic}</span>}
                {tx.bank_label && <span className="block text-xs text-muted-foreground">{tx.bank_label}</span>}
              </Feld>
              <Feld label="Bank-Referenz">
                {tx.bank_reference ? <span className="font-mono text-xs">{tx.bank_reference}</span> : leer}
              </Feld>
              <Feld label="Externe ID">
                {tx.external_id ? <span className="font-mono text-xs">{tx.external_id}</span> : leer}
              </Feld>
              <Feld label="Importiert">{fmtDate(tx.created_at, dateFormat)}</Feld>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
