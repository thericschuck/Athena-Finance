'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  CircleDollarSign,
  Target,
  Briefcase,
  History,
  BarChart2,
  Settings,
  LogOut,
  X,
  Landmark,
  ShoppingCart,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
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
  { href: '/assistant', label: 'Assistent', icon: Sparkles },
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
  { href: '/bank',                  label: 'Banking',              icon: Landmark     },
  { href: '/lebenshaltungskosten', label: 'Fixkosten',  icon: ShoppingCart },
  { href: '/depot',    label: 'Depot',         icon: Briefcase },
  { href: '/analyse',  label: 'Analyse',       icon: BarChart2 },
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
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <Logo size={24} priority />
          <span className="text-sm font-semibold text-sidebar-foreground tracking-tight truncate">Athena Finance</span>
        </div>
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
                  // Aktive Blattseite: volle Gold-Fläche mit dunkler Schrift
                  // (sidebar-primary/-foreground), exakt wie im Figma-Redesign —
                  // sidebar-accent bleibt für Hover und die Avatar-Kachel reserviert.
                  sectionActive && !children &&
                    'bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
                  // Aktiver Elternpunkt mit aufgeklappten Kindern: nur Text in Gold,
                  // keine volle Fläche (die Kinder öffnen sich direkt darunter).
                  sectionActive && children &&
                    'text-sidebar-primary font-medium',
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
        {/* Avatar + Name → Settings */}
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors group"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Avatar"
              className="size-7 rounded-full object-cover shrink-0 border border-sidebar-border"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <div className="size-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground shrink-0 select-none group-hover:bg-sidebar-border transition-colors">
              {getInitials(displayName, email)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {displayName && (
              <p className="truncate text-xs font-medium text-sidebar-foreground leading-tight">{displayName}</p>
            )}
            <p className="truncate text-xs text-muted-foreground leading-tight">{email}</p>
          </div>
        </Link>
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
