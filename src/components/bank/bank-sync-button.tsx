'use client'

import { RefreshCw, ShieldCheck, AlertTriangle, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SyncStatus } from '@/types/bank'
import type { BankScaInfo } from '@/lib/hooks/use-bank-data'

interface Props {
  syncStatus: SyncStatus
  onSync:     () => void
  /** Vollständige Historie laden — kostet immer eine App-Freigabe (siehe Hinweis unten). */
  onSyncFull: () => void
  onReset:    () => void
  scaStatus:  BankScaInfo[]
}

/** "in 63 Tagen" / "seit 4 Tagen überfällig" — grob genug für einen Statushinweis. */
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function BankSyncButton({ syncStatus, onSync, onSyncFull, onReset, scaStatus }: Props) {
  const isLoading = syncStatus.type === 'loading'

  // Ein automatischer Sync hängt: die Bank verlangt wieder eine Freigabe. Das ist keine
  // Störung, sondern die gesetzliche 90-Tage-Wiederholung — ein manueller Sync behebt es.
  const needsApproval = scaStatus.some(b => b.scaRequired)
  // Frühestes Fristende über alle konfigurierten Bank-Logins.
  const nextDue = scaStatus
    .map(b => b.exemptionExpiresAt)
    .filter((d): d is string => d !== null)
    .sort()[0]

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
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {syncStatus.type === 'success' && (
          <span className="text-xs text-muted-foreground">
            {syncStatus.imported} neue Transaktionen importiert
            {syncStatus.skipped > 0 && `, ${syncStatus.skipped} übersprungen`}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={onSyncFull} title="Lädt alles, was die Bank noch hat — verlangt eine Freigabe in der App.">
          <History className="size-4" />
          Komplette Historie
        </Button>
        <Button variant="outline" size="sm" onClick={onSync}>
          <RefreshCw className="size-4" />
          Konto synchronisieren
        </Button>
      </div>

      {/* Freigabe-Status. Der automatische Sync läuft nach einer Freigabe rund 90 Tage
          ohne weitere Bestätigung (PSD2-Ausnahme für Kontoinformationen); danach ist
          genau einmal ein manueller Sync nötig. */}
      {needsApproval ? (
        <p className="inline-flex items-start gap-1 text-xs text-warning max-w-md text-right">
          <AlertTriangle className="size-3 shrink-0 mt-0.5" />
          Der automatische Sync wartet auf eine Freigabe. Einmal &bdquo;Konto synchronisieren&ldquo;
          klicken und in der SecureGo plus App bestätigen — danach läuft er wieder ca. 90 Tage allein.
        </p>
      ) : nextDue ? (
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3 shrink-0 text-primary" />
          Freigabefrei bis {new Date(nextDue).toLocaleDateString('de-DE')} ({daysUntil(nextDue)} Tage)
        </p>
      ) : null}
    </div>
  )
}
