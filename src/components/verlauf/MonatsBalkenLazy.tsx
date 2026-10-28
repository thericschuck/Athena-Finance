'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Hülle.
export const MonatsBalkenLazy = dynamic(() => import('./MonatsBalken'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-lg border border-border" />,
})
