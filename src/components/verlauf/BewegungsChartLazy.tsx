'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

/** Recharts erst im Browser laden (ssr:false darf nur in Client Components stehen). */
export const BewegungsChartLazy = dynamic(() => import('./BewegungsChart'), {
  ssr: false,
  loading: () => <Skeleton className="h-44 w-full" />,
})
