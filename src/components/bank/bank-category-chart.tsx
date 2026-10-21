'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { FinanceCategory } from '@/types/bank'
import type { FlowInclude, FlowRow } from '@/lib/finance/flow-calc'

interface Props { rows: FlowRow[]; include: FlowInclude; categories: FinanceCategory[] }

// recharts is heavy and this chart only renders once bank transactions exist, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const BankCategoryChart = dynamic<Props>(
  () => import('./bank-category-chart-impl').then(m => m.BankCategoryChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="hbars" height={220} />,
  },
)
