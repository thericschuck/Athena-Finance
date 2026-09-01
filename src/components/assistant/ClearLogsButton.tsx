'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearLogs } from '@/app/(dashboard)/assistant/actions'

/** Räumt alles ab, was älter als 7 Tage ist — die jüngsten Einträge bleiben
    stehen, weil man sie beim Aufräumen meist gerade untersucht. */
const KEEP_DAYS = 7

export function ClearLogsButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Alle Log-Einträge älter als ${KEEP_DAYS} Tage löschen?`)) return
        startTransition(async () => {
          await clearLogs(KEEP_DAYS)
          router.refresh()
        })
      }}
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      Älter als {KEEP_DAYS} Tage löschen
    </Button>
  )
}
