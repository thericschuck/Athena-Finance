'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (siehe SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const PortfolioAllokationChartLazy = dynamic(() => import('./PortfolioAllokationChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-lg border border-border" />,
})
