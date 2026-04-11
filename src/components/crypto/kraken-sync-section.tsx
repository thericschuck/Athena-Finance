'use client'

import { useTransition, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveCryptoSource, syncFromKraken, type CryptoSource } from '@/app/(dashboard)/crypto/actions'

interface Props {
  initialSource:  CryptoSource
  lastSync:       string | null   // ISO timestamp from user_settings
  krakenConnected: boolean
}

const SOURCE_OPTIONS: { value: CryptoSource; label: string }[] = [
  { value: 'all',    label: 'Alle' },
  { value: 'kraken', label: 'Kraken' },
  { value: 'manual', label: 'Manuell' },
]

function fmtRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return 'gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

export function KrakenSyncSection({ initialSource, lastSync, krakenConnected }: Props) {
  const [source, setSource]       = useState<CryptoSource>(initialSource)
  const [sourcePending, startSourceTransition] = useTransition()
  const [syncPending,   startSyncTransition]   = useTransition()

  function handleSourceChange(next: CryptoSource) {
    setSource(next)
    startSourceTransition(async () => {
      await saveCryptoSource(next)
    })
  }

  function handleSync() {
    startSyncTransition(async () => {
      const result = await syncFromKraken()
      if (!result) return
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`${result.synced} Assets von Kraken synchronisiert`)
      }
    })
  }

  return (
    <div className="flex items-center gap-3 flex-wrap px-4 sm:px-8 py-3 border-b border-border bg-muted/20">
      {/* Source selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-0.5">Quelle:</span>
        <div className="flex rounded-md border border-border overflow-hidden">
          {SOURCE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSourceChange(opt.value)}
              disabled={sourcePending}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                source === opt.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sync controls — only shown when Kraken source is active */}
      {source === 'kraken' && (
        krakenConnected ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3', syncPending && 'animate-spin')} />
              {syncPending ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
            </button>

            {lastSync && !syncPending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3 text-green-500" />
                Zuletzt: {fmtRelative(lastSync)}
              </span>
            )}
          </div>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="size-3.5" />
            Kraken nicht verbunden —{' '}
            <a href="/settings" className="underline underline-offset-2">
              Einstellungen → Integrationen
            </a>
          </span>
        )
      )}
    </div>
  )
}
