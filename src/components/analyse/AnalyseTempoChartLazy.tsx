'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (Muster wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const AnalyseTempoChartLazy = dynamic(() => import('./AnalyseTempoChart'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted/30" />,
})
