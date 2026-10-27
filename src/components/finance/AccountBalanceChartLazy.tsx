'use client'

import dynamic from 'next/dynamic'

// Recharts nachladen statt der Konto-Detailseite mitzugeben (wie AccountMonthChart). Das Skelett hat die Hoehe der fertigen Karte.
export const AccountBalanceChartLazy = dynamic(() => import('./account-balance-chart').then(m => m.AccountBalanceChart), {
  ssr: false,
  loading: () => <div className="h-[278px] animate-pulse rounded-lg border border-border bg-muted/30" />,
})
