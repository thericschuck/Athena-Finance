'use client'

import { useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SyncStatus } from '@/types/bank'

interface Props {
  syncStatus:  SyncStatus
  onSync:      () => void
  onSubmitTan: (transactionRef: string, tan: string) => void
  onReset:     () => void
}

export function BankSyncButton({ syncStatus, onSync, onSubmitTan, onReset }: Props) {
  const [tan, setTan] = useState('')

  const isLoading = syncStatus.type === 'loading'

  // ── TAN challenge screen ────────────────────────────────────────────────────
  if (syncStatus.type === 'tan_required') {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <span className="text-sm font-medium">TAN eingeben</span>
        </div>

        {syncStatus.challengeText && (
          <p className="text-sm text-muted-foreground">{syncStatus.challengeText}</p>
        )}

        {syncStatus.challengeMedia && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${syncStatus.challengeMedia}`}
            alt="TAN Challenge"
            className="rounded border border-border"
          />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="tan-input" className="text-xs">TAN</Label>
          <Input
            id="tan-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={tan}
            onChange={e => setTan(e.target.value)}
            className="font-mono"
            onKeyDown={e => {
              if (e.key === 'Enter' && tan.trim()) {
                onSubmitTan(syncStatus.transactionRef, tan.trim())
                setTan('')
              }
            }}
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!tan.trim()}
            onClick={() => {
              onSubmitTan(syncStatus.transactionRef, tan.trim())
              setTan('')
            }}
          >
            Bestätigen
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>
            Abbrechen
          </Button>
        </div>
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
      <Button variant="outline" size="sm" onClick={onSync} disabled={isLoading}>
        <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
        {isLoading ? 'Synchronisiert…' : 'Konto synchronisieren'}
      </Button>
    </div>
  )
}
