'use client'

import dynamic from 'next/dynamic'
import { SkeletonChart } from '@/components/ui/skeleton'
import type { SankeyData } from '@/lib/analyseData'

interface Props {
  data: SankeyData
  /** Setzt den Kategorie-Filter (`null` = aufheben). Ohne: Posten sind nicht anklickbar. */
  onKategorie?: (id: string | null) => void
  aktiveKategorie?: string | null
}

// recharts is heavy and this Sankey chart is below the fold on the Analyse page, so it's
// loaded on demand via next/dynamic instead of bundled into the initial page JS.
// ssr:false because the chart picks Sankey vs. Fluss-Liste from the measured card width
// (ResizeObserver) and recharts' ResponsiveContainer needs real DOM measurement anyway.
export const GeldflussChart = dynamic<Props>(
  () => import('./GeldflussChart-impl').then(m => m.GeldflussChart),
  {
    ssr: false,
    loading: () => <SkeletonChart variant="area" height={388} />,
  },
)
