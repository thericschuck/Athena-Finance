'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { ChartDaten } from '@/lib/forecast/chartdaten'

// recharts ist schwer und braucht echte DOM-Maße, deshalb erst im Browser geladen — wie die
// anderen Diagramme (Banking, Analyse).
export const PrognoseChart = dynamic<{ daten: ChartDaten; mitAnnahmen: boolean }>(
  () => import('./prognose-chart-impl').then(m => m.PrognoseChartImpl),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="area" height={300} legend />,
  },
)
