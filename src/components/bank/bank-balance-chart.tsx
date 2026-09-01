'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { BankTransaction } from '@/types/bank'

interface Props {
  accountName:    string
  currentBalance: number
  transactions:   BankTransaction[]
  /** Startdatum (ISO) des gewählten Zeitraums — siehe bank-balance-chart-impl.tsx. */
  from?:          string
}

// Same on-demand loading rationale as the other bank charts (see bank-trend-chart.tsx) —
// recharts is heavy and this only renders once balances exist.
export const BankBalanceChart = dynamic<Props>(
  () => import('./bank-balance-chart-impl').then(m => m.BankBalanceChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="area" height={180} />,
  },
)
