'use client'

import dynamic from 'next/dynamic'
import type { BankTransaction } from '@/types/bank'

interface Props { transactions: BankTransaction[] }

// recharts is heavy and this chart only renders once bank transactions exist, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const BankCategoryChart = dynamic<Props>(
  () => import('./bank-category-chart-impl').then(m => m.BankCategoryChart),
  {
    ssr: false,
    loading: () => <div className="rounded-lg border border-border bg-card p-5 h-40 animate-pulse" />,
  },
)
