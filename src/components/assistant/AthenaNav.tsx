'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, Brain, BookOpen, ScrollText, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/assistant', label: 'Chat', icon: MessageSquare },
  { href: '/assistant/memory', label: 'Speicher', icon: Brain },
  { href: '/assistant/knowledge', label: 'Wissen', icon: BookOpen },
  { href: '/assistant/logs', label: 'Logs', icon: ScrollText },
  { href: '/assistant/settings', label: 'Einstellungen', icon: SlidersHorizontal },
]

export function AthenaNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
      {TABS.map((tab) => {
        // Exakter Vergleich für den Chat-Tab: `startsWith` würde ihn auf jeder
        // Unterseite mit-aktivieren.
        const active = tab.href === '/assistant' ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              active
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
