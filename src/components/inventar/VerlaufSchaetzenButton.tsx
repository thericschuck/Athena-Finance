'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { schaetzeVerlauf } from '@/app/(dashboard)/inventar/model-actions'

/**
 * Aktualisiert die geschätzten Wertverläufe der ganzen Sammlung bis heute. Eigene
 * Bewertungen bleiben unberührt; ein erneuter Klick ersetzt nur die Modellpunkte.
 */
export function VerlaufSchaetzenButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [meldung, setMeldung] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        title="Wertverlauf nach Kategorie und Nutzung bis heute fortschreiben"
        onClick={() =>
          startTransition(async () => {
            const res = await schaetzeVerlauf()
            if ('error' in res) setMeldung(res.error)
            else {
              setMeldung(`${res.verarbeitet} Stücke aktualisiert`)
              router.refresh()
            }
          })
        }
      >
        <TrendingDown className="size-3.5" />
        {pending ? 'Schätzt …' : 'Wertverlauf schätzen'}
      </Button>
      {meldung && <span className="text-xs text-muted-foreground">{meldung}</span>}
    </div>
  )
}
