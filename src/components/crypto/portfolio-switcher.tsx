'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, RefreshCw, CheckCircle2, AlertCircle, Zap, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { syncFromKraken, deletePortfolio } from '@/app/(dashboard)/crypto/actions'
import { toast } from 'sonner'

export interface PortfolioMeta {
  name:       string
  isKraken?:  boolean
  assetCount: number
}

interface Props {
  portfolios:      PortfolioMeta[]
  activePortfolio: string
  krakenConnected: boolean
  lastSync:        string | null
}

function fmtRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'gerade eben'
  if (diff < 3600)  return `vor ${Math.floor(diff / 60)} Min.`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

export function PortfolioSwitcher({ portfolios, activePortfolio, krakenConnected, lastSync }: Props) {
  const router = useRouter()
  const [creating, setCreating]           = useState(false)
  const [newName, setNewName]             = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [syncPending,   startSync]        = useTransition()
  const [deletePending, startDelete]      = useTransition()

  function switchTo(name: string) {
    router.push(`/crypto?p=${encodeURIComponent(name)}`)
  }

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(false)
    setNewName('')
    router.push(`/crypto?p=${encodeURIComponent(trimmed)}`)
  }

  function handleSync() {
    startSync(async () => {
      const result = await syncFromKraken()
      if (!result) return
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`${result.synced} Assets von Kraken synchronisiert`)
        router.refresh()
      }
    })
  }

  function handleDelete(name: string) {
    startDelete(async () => {
      const result = await deletePortfolio(name)
      setConfirmDelete(null)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Portfolio „${name}" gelöscht`)
      // Navigate away if we just deleted the active portfolio
      const remaining = portfolios.filter(p => p.name !== name)
      const next = remaining[0]?.name
      router.push(next ? `/crypto?p=${encodeURIComponent(next)}` : '/crypto')
    })
  }

  const isKrakenActive = activePortfolio === 'Kraken'

  return (
    <div className="border-b border-border bg-muted/20">
      {/* ── Portfolio tabs ── */}
      <div className="flex items-center gap-2 px-4 sm:px-8 py-3 overflow-x-auto">
        {portfolios.map(p => {
          const isActive = activePortfolio === p.name
          const isConfirming = confirmDelete === p.name

          return (
            <div key={p.name} className="relative group/tab shrink-0">
              {isConfirming ? (
                /* ── Inline delete confirm ── */
                <div className="flex items-center gap-1.5 rounded-md border border-destructive/60 bg-destructive/10 px-2.5 py-1.5">
                  <span className="text-xs text-destructive font-medium whitespace-nowrap">
                    „{p.name}" löschen?
                  </span>
                  <button
                    onClick={() => handleDelete(p.name)}
                    disabled={deletePending}
                    className="text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                  >
                    Ja
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Nein
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => switchTo(p.name)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-border'
                  )}
                >
                  {p.isKraken && <Zap className="size-3" />}
                  {p.name}
                  <span className={cn(
                    'ml-0.5 text-xs rounded-full px-1.5 py-0.5 tabular-nums',
                    isActive
                      ? 'bg-background/20 text-background/80'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {p.assetCount}
                  </span>

                  {/* Delete ×  — only on manual portfolios, hover-revealed */}
                  {!p.isKraken && (
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); setConfirmDelete(p.name) }}
                      className={cn(
                        'ml-0.5 rounded-full p-0.5 transition-opacity',
                        isActive
                          ? 'opacity-0 group-hover/tab:opacity-60 hover:opacity-100! text-background hover:bg-background/20'
                          : 'opacity-0 group-hover/tab:opacity-60 hover:opacity-100! text-muted-foreground hover:bg-accent'
                      )}
                    >
                      <X className="size-2.5" />
                    </span>
                  )}
                </button>
              )}
            </div>
          )
        })}

        {/* ── Create new portfolio ── */}
        {creating ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="Portfolio-Name"
              className="h-8 w-36 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="h-8 rounded-md bg-foreground px-2.5 text-xs text-background font-medium disabled:opacity-50"
            >
              Erstellen
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="h-8 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-dashed border-border transition-colors shrink-0"
          >
            <PlusCircle className="size-3.5" />
            Neues Portfolio
          </button>
        )}
      </div>

      {/* ── Kraken controls (only when Kraken portfolio is active) ── */}
      {isKrakenActive && (
        <div className="flex items-center gap-3 px-4 sm:px-8 py-2 border-t border-border/50 bg-muted/10">
          {krakenConnected ? (
            <>
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

              <span className="ml-auto text-xs text-muted-foreground">
                Balances werden automatisch aus deinem Kraken-Konto synchronisiert
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5" />
              Kraken nicht verbunden —{' '}
              <a href="/settings" className="underline underline-offset-2">
                Einstellungen → Integrationen
              </a>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
