'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { BankTransaction } from '@/types/bank'

interface Props {
  transactions: BankTransaction[]
  /** `YYYY-MM` des ausgewählten Monats, oder null. */
  selectedMonth?: string | null
  /** Klick auf eine Säule. Derselbe Monat nochmal hebt die Auswahl auf. */
  onSelectMonth?: (month: string | null) => void
}

// recharts is heavy and this chart only renders once bank transactions exist, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because recharts' ResponsiveContainer needs real DOM measurement to lay out;
// it renders nothing meaningful during server rendering.
export const BankTrendChart = dynamic<Props>(
  () => import('./bank-trend-chart-impl').then(m => m.BankTrendChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="bars" height={220} legend />,
  },
)
