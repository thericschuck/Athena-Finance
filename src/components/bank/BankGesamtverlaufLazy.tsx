'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben (gleiches Muster wie SammlungsChartLazy).
// `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle.
export const BankGesamtverlaufLazy = dynamic(() => import('./BankGesamtverlaufChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-lg border border-border" />,
})
