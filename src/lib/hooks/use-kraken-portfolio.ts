'use client'

import { useState, useEffect, useCallback } from 'react'

export interface KrakenBalance {
  asset: string
  amount: string
}

interface KrakenPortfolioData {
  connected: boolean
  balances: KrakenBalance[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useKrakenPortfolio(): KrakenPortfolioData {
  const [connected, setConnected] = useState(false)
  const [balances,  setBalances]  = useState<KrakenBalance[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [tick,      setTick]      = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/kraken/portfolio')
      .then(res => res.json())
      .then((data: { connected?: boolean; balances?: Record<string, string> | null; error?: string }) => {
        if (cancelled) return

        if (data.error) {
          setError(data.error)
          setConnected(false)
          setBalances([])
          return
        }

        setConnected(data.connected ?? false)
        setBalances(
          data.balances
            ? Object.entries(data.balances).map(([asset, amount]) => ({ asset, amount }))
            : []
        )
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [tick])

  const refetch = useCallback(() => setTick(t => t + 1), [])

  return { connected, balances, loading, error, refetch }
}
