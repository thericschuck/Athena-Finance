'use client'

import type { ReactNode } from 'react'
import { LazyMotion, domAnimation } from 'framer-motion'
import { SmoothScrollProvider } from '@/components/landing/SmoothScrollProvider'

// Client-Rahmen der Landingpage: LazyMotion-Kontext (für `m.*` in den Inseln)
// plus Lenis-Smooth-Scroll. Die Seite selbst bleibt Server-Komposition und
// reicht ihren Inhalt nur als `children` durch.
//
// domAnimation reicht: die drei m.div-Stellen (Reveal, CardDiverging,
// AnalyseDeck) animieren nur opacity/x/y/scale/rotate — kein drag/
// layout/layoutId, das bräuchte das größere domMax. LazyMotion + `m`
// statt `motion` spart hier laut Motion-Doku ~30kb im Client-Bundle.
export function LandingProviders({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <SmoothScrollProvider>{children}</SmoothScrollProvider>
    </LazyMotion>
  )
}
