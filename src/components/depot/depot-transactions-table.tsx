'use client'

// Transactions table split out of DepotDashboard.tsx — a self-contained,
// low-risk extraction that shrinks the parent component (react-doctor/no-giant-component).

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'
import type { DepotTransaction } from '@/app/actions/depot'

function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtShares(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function DepotTransactionsTable({
  transactions, onDelete,
}: {
  transactions: DepotTransaction[]
  onDelete: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-xs">
            <th className="text-left px-5 py-2 font-medium">Datum</th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Typ</th>
            <th className="text-right px-3 py-2 font-medium">Betrag</th>
            <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Kurs</th>
            <th className="text-right px-3 py-2 font-medium">Anteile</th>
            <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Notiz</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => {
            const typeLabel = tx.transaction_type === 'initial' ? 'Bestand' : tx.transaction_type === 'savings_plan' ? 'Sparplan' : 'Kauf'
            const typeColor = tx.transaction_type === 'initial' ? 'text-warning' : tx.transaction_type === 'savings_plan' ? 'text-primary' : 'text-success'
            return (
              <tr key={tx.id} className="group border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-5 py-2.5 text-foreground whitespace-nowrap">{fmtDate(tx.transaction_date)}</td>
                <td className={`px-3 py-2.5 text-xs hidden sm:table-cell whitespace-nowrap ${typeColor}`}>{typeLabel}</td>
                <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">{fmtEur(tx.amount_eur)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                  {tx.price_per_share.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                </td>
                <td className="px-3 py-2.5 text-right text-primary font-mono whitespace-nowrap">
                  {fmtShares(tx.shares)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell max-w-[120px] truncate">
                  {tx.notes ?? '–'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        aria-label="Transaktion löschen"
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-card border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">Transaktion löschen?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                          Transaktion vom {fmtDate(tx.transaction_date)} über {fmtEur(tx.amount_eur)} wird dauerhaft gelöscht.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-border text-foreground bg-transparent hover:bg-muted">Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(tx.id)}
                          className="bg-destructive hover:bg-destructive/90 text-white border-0">Löschen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
