'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  CircleDollarSign,
  Target,
  BarChart3,
  History,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/login/actions'

type NavChild = { href: string; label: string }
type NavItem  = {
  href:      string
  label:     string
  icon:      React.ElementType
  children?: NavChild[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/finance', label: 'Finance', icon: TrendingUp,
    children: [
      { href: '/finance/accounts',     label: 'Konten' },
      { href: '/finance/transactions', label: 'Transaktionen' },
      { href: '/finance/categories',   label: 'Kategorien' },
      { href: '/finance/debts',        label: 'Schulden' },
      { href: '/finance/contracts',    label: 'Verträge' },
      { href: '/finance/goals',        label: 'Sparziele' },
    ],
  },
  {
    href: '/crypto', label: 'Crypto', icon: CircleDollarSign,
    children: [
      { href: '/crypto',              label: 'Portfolio' },
      { href: '/crypto/rebalancing',  label: 'Rebalancing' },
      { href: '/crypto/assets',       label: 'Assets' },
    ],
  },
  {
    href: '/strategy', label: 'Strategy', icon: Target,
    children: [
      { href: '/strategy/indicators', label: 'Indikatoren' },
      { href: '/strategy/tests',      label: 'Backtests' },
      { href: '/strategy/combos',     label: 'Combos' },
      { href: '/strategy/strategies', label: 'Strategien' },
    ],
  },
  { href: '/tpi',      label: 'TPI',           icon: BarChart3 },
  { href: '/history',  label: 'Historie',      icon: History   },
  { href: '/settings', label: 'Einstellungen', icon: Settings  },
]

interface SidebarProps {
  email: string
  displayName: string | null
  avatarUrl: string | null
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function getInitials(name: string | null, email: string): string {
  const src = name?.trim() || email
  return src.slice(0, 2).toUpperCase()
}

export function Sidebar({ email, displayName, avatarUrl, mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-sidebar-border bg-sidebar',
        'fixed inset-y-0 left-0 z-50 w-72 h-full',
        'transition-transform duration-200 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'md:static md:h-screen md:w-56 md:translate-x-0 md:shrink-0',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <span className="flex-1 text-sm font-semibold text-sidebar-foreground tracking-tight">
          Athena Finance
        </span>
        <button
          className="md:hidden rounded-md p-1.5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          onClick={onMobileClose}
          aria-label="Schliessen"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, children }) => {
          const sectionActive = pathname === href || pathname.startsWith(`${href}/`)

          return (
            <div key={href}>
              {/* Top-level item */}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  'w-full justify-start gap-2.5 font-normal text-sidebar-foreground',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  sectionActive && !children &&
                    'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                  sectionActive && children &&
                    'text-sidebar-accent-foreground font-medium',
                )}
              >
                <Link href={children ? children[0].href : href}>
                  <Icon className="size-4 shrink-0" />
                  {label}
                </Link>
              </Button>

              {/* Sub-items — CSS grid trick for smooth height animation */}
              {children && (
                <div className={cn('subnav-container', sectionActive && 'open')}>
                  <div className="subnav-inner">
                    <div className="ml-3 mt-0.5 mb-1 pl-3 border-l border-sidebar-border space-y-0.5">
                      {children.map(child => {
                        const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`)
                        return (
                          <Button
                            key={child.href}
                            variant="ghost"
                            size="sm"
                            asChild
                            className={cn(
                              'w-full justify-start font-normal text-sm text-sidebar-foreground',
                              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                              childActive &&
                                'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                            )}
                          >
                            <Link href={child.href}>{child.label}</Link>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-1">
        {/* Avatar + Name */}
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar"
              className="size-7 rounded-full object-cover shrink-0 border border-sidebar-border"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="size-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground shrink-0 select-none">
              {getInitials(displayName, email)}
            </div>
          )}
          <div className="min-w-0">
            {displayName && (
              <p className="truncate text-xs font-medium text-sidebar-foreground leading-tight">{displayName}</p>
            )}
            <p className="truncate text-xs text-muted-foreground leading-tight">{email}</p>
          </div>
        </div>
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
