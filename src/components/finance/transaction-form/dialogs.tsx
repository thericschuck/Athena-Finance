'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/app/(dashboard)/finance/(transaktionen)/transactions/actions'
import { fmtDate } from '@/lib/format'
import { artAusTyp, betragFuerFeld, heuteBerlin } from '@/lib/transaktionen/formular'
import { BuchungsFormular, type BuchungsStart } from './buchungs-formular'
import { currencyForAccount } from './parts'
import type { Account, Category, Debt, TxRow } from './parts'

interface AddTransactionDialogProps {
  accounts: Account[]
  categories: Category[]
  defaultAccountId?: string
  /** Aktive Schulden + die ID der Kategorie "Schulden" -- fuer den Vorschlag nach dem Speichern,
   * siehe DebtSuggestion. Ohne schuldenCategoryId bleibt der Vorschlag stumm. */
  debts?: Debt[]
  schuldenCategoryId?: string | null
}

export function AddTransactionDialog({
  accounts,
  categories,
  defaultAccountId,
  debts = [],
  schuldenCategoryId = null,
}: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 md:h-8">
          <Plus className="size-4" />
          Transaktion erfassen
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-lg sm:p-6"
        // Autofokus auf den Betrag nur mit feinem Zeiger (Maus): am Handy würde er sofort die Tastatur
        // aufklappen und die Hälfte des Formulars verdecken.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (window.matchMedia('(pointer: fine)').matches) document.getElementById('tx-amount')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Neue Transaktion</DialogTitle>
          <DialogDescription className="sr-only">Ausgabe, Einnahme oder Umbuchung erfassen</DialogDescription>
        </DialogHeader>
        {/* Der Inhalt hängt nur im geöffneten Dialog: jedes Öffnen beginnt mit frischem Zustand
            (Datum heute in Berliner Zeit, Konto, keine alte Fehlermeldung). */}
        <BuchungsFormular
          start={neuerStart(accounts, defaultAccountId)}
          accounts={accounts}
          categories={categories}
          action={createTransaction}
          debts={debts}
          schuldenCategoryId={schuldenCategoryId}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function neuerStart(accounts: Account[], defaultAccountId?: string): BuchungsStart {
  // Kein Raten: ohne Vorgabe nur dann ein Konto, wenn es das einzige ist.
  const accountId = defaultAccountId ?? (accounts.length === 1 ? accounts[0].id : '')
  return {
    art: 'expense',
    betragText: '',
    date: heuteBerlin(),
    accountId,
    currency: currencyForAccount(accountId, accounts),
    transferTo: '',
    categoryId: '',
    merchant: '',
    description: '',
  }
}

export function EditTransactionDialog({
  tx,
  accounts,
  categories,
  debts = [],
  schuldenCategoryId = null,
}: {
  tx: TxRow
  accounts: Account[]
  categories: Category[]
  debts?: Debt[]
  schuldenCategoryId?: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 md:size-8"
          aria-label="Transaktion bearbeiten"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Transaktion bearbeiten</DialogTitle>
          <DialogDescription className="sr-only">Betrag, Datum, Konto und Kategorie ändern</DialogDescription>
        </DialogHeader>
        {/* Frisch bei jedem Öffnen aus den aktuellen Daten der Zeile (kein veralteter Stand nach einer früheren Änderung). */}
        <BuchungsFormular
          start={{
            art: artAusTyp(tx.type),
            betragText: betragFuerFeld(tx.amount),
            date: tx.date,
            accountId: tx.account_id,
            currency: tx.currency,
            transferTo: tx.transfer_to ?? '',
            categoryId: tx.category_id ?? '',
            merchant: tx.merchant ?? '',
            description: tx.description ?? '',
          }}
          accounts={accounts}
          categories={categories}
          action={updateTransaction}
          buchungId={tx.id}
          debts={debts}
          schuldenCategoryId={schuldenCategoryId}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

export function DeleteTransactionButton({ tx }: { tx: TxRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTransaction(tx.id)
      if (result.error) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  const wer = tx.merchant || tx.description
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-10 text-muted-foreground hover:text-destructive md:size-8"
        aria-label="Transaktion löschen"
        onClick={() => { setError(null); setOpen(true) }}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => { if (!isPending) setOpen(o) }}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Transaktion löschen?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {wer ? `„${wer}“ ` : 'Diese Buchung '}vom {fmtDate(tx.date)} wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="px-1 text-sm text-destructive" role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending} className="h-10 md:h-9">Abbrechen</AlertDialogCancel>
            {/* Kein AlertDialogAction: der schließt den Dialog sofort, ein Fehler bliebe unsichtbar. */}
            <Button variant="destructive" className="h-10 md:h-9" onClick={handleDelete} disabled={isPending}>
              {isPending ? 'Wird gelöscht…' : 'Löschen'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
