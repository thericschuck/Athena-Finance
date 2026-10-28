'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie MonatsBalkenLazy).
export const KostenChartLazy = dynamic(() => import('./KostenChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] rounded-lg border border-border" />,
})
