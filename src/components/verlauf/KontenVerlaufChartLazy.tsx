'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt jedem Aufruf des Tabs mitzugeben — nur mit gewaehltem Konto
// wird der grosse Chart ueberhaupt gebraucht. `ssr: false` geht nur in einer Client-Komponente.
export const KontenVerlaufChartLazy = dynamic(() => import('./KontenVerlaufChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg border border-border bg-muted/30" />,
})
