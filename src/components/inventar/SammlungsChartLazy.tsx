'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Seitenaufruf mitzugeben — gleiche Begruendung wie beim
// Wertverlauf im Detail-Panel. `ssr: false` ist nur in einer Client-Komponente erlaubt,
// deshalb dieser Huelle.
export const SammlungsChartLazy = dynamic(() => import('./SammlungsChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-lg border border-border" />,
})
