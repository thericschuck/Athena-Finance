'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ErrorFallbackProps {
  error: Error & { digest?: string }
  retry: () => void
  /** Bereichsname für den Text, z. B. "Crypto". */
  area?: string
}

/**
 * Gemeinsamer Fallback für error.tsx-Segmente. Zeigt dem User bewusst keine Fehlermeldung,
 * der Digest landet nur in der Konsole (Abgleich mit Server-Logs).
 */
export function ErrorFallback({ error, retry, area }: ErrorFallbackProps) {
  useEffect(() => {
    console.error(`[error-boundary${area ? `:${area}` : ''}]`, error.digest ?? 'kein digest')
  }, [error, area])

  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto size-8 text-destructive" aria-hidden />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {area ? `${area} konnte nicht geladen werden` : 'Etwas ist schiefgelaufen'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.
          </p>
        </div>
        <Button onClick={() => retry()}>Erneut versuchen</Button>
      </div>
    </div>
  )
}
