'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt dem Dashboard-Aufruf mitzugeben (gleiche Begründung wie bei
// SammlungsChartLazy). `ssr: false` ist nur in einer Client-Komponente erlaubt, deshalb diese
// Hülle. Das Skelett hat die Höhe der fertigen Karte, damit nichts springt.
export const DashAusblickLazy = dynamic(() => import('./DashAusblickChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[290px] rounded-lg border border-border" />,
})
