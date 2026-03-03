'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  CircleDollarSign,
  Target,
  BarChart3,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/login/actions'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/finance', label: 'Finance', icon: TrendingUp },
  { href: '/crypto', label: 'Crypto', icon: CircleDollarSign },
  { href: '/strategy', label: 'Strategy', icon: Target },
  { href: '/tpi', label: 'TPI', icon: BarChart3 },
]

interface SidebarProps {
  email: string
}

export function Sidebar({ email }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar shrink-0">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">
          Athena Finance
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Button
              key={href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(
                'w-full justify-start gap-2.5 font-normal text-sidebar-foreground',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isActive &&
                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              )}
            >
              <Link href={href}>
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            </Button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-1">
        <p className="truncate px-2 py-1 text-xs text-muted-foreground">{email}</p>
        <form>
          <Button
            formAction={signOut}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4 shrink-0" />
            Abmelden
          </Button>
        </form>
      </div>
    </aside>
  )
}
