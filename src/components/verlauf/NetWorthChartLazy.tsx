'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const NetWorthChartLazy = dynamic(() => import('./NetWorthChart'), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-lg border border-border bg-muted/30" />,
})
