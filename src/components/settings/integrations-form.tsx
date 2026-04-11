'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveExchangeKey, deleteExchangeKey, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react'

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono'

export function IntegrationsForm() {
  // Connection status — fetched client-side so the settings page stays server-rendered
  const [connected, setConnected] = useState<boolean | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [saveState,   saveAction,   savePending]   = useActionState<SettingsState, FormData>(saveExchangeKey, null)
  const [deleteState, deleteAction, deletePending] = useActionState<SettingsState, FormData>(deleteExchangeKey, null)

  // Check current Kraken connection status on mount
  useEffect(() => {
    fetch('/api/kraken/portfolio')
      .then(r => r.json())
      .then((d: { connected?: boolean }) => setConnected(d.connected ?? false))
      .catch(() => setConnected(false))
      .finally(() => setStatusLoading(false))
  }, [])

  // Refresh status after save / delete
  useEffect(() => {
    if (!saveState) return
    if ('success' in saveState) {
      toast.success('Kraken-Konto verbunden')
      setConnected(true)
    }
    if ('error' in saveState) toast.error(saveState.error)
  }, [saveState])

  useEffect(() => {
    if (!deleteState) return
    if ('success' in deleteState) {
      toast.success('Kraken-Verbindung getrennt')
      setConnected(false)
    }
    if ('error' in deleteState) toast.error(deleteState.error)
  }, [deleteState])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Integrationen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Verbinde externe Handelsplattformen, um Portfoliosalden automatisch abzurufen.
        </p>
      </div>

      {/* Kraken card */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
              <KeyRound className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium leading-none">Kraken</p>
              <p className="text-xs text-muted-foreground mt-0.5">Krypto-Börse</p>
            </div>
          </div>

          {statusLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : connected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-3.5" />
              Verbunden
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Nicht verbunden</span>
          )}
        </div>

        {!statusLoading && connected ? (
          // ── Disconnect form ──────────────────────────────────────────────────
          <form action={deleteAction}>
            <input type="hidden" name="exchange" value="kraken" />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={deletePending}
              className="gap-1.5"
            >
              <Trash2 className="size-3.5" />
              {deletePending ? 'Wird getrennt…' : 'Verbindung trennen'}
            </Button>
          </form>
        ) : !statusLoading ? (
          // ── Connect form ─────────────────────────────────────────────────────
          <form action={saveAction} className="space-y-3">
            <input type="hidden" name="exchange" value="kraken" />

            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Key</label>
              <input
                name="api_key"
                required
                autoComplete="off"
                placeholder="z.B. JKLmno1234…"
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">API Secret</label>
              <input
                name="api_secret"
                type="password"
                required
                autoComplete="off"
                placeholder="••••••••••••"
                className={inputCls}
              />
              <p className="text-xs text-muted-foreground">
                Nur lesende Berechtigung erforderlich (Query Funds). Der Schlüssel wird
                verschlüsselt gespeichert und verlässt den Server nie im Klartext.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={savePending}>
                {savePending ? 'Wird verbunden…' : 'Verbinden'}
              </Button>
              <a
                href="https://www.kraken.com/u/security/api"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                API-Key erstellen
                <ExternalLink className="size-3" />
              </a>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
