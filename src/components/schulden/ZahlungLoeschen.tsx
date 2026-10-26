'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deletePayment } from '@/app/(dashboard)/finance/(planung)/debts/actions'

/** Nimmt eine versehentlich erfasste Zahlung zurück; die Tilgung kommt zur Restschuld zurück. */
export function ZahlungLoeschen({ paymentId, beschreibung }: { paymentId: string; beschreibung: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function loeschen() {
    startTransition(async () => {
      const r = await deletePayment(paymentId)
      if (r.error) setError(r.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={v => { setOpen(v); setError(null) }}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-muted-foreground hover:text-destructive md:size-7"
          aria-label={`Zahlung ${beschreibung} zurücknehmen`}
        >
          <X className="size-4 md:size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Zahlung zurücknehmen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Zahlung <strong>{beschreibung}</strong> wird gelöscht und die Tilgung wieder zur Restschuld gezählt.
            Eine verknüpfte Buchung bleibt bestehen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); loeschen() }}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? 'Wird gelöscht…' : 'Zurücknehmen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
