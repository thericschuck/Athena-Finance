'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Aufruf von /analyse mitzugeben: die Verteilung steht im Reiter "Muster", also nicht im ersten
// Blick. `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle (wie NetWorthChartLazy).
export const MonatsVerteilungLazy = dynamic(() => import('./MonatsVerteilung').then(m => m.MonatsVerteilung), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted/30" />,
})
