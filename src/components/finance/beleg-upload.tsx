'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Check, Loader2 } from 'lucide-react'
import {
  belegHochladen,
  type BelegState,
} from '@/app/(dashboard)/finance/steuer/belege-actions'

/**
 * Beleg an eine Buchung hängen.
 *
 * Bewusst klein: ein Büroklammer-Knopf in der Buchungszeile, der ein
 * verstecktes Dateifeld öffnet und sofort hochlädt. Datum und Betrag der
 * Buchung gehen als Metadaten mit — die muss niemand abtippen, sie stehen ja
 * schon daneben.
 */
export function BelegUpload({
  transactionId,
  datum,
  betrag,
  vorhanden,
}: {
  transactionId: string
  datum: string
  betrag: number
  vorhanden: string | null
}) {
  const router = useRouter()
  const feldRef = useRef<HTMLInputElement>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [state, action, pending] = useActionState<BelegState, FormData>(belegHochladen, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) {
      setFehler(null)
      router.refresh()
    }
    if ('error' in state) setFehler(state.error)
  }, [state, router])

  if (vorhanden) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
        title={vorhanden}
      >
        <Check className="size-3.5" />
        Beleg
      </span>
    )
  }

  return (
    <form action={action} className="inline-flex shrink-0 items-center">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <input type="hidden" name="beleg_datum" value={datum} />
      <input type="hidden" name="betrag" value={Math.abs(betrag)} />
      <input
        ref={feldRef}
        type="file"
        name="datei"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) e.target.form?.requestSubmit()
        }}
      />
      <button
        type="button"
        onClick={() => feldRef.current?.click()}
        disabled={pending}
        title={fehler ?? 'Beleg hochladen'}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors ${
          fehler
            ? 'text-destructive'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
        {fehler ? 'Fehler' : 'Beleg'}
      </button>
    </form>
  )
}
