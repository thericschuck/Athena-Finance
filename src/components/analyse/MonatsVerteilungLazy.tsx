'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt jedem Aufruf von /analyse mitzugeben: die Verteilung steht im Reiter "Muster", also nicht im ersten
// Blick. `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese Huelle (wie NetWorthChartLazy).
export const MonatsVerteilungLazy = dynamic(() => import('./MonatsVerteilung').then(m => m.MonatsVerteilung), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] rounded-lg border border-border" />,
})
