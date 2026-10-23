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
import { parteiVon } from '@/lib/analyse/gegenparteien'
import { ART_LABEL, QUELLE_LABEL, STEUERROLLE_LABEL, vorzeichen, type AnalyseBuchung } from '@/lib/analyse/buchungen'

function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-border py-2 text-sm last:border-b-0 sm:grid-cols-[120px_1fr]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const leer = <span className="text-muted-foreground">—</span>

/**
 * Detailansicht einer Buchung der Analyse-Seite. Zeigt auch, was die Liste auslaesst: Konto,
 * Quelle, Buchungsart und Steuerrolle — also die Stellen, an denen man nachsieht, warum eine
 * Buchung in einer Auswertung auftaucht (oder nicht). Nur lesend: Kategorien werden auf der
 * Bankdaten- bzw. Transaktionen-Seite geaendert.
 */
export function AnalyseBuchungDetail({
  tx, onClose, locale, dateFormat, kontoName,
}: {
  tx: AnalyseBuchung | null
  onClose: () => void
  locale: string
  dateFormat: string
  /** Name des Kontos der Buchung (aus daten.konten), null = unbekannt. */
  kontoName: string | null
}) {
  return (
    <Sheet open={tx !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {tx && (
          <>
            <SheetHeader>
              <SheetTitle>{parteiVon(tx)}</SheetTitle>
              <SheetDescription>
                <span className={`text-lg font-semibold tabular-nums ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                  {tx.type === 'income' ? '+' : '−'}{fmtCurrency(Math.abs(vorzeichen(tx)), 'EUR', locale, { fractionDigits: 2 })}
                </span>
                {tx.flow_kind !== 'echt' && ` · ${ART_LABEL[tx.flow_kind] ?? tx.flow_kind}`}
              </SheetDescription>
            </SheetHeader>

            <dl className="px-4 pb-6">
              <Feld label="Datum">{fmtDate(tx.date, dateFormat)}</Feld>
              <Feld label="Art">{tx.type === 'income' ? 'Einnahme' : 'Ausgabe'}</Feld>
              <Feld label="Kategorie">
                {tx.category_name ?? <span className="text-muted-foreground">Ohne Kategorie</span>}
                {tx.root_category_name && tx.root_category_name !== tx.category_name && (
                  <span className="block text-xs text-muted-foreground">in {tx.root_category_name}</span>
                )}
              </Feld>
              <Feld label="Gegenpartei">{tx.merchant ?? leer}</Feld>
              <Feld label="Verwendungszweck">
                {tx.description ? <span className="whitespace-pre-wrap">{tx.description}</span> : leer}
              </Feld>
              <Feld label="Konto">{kontoName ?? leer}</Feld>
              <Feld label="Quelle">{QUELLE_LABEL[tx.source] ?? tx.source}</Feld>
              <Feld label="Buchungsart">{ART_LABEL[tx.flow_kind] ?? tx.flow_kind}</Feld>
              <Feld label="Steuerrolle">
                {tx.tax_role ? STEUERROLLE_LABEL[tx.tax_role] ?? tx.tax_role : leer}
              </Feld>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
