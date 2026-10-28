'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const NetWorthChartLazy = dynamic(() => import('./NetWorthChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[21rem] rounded-lg sm:h-[24rem] border border-border" />,
})
