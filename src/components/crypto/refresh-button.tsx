'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { refreshPrices } from '@/app/(dashboard)/crypto/actions'

export function RefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  function handleRefresh() {
    setMessage(null)
    startTransition(async () => {
      const result = await refreshPrices()
      if (result.error) {
        setMessage({ text: result.error, ok: false })
      } else {
        setMessage({ text: `${result.updated} Preis${result.updated === 1 ? '' : 'e'} aktualisiert`, ok: true })
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className={`text-xs ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          {message.text}
        </span>
      )}
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
        <RefreshCw className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Aktualisiert…' : 'Preise aktualisieren'}
      </Button>
    </div>
  )
}
