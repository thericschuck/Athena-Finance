'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie MonatsBalkenLazy).
export const KostenChartLazy = dynamic(() => import('./KostenChart'), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-lg border border-border bg-muted/30" />,
})
