'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, FolderKanban, Brain, BookOpen, ScrollText, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/assistant', label: 'Chat', icon: MessageSquare },
  { href: '/assistant/projekte', label: 'Projekte', icon: FolderKanban },
  { href: '/assistant/memory', label: 'Speicher', icon: Brain },
  { href: '/assistant/knowledge', label: 'Wissen', icon: BookOpen },
  { href: '/assistant/logs', label: 'Logs', icon: ScrollText },
  { href: '/assistant/settings', label: 'Einstellungen', icon: SlidersHorizontal },
]

/**
 * Reiter in der Kopfzeile. Am Handy nur Symbole (der aktive Reiter behält sein Wort), damit alle
 * fünf ohne Umbruch in eine Zeile passen; ab `sm` mit Beschriftung. Tap-Ziel mindestens 40 px.
 */
export function AthenaNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Athena"
      className="-mr-4 min-w-0 flex-1 overflow-x-auto pr-4 sm:mr-0 sm:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* `ml-auto` statt `justify-end` am scrollenden Container: bei `justify-end` läuft ein
          Überstand nach LINKS und ist dort nicht erreichbar (scrollLeft kann nicht negativ
          werden). Der Auto-Rand schiebt die Reiter nach rechts, solange Platz ist, und fällt
          bei Überlauf auf 0 – dann scrollt die Leiste normal von links. */}
      <div className="ml-auto flex w-max gap-1">
      {TABS.map((tab) => {
        // Exakter Vergleich für den Chat-Tab: `startsWith` würde ihn auf jeder
        // Unterseite mit-aktivieren.
        const active = tab.href === '/assistant' ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <tab.icon className="size-4" />
            <span className={cn(!active && 'hidden sm:inline')}>{tab.label}</span>
          </Link>
        )
      })}
      </div>
    </nav>
  )
}
