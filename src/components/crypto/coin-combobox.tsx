'use client'

import { useState, useRef, useEffect, useId, useMemo } from 'react'
import { COIN_REGISTRY, type CoinEntry, type CoinType } from '@/lib/crypto/coin-registry'
import { getCoinCatalog } from '@/app/(dashboard)/crypto/assets/actions'
import { ChevronDown, Search, X } from 'lucide-react'

// ─── Type badge ───────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<CoinType, string> = {
  crypto: 'Crypto',
  stable: 'Stable',
  fiat:   'Fiat',
}
const TYPE_COLORS: Record<CoinType, string> = {
  crypto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  stable: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  fiat:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  /** Currently selected coingecko_id or fiat symbol (lowercase), if any */
  defaultValue?: string | null
  onChange: (coin: CoinEntry) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function CoinCombobox({ defaultValue, onChange }: Props) {
  const id = useId()

  const [catalogCoins, setCatalogCoins] = useState<CoinEntry[]>([])

  // Load user's custom catalog entries on mount
  useEffect(() => {
    getCoinCatalog().then(setCatalogCoins).catch(() => {})
  }, [])

  // Merge COIN_REGISTRY with custom catalog (deduped by symbol)
  const allCoins = useMemo(() => {
    const seen = new Set(COIN_REGISTRY.map(c => c.symbol.toUpperCase()))
    const extra = catalogCoins.filter(c => !seen.has(c.symbol.toUpperCase()))
    return [...COIN_REGISTRY, ...extra]
  }, [catalogCoins])

  // resolve initial selection from merged list
  const initial = defaultValue
    ? allCoins.find(c =>
        c.coingecko_id === defaultValue ||
        c.symbol.toLowerCase() === defaultValue.toLowerCase()
      ) ?? null
    : null

  const [selected, setSelected] = useState<CoinEntry | null>(initial)
  const [query, setQuery]       = useState('')
  const [open, setOpen]         = useState(false)
  const containerRef            = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  // Close on outside click
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
    ? allCoins.filter(c =>
        c.symbol.toLowerCase().includes(query.toLowerCase()) ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.coingecko_id ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : allCoins

  function select(coin: CoinEntry) {
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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 10) }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[selected.type]}`}>
              {selected.symbol}
            </span>
            <span className="truncate text-muted-foreground">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Coin auswählen…</span>
        )}
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {selected && (
            <X className="size-3.5 text-muted-foreground hover:text-foreground" onClick={clear} />
          )}
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {/* Search input */}
          <div className="flex items-center border-b border-border px-3 py-2 gap-2">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Suchen…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Keine Ergebnisse</li>
            ) : (
              filtered.map(coin => (
                <li
                  key={coin.coingecko_id ?? coin.symbol}
                  onClick={() => select(coin)}
                  className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/60 ${
                    selected?.symbol === coin.symbol ? 'bg-muted/40' : ''
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
