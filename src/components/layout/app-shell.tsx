'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { PageWrapper } from '@/components/layout/page-wrapper'

export function AppShell({
  children, email, displayName, avatarUrl,
}: {
  children: React.ReactNode
  email: string
  displayName: string | null
  avatarUrl: string | null
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        email={email}
        displayName={displayName}
        avatarUrl={avatarUrl}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
            aria-label="Navigation"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight">Athena Finance</span>
        </header>

        <PageWrapper>{children}</PageWrapper>
      </div>
    </div>
  )
}
