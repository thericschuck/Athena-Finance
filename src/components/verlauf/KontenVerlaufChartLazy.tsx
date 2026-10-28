'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Aufruf des Tabs mitzugeben — nur mit gewaehltem Konto
// wird der grosse Chart ueberhaupt gebraucht. `ssr: false` geht nur in einer Client-Komponente.
export const KontenVerlaufChartLazy = dynamic(() => import('./KontenVerlaufChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-56 rounded-lg border border-border" />,
})
