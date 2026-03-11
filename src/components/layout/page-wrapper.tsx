'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function PageWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const [navigating, setNavigating] = useState(false)

  // Keep a ref to the current pathname so the click handler always sees the latest value
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  // Intercept clicks on internal <a> tags → show bar immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        anchor.getAttribute('target') === '_blank' ||
        href === pathnameRef.current  // same page → no navigation happens
      ) return
      setNavigating(true)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  // Pathname changed → navigation complete, hide bar
  useEffect(() => {
    setNavigating(false)

    const el = ref.current
    if (!el) return
    el.classList.remove('page-enter-active')
    void el.offsetHeight
    el.classList.add('page-enter-active')
  }, [pathname])

  return (
    <>
      {/* Top navigation progress bar */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden"
        style={{
          opacity: navigating ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      >
        <div
          className="nav-progress-bar h-full w-1/2 bg-primary"
        />
      </div>

      <div ref={ref} className="page-enter-active flex min-w-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </>
  )
}
