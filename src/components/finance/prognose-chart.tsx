'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { PrognosePunkt } from './prognose-chart-impl'

export type { PrognosePunkt }

// recharts ist schwer und braucht echte DOM-Maße, deshalb erst im Browser geladen — wie die
// anderen Diagramme (Banking, Analyse).
export const PrognoseChart = dynamic<{ daten: PrognosePunkt[]; mitAnnahmen: boolean }>(
  () => import('./prognose-chart-impl').then(m => m.PrognoseChartImpl),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart variant="area" height={240} />
        <SkeletonChart variant="area" height={240} />
      </div>
    ),
  },
)
