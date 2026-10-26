'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AddDebtDialog, DebtPaymentDialog } from '@/components/finance/debt-payment-form'
import { matchDebtForText } from '@/lib/finance/schulden-match'
import type { DebtRow } from '@/lib/data/finance-planning'

type Debt = DebtRow

interface DebtSuggestionProps {
  transactionId: string
  source: 'manual' | 'bank_sync'
  /** Vorzeichenlos. */
  amount: number
  date: string
  description: string | null
  merchant: string | null
  direction: 'expense' | 'income' | 'transfer'
  debts: Debt[]
  /** Zahlung verbucht oder neue Schuld angelegt -- Elternkomponente kann z.B. den Dialog schliessen. */
  onHandled?: () => void
}

/**
 * Vorschlag, der neben der Kategorie-Auswahl auftaucht, sobald eine Buchung auf "Schulden"
 * gesetzt wird: entweder verbindet sie sich mit einer bestehenden Schuld (automatischer
 * Name/Glaeubiger-Abgleich, siehe matchDebtForText) oder wird zur neuen Schuld. Beides bleibt
 * ein Vorschlag -- ausgefuehrt wird nur ueber die bestehenden Dialoge (AddDebtDialog,
 * DebtPaymentDialog), also erst nach explizitem Klick auf "Anlegen"/"Zahlung buchen".
 */
export function DebtSuggestion({
  transactionId,
  source,
  amount,
  date,
  description,
  merchant,
  direction,
  debts,
  onHandled,
}: DebtSuggestionProps) {
  const aktive = debts.filter(d => d.is_active)
  const text = `${merchant ?? ''} ${description ?? ''}`.trim()
  const treffer = matchDebtForText(text, aktive)

  const [dismissed, setDismissed] = useState(false)
  const [selectedId, setSelectedId] = useState(treffer?.id ?? '')

  if (dismissed) return null

  const selectedDebt = aktive.find(d => d.id === selectedId) ?? null
  const name = (merchant ?? description ?? '').trim() || undefined

  function handled() {
    setDismissed(true)
    onHandled?.()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-foreground">
          {treffer
            ? <>Passt vermutlich zu <strong>„{treffer.name}“</strong> — als Zahlung verbuchen?</>
            : 'Als Schulden kategorisiert. Gehört das zu einer bestehenden Schuld — oder ist es eine neue?'}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="-m-2 flex size-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground md:m-0 md:size-6"
          aria-label="Vorschlag verwerfen"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {!treffer && aktive.length > 0 && (
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger size="sm" className="h-10 text-base md:h-7 md:text-xs">
            <SelectValue placeholder="Bestehende Schuld wählen…" />
          </SelectTrigger>
          <SelectContent>
            {aktive.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {selectedDebt && (
          <DebtPaymentDialog
            debt={selectedDebt}
            defaultAmount={amount}
            defaultDate={date}
            sourceTransaction={{ id: transactionId, source }}
            onRecorded={handled}
            trigger={
              <Button type="button" variant="outline" size="sm" className="h-10 px-3 text-xs md:h-7 md:px-2">
                Zahlung verbuchen
              </Button>
            }
          />
        )}
        <AddDebtDialog
          defaultValues={{
            name,
            creditor: merchant ?? undefined,
            original_amount: amount,
            // Eingehendes Geld, das als "Schulden" markiert ist: vermutlich ein Kredit, den
            // ich bekommen habe (ich schulde). Ausgehendes Geld: vermutlich Geld, das ich
            // verleihe (mir wird geschuldet). Nur ein Startwert -- im Dialog aenderbar.
            type: direction === 'income' ? 'borrowed' : 'lent',
          }}
          onCreated={handled}
          trigger={
            <Button type="button" variant="ghost" size="sm" className="h-10 px-3 text-xs md:h-7 md:px-2">
              Neue Schuld anlegen
            </Button>
          }
        />
      </div>
    </div>
  )
}
