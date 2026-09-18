'use client'

import { useState, useRef, useEffect, useId, useMemo } from 'react'
import { getKrakenTradeableAssets } from '@/app/(dashboard)/crypto/actions'
import type { KrakenTradeableAsset } from '@/lib/kraken'
import { ChevronDown, Search, X, Loader2 } from 'lucide-react'

const TYPE_LABELS: Record<KrakenTradeableAsset['type'], string> = {
  crypto: 'Crypto',
  stable: 'Stable',
  fiat:   'Fiat',
}
const TYPE_COLORS: Record<KrakenTradeableAsset['type'], string> = {
  crypto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  stable: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  fiat:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

interface Props {
  /** Currently selected dbSymbol (= assets.symbol match key), if any */
  defaultValue?: string | null
  onChange: (asset: KrakenTradeableAsset) => void
}

/**
 * Wie CoinCombobox, aber gespeist aus Krakens eigenen live Asset-/Pair-Daten statt der
 * statischen Registry — solange Malik im Kraken-Ökosystem bleibt, matcht das 1:1 das, was der
 * nächste echte Sync in `assets.symbol` schreibt (siehe `resolveKrakenAsset()`).
 */
export function KrakenAssetCombobox({ defaultValue, onChange }: Props) {
  const id = useId()

  const [coins, setCoins]     = useState<KrakenTradeableAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    getKrakenTradeableAssets()
      .then(setCoins)
      .catch(() => setError('Kraken-Assets konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }, [])

  const initial = useMemo(
    () => (defaultValue ? coins.find(c => c.dbSymbol === defaultValue) ?? null : null),
    [defaultValue, coins]
  )

  const [selected, setSelected] = useState<KrakenTradeableAsset | null>(initial)
  const [query, setQuery]       = useState('')
  const [open, setOpen]         = useState(false)
  const containerRef            = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.trim()
    ? coins.filter(c =>
        c.symbol.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase())
      )
    : coins

  function select(coin: KrakenTradeableAsset) {
    setSelected(coin)
    onChange(coin)
    setOpen(false)
    setQuery('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(null)
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative" id={id}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 10) }}
        disabled={loading}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        {loading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Lade Kraken-Assets…
          </span>
        ) : selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[selected.type]}`}>
              {selected.symbol}
            </span>
            <span className="truncate text-muted-foreground">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{error ?? 'Coin auswählen…'}</span>
        )}
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {selected && (
            <X className="size-3.5 text-muted-foreground hover:text-foreground" onClick={clear} />
          )}
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {open && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="flex items-center border-b border-border px-3 py-2 gap-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Suchen…"
              aria-label="Kraken-Assets suchen"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Keine Ergebnisse</li>
            ) : (
              filtered.map(coin => (
                <li
                  key={coin.code}
                  role="option"
                  aria-selected={selected?.dbSymbol === coin.dbSymbol}
                  tabIndex={0}
                  onClick={() => select(coin)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select(coin)
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/60 ${
                    selected?.dbSymbol === coin.dbSymbol ? 'bg-muted/40' : ''
                  }`}
                >
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[coin.type]}`}>
                    {coin.symbol}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{coin.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{TYPE_LABELS[coin.type]}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
