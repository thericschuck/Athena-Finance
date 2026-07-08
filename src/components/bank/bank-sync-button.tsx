'use client'

import { RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SyncStatus } from '@/types/bank'

interface Props {
  syncStatus: SyncStatus
  onSync:     () => void
  onReset:    () => void
}

export function BankSyncButton({ syncStatus, onSync, onReset }: Props) {
  const isLoading = syncStatus.type === 'loading'

  // ── Loading state — decoupled SCA may require an app confirmation ────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 flex-wrap max-w-md">
        <Button variant="outline" size="sm" disabled>
          <RefreshCw className="size-4 animate-spin" />
          Synchronisiert…
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          Falls angefragt: bitte in der SecureGo plus App bestätigen.
        </span>
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (syncStatus.type === 'error') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-destructive">{syncStatus.message}</span>
        <Button variant="outline" size="sm" onClick={onReset}>
          Zurücksetzen
        </Button>
        <Button variant="outline" size="sm" onClick={onSync}>
          <RefreshCw className="size-4" />
          Erneut versuchen
        </Button>
      </div>
    )
  }

  // ── Default / success state ─────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {syncStatus.type === 'success' && (
        <span className="text-xs text-muted-foreground">
          {syncStatus.imported} neue Transaktionen importiert
          {syncStatus.skipped > 0 && `, ${syncStatus.skipped} übersprungen`}
        </span>
      )}
      <Button variant="outline" size="sm" onClick={onSync}>
        <RefreshCw className="size-4" />
        Konto synchronisieren
      </Button>
    </div>
  )
}
