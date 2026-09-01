'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type SectionTab = {
  href: string
  label: string
  /**
   * Nur die exakte URL gilt als aktiv. Für Tabs, die auf die Bereichswurzel
   * zeigen („Portfolio" → /crypto): mit Prefix-Vergleich wären sie auf jedem
   * Unterpunkt mit-aktiv und zwei Tabs leuchteten gleichzeitig.
   */
  exact?: boolean
}

/**
 * Zweite Navigationsebene im Seitenkopf. Seit „Crypto", „Depot" und „Strategy"
 * in der Sidebar unter „Investing" zusammengefasst sind, kann die Sidebar nicht
 * mehr jede Unterseite zeigen (das wären acht Einträge in einem Block) — die
 * Unterseiten eines Bereichs hängen hier.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname()

  return (
    // sticky, damit die Bereichs-Tabs beim Scrollen stehen bleiben — der
    // Scroll-Container ist der PageWrapper, nicht das Fenster.
    <nav className="sticky top-0 z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-4 sm:px-8">
      {tabs.map(({ href, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
