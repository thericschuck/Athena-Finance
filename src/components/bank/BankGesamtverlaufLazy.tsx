'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (gleiches Muster wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const BankGesamtverlaufLazy = dynamic(() => import('./BankGesamtverlaufChart'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg border border-border bg-muted/30" />,
})
