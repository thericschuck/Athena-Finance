'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Hülle.
export const MonatsBalkenLazy = dynamic(() => import('./MonatsBalken'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/30" />,
})
