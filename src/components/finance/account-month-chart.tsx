'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'

export interface MonthDatum {
  /** `YYYY-MM` */
  month: string
  income: number
  /** Negativ, damit die Balken unter der Nulllinie liegen. */
  expense: number
  net: number
}

// Wie die übrigen Charts nachgeladen: recharts ist schwer und wird erst gebraucht, wenn
// dieses Konto überhaupt genug Buchungen für einen Monatsvergleich hat.
interface Props {
  data: MonthDatum[]
  currency: string
  /**
   * `YYYY-MM` des ausgewaehlten Monats. Ist die Prop gesetzt (auch auf null), werden die
   * Saeulen klickbar und schreiben ihre Auswahl selbst in die URL — dafuer muss die
   * Komponente in einem `<UrlFiltersProvider>` haengen.
   */
  selectedMonth?: string | null
}

export const AccountMonthChart = dynamic<Props>(
  () => import('./account-month-chart-impl').then(m => m.AccountMonthChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="bars" height={200} />,
  },
)
