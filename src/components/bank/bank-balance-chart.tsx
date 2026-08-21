'use client'

import dynamic from 'next/dynamic'
import type { BankTransaction } from '@/types/bank'

interface Props {
  accountName:    string
  currentBalance: number
  transactions:   BankTransaction[]
}

// Same on-demand loading rationale as the other bank charts (see bank-trend-chart.tsx) —
// recharts is heavy and this only renders once balances exist.
export const BankBalanceChart = dynamic<Props>(
  () => import('./bank-balance-chart-impl').then(m => m.BankBalanceChart),
  {
    ssr: false,
    loading: () => <div className="rounded-lg border border-border bg-card p-5 h-[236px] animate-pulse" />,
  },
)
