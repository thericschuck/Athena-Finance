'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveExchangeKey, deleteExchangeKey, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ExternalLink, ImagePlus, KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react'

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono'

export function IntegrationsForm() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Integrationen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Verbinde externe Handelsplattformen, um Portfoliosalden automatisch abzurufen.
        </p>
      </div>

      <ExchangeKeyCard
        exchange="kraken"
        title="Kraken (Spot)"
        subtitle="Krypto-Börse — Salden, Preise, Handelshistorie"
        permissionHint="Nur lesende Berechtigung erforderlich (Query Funds, Query Closed Orders & Trades für Einstandspreise)."
        apiKeyUrl="https://www.kraken.com/u/security/api"
      />

      {/* Kraken Futures is a completely separate product from Kraken Spot — own domain
          (futures.kraken.com), own API key pair, own signing algorithm. A Spot key can't be
          reused here, so this needs its own connect/disconnect card and its own key. */}
      <ExchangeKeyCard
        exchange="kraken_futures"
        title="Kraken Futures"
        subtitle="Gehebelte Futures-Positionen — separater Account, separater API-Key"
        permissionHint="Nur lesende Berechtigung erforderlich. Der Key wird auf futures.kraken.com erzeugt, nicht auf kraken.com — ein Spot-Key funktioniert hier nicht."
        apiKeyUrl="https://futures.kraken.com/settings/api"
      />

      {/* Der Athena-Assistent läuft serverseitig über die Anthropic-API (Key liegt in den
          Umgebungsvariablen des Deployments) — kein nutzerseitiger Connect-Flow wie bei
          den Exchanges, daher nur ein Link zur Abrechnung statt eines Formulars. */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Sparkles className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium leading-none">Claude (Anthropic)</p>
            <p className="text-xs text-muted-foreground mt-0.5">Modell hinter dem Athena-Assistenten</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">
            Abrechnung
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>

      {/* Bildgenerierung im Inventar (api/inventar/artwork/route.ts) läuft über einen
          eigenen OPENAI_API_KEY, ebenfalls serverseitig — Claude erzeugt keine Bilder.
          Gleiches Muster wie die Anthropic-Karte: nur ein Link zur Abrechnung. */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <ImagePlus className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium leading-none">ChatGPT (OpenAI)</p>
            <p className="text-xs text-muted-foreground mt-0.5">Bildgenerierung im Inventar</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer">
            Abrechnung
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  )
}

function ExchangeKeyCard({
  exchange,
  title,
  subtitle,
  permissionHint,
  apiKeyUrl,
}: {
  exchange: string
  title: string
  subtitle: string
  permissionHint: string
  apiKeyUrl: string
}) {
  // Connection status — fetched client-side so the settings page stays server-rendered
  const [connected, setConnected] = useState<boolean | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)

  const [saveState,   saveAction,   savePending]   = useActionState<SettingsState, FormData>(saveExchangeKey, null)
  const [deleteState, deleteAction, deletePending] = useActionState<SettingsState, FormData>(deleteExchangeKey, null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/kraken/status?exchange=${exchange}`, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((d: { connected?: boolean }) => setConnected(d.connected ?? false))
      .catch(() => setConnected(false))
      .finally(() => setStatusLoading(false))
    return () => controller.abort()
  }, [exchange])

  useEffect(() => {
    if (!saveState) return
    if ('success' in saveState) {
      toast.success(`${title} verbunden`)
      setConnected(true)
    }
    if ('error' in saveState) toast.error(saveState.error)
  }, [saveState, title])

  useEffect(() => {
    if (!deleteState) return
    if ('success' in deleteState) {
      toast.success(`${title}-Verbindung getrennt`)
      setConnected(false)
    }
    if ('error' in deleteState) toast.error(deleteState.error)
  }, [deleteState, title])

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <KeyRound className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium leading-none">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        {statusLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
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
          <input type="hidden" name="exchange" value={exchange} />
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
          <input type="hidden" name="exchange" value={exchange} />

          <div className="space-y-1.5">
            <label htmlFor={`${exchange}-api_key`} className="text-sm font-medium">API Key</label>
            <input
              id={`${exchange}-api_key`}
              name="api_key"
              required
              autoComplete="off"
              placeholder="z.B. JKLmno1234…"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${exchange}-api_secret`} className="text-sm font-medium">API Secret</label>
            <input
              id={`${exchange}-api_secret`}
              name="api_secret"
              type="password"
              required
              autoComplete="off"
              placeholder="••••••••••••"
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground">
              {permissionHint} Der Schlüssel wird verschlüsselt gespeichert und verlässt den
              Server nie im Klartext.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={savePending}>
              {savePending ? 'Wird verbunden…' : 'Verbinden'}
            </Button>
            <a
              href={apiKeyUrl}
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
  )
}
