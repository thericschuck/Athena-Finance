'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { addCoinToCatalog, removeCoinFromCatalog } from '@/app/(dashboard)/crypto/assets/actions'
import type { CoinEntry, CoinType } from '@/lib/crypto/coin-registry'

// ─── Type badge colours ───────────────────────────────────────────────────────
const TYPE_COLORS: Record<CoinType, string> = {
  crypto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  stable: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  fiat:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}
const TYPE_LABELS: Record<CoinType, string> = {
  crypto: 'Crypto',
  stable: 'Stablecoin',
  fiat:   'Fiat',
}

// ─── Add-coin dialog ──────────────────────────────────────────────────────────
function AddCoinDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [isPending, start]  = useTransition()

  const [symbol, setSymbol]             = useState('')
  const [name, setName]                 = useState('')
  const [coingeckoId, setCoingeckoId]   = useState('')
  const [type, setType]                 = useState<CoinType>('crypto')

  function reset() {
    setSymbol('')
    setName('')
    setCoingeckoId('')
    setType('crypto')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!symbol.trim() || !name.trim()) {
      setError('Symbol und Name sind erforderlich')
      return
    }

    const entry: CoinEntry = {
      symbol:       symbol.trim().toUpperCase(),
      name:         name.trim(),
      coingecko_id: coingeckoId.trim().toLowerCase() || null,
      type,
    }

    start(async () => {
      const result = await addCoinToCatalog(entry)
      if (result.error) {
        setError(result.error)
      } else {
        setOpen(false)
        reset()
        onAdded()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="size-4" />Coin hinzufügen</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuen Coin hinzufügen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-symbol">Symbol *</Label>
              <Input
                id="c-symbol"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="BTC"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-type">Typ *</Label>
              <select
                id="c-type"
                value={type}
                onChange={e => setType(e.target.value as CoinType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="crypto">Crypto</option>
                <option value="stable">Stablecoin</option>
                <option value="fiat">Fiat</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name *</Label>
            <Input
              id="c-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Bitcoin"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-cgid">CoinGecko-ID</Label>
            <Input
              id="c-cgid"
              value={coingeckoId}
              onChange={e => setCoingeckoId(e.target.value.toLowerCase())}
              placeholder="bitcoin (leer lassen für Fiat)"
            />
            <p className="text-xs text-muted-foreground">
              Für Fiat-Währungen (EUR, USD) leer lassen.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  builtinCoins: CoinEntry[]
  customCoins:  CoinEntry[]
}

export function CoinCatalogManager({ builtinCoins, customCoins: initialCustom }: Props) {
  const router                        = useRouter()
  const [custom, setCustom]           = useState<CoinEntry[]>(initialCustom)
  const [deletingSymbol, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, start]                     = useTransition()

  function handleAdded() {
    router.refresh()
  }

  function handleDelete(symbol: string) {
    setDeleting(symbol)
    setDeleteError(null)
    start(async () => {
      const result = await removeCoinFromCatalog(symbol)
      if (result.error) {
        setDeleteError(result.error)
      } else {
        setCustom(prev => prev.filter(c => c.symbol !== symbol))
        router.refresh()
      }
      setDeleting(null)
    })
  }

  const allCoins = [...builtinCoins, ...custom]

  return (
    <div className="space-y-6">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {allCoins.length} Einträge · {builtinCoins.length} eingebaut · {custom.length} benutzerdefiniert
        </p>
        <AddCoinDialog onAdded={handleAdded} />
      </div>

      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Symbol</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">CoinGecko-ID</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Typ</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Quelle</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {allCoins.map((coin, i) => {
              const isCustom = custom.some(c => c.symbol === coin.symbol)
              return (
                <tr
                  key={coin.symbol}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}
                >
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[coin.type]}`}>
                      {coin.symbol}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">{coin.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                    {coin.coingecko_id ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{TYPE_LABELS[coin.type]}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${isCustom ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-muted text-muted-foreground'}`}>
                      {isCustom ? 'Benutzerdefiniert' : 'Eingebaut'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isCustom && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deletingSymbol === coin.symbol}
                        onClick={() => handleDelete(coin.symbol)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
