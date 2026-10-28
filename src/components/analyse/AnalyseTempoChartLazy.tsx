'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (Muster wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const AnalyseTempoChartLazy = dynamic(() => import('./AnalyseTempoChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 rounded-lg" />,
})
