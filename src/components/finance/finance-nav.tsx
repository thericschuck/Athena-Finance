'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/finance/accounts', label: 'Konten' },
  { href: '/finance/transactions', label: 'Transaktionen' },
  { href: '/finance/categories', label: 'Kategorien' },
  { href: '/finance/debts', label: 'Schulden' },
  { href: '/finance/contracts', label: 'Verträge' },
  { href: '/finance/goals', label: 'Sparziele' },
]

export function FinanceNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-border px-8">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              isActive
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
