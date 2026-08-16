'use client'

import dynamic from 'next/dynamic'
import type { SankeyData } from '@/lib/analyseData'

interface Props { data: SankeyData }

// recharts is heavy and this Sankey chart is below the fold on the Analyse page, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const GeldflussChart = dynamic<Props>(
  () => import('./GeldflussChart-impl').then(m => m.GeldflussChart),
  {
    ssr: false,
    loading: () => <div className="bg-[#13161e] border border-[#1e2130] rounded-xl p-5 h-114 animate-pulse" />,
  },
)
