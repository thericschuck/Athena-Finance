'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Remove → force reflow → re-add to restart the keyframe animation
    el.classList.remove('page-enter-active')
    void el.offsetHeight
    el.classList.add('page-enter-active')
  }, [pathname])

  return (
    <div ref={ref} className="page-enter-active flex min-w-0 flex-1 flex-col overflow-auto">
      {children}
    </div>
  )
}
