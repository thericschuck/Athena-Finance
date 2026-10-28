'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Die Finanzanalyse steht ganz unten im Dashboard und braucht Recharts: nachladen, damit der erste Blick nicht auf das Chart-Bundle
// wartet. Das Skelett liegt unterhalb des sichtbaren Bereichs. `ssr: false` nur in einer Client-Komponente erlaubt.
export const FinanceAnalyticsLazy = dynamic(() => import('./finance-analytics').then(m => m.FinanceAnalytics), {
  ssr: false,
  loading: () => <Skeleton className="h-[520px] rounded-lg border border-border" />,
})
