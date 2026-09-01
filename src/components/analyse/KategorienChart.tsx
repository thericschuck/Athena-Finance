'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { CategoryDatum } from '@/lib/analyseData'

interface Props { data: CategoryDatum[] }

// recharts is heavy and this bar chart is below the fold on the Analyse page, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const KategorienChart = dynamic<Props>(
  () => import('./KategorienChart-impl').then(m => m.KategorienChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="hbars" height={188} />,
  },
)
