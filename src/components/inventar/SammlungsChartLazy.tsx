'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben — gleiche Begruendung wie beim
// Wertverlauf im Detail-Panel. `ssr: false` ist nur in einer Client-Komponente erlaubt,
// deshalb dieser Huelle.
export const SammlungsChartLazy = dynamic(() => import('./SammlungsChart'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg border border-border bg-muted/30" />,
})
