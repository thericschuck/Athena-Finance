'use client'

import dynamic from 'next/dynamic'
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
    loading: () => <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5 h-64 animate-pulse" />,
  },
)
