'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { MonthlyComparison } from '@/lib/analyseData'

interface Props { data: MonthlyComparison[] }

// recharts is heavy and this composed chart is below the fold on the Analyse page, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const MonatsVergleich = dynamic<Props>(
  () => import('./MonatsVergleich-impl').then(m => m.MonatsVergleich),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="bars" height={288} />,
  },
)
