'use client'

import dynamic from 'next/dynamic'

/** Recharts erst im Browser laden (ssr:false darf nur in Client Components stehen). */
export const BewegungsChartLazy = dynamic(() => import('./BewegungsChart'), {
  ssr: false,
  loading: () => <div className="h-44 w-full" aria-hidden />,
})
