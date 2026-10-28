'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Recharts nachladen statt der Konto-Detailseite mitzugeben (wie AccountMonthChart). Das Skelett hat die Hoehe der fertigen Karte.
export const AccountBalanceChartLazy = dynamic(() => import('./account-balance-chart').then(m => m.AccountBalanceChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[278px] rounded-lg border border-border" />,
})
