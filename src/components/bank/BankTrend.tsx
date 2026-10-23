'use client'

import { useUrlFilters } from '@/components/providers/url-filters'
import { BankTrendChart } from './bank-trend-chart'

/** Monatstrend mit Monatsauswahl ueber die URL (`month`); derselbe Monat nochmal hebt auf. */
export function BankTrend({ months, selectedMonth }: {
  months: { month: string; income: number; expense: number }[]
  selectedMonth: string | null
}) {
  const filters = useUrlFilters()
  return (
    <BankTrendChart
      months={months}
      selectedMonth={filters.get('month') ?? selectedMonth}
      onSelectMonth={m => filters.set('month', m)}
    />
  )
}
