'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  LineChart,
  BarChart2,
  Settings,
  LogOut,
  X,
  Sparkles,
  Gem,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { signOut } from '@/app/login/actions'
import { useSettings } from '@/components/providers/settings-context'
import { MeanderFrieze } from '@/components/landing/olive-vines'

type NavChild = {
  href:   string
  label:  string
  /**
   * Prefixe für die Aktiv-Erkennung, falls sie nicht am `href` hängen: „Planung"
   * zeigt auf /finance/contracts, soll aber auch auf Schulden und Sparzielen
   * leuchten. Gesetzt, ersetzt die Liste den `href`-Vergleich.
   */
  match?: string[]
}
type NavItem  = {
  href:      string
  label:     string
  icon:      React.ElementType
  children?: NavChild[]
  /**
   * Zusätzliche Prefixe, unter denen der Bereich als aktiv gilt. Nötig für
   * Gruppen, deren Kinder auf fremde Pfade zeigen („Investing" → /crypto,
   * /depot, /strategy).
   */
  match?:    string[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assistant', label: 'Athena', icon: Sparkles },
  // Die sechs Finance-Punkte waren nicht gleichrangig: Konten und Transaktionen
  // sind Alltag, Verträge/Schulden/Sparziele sind Vorhaben mit Zukunftsbezug,
  // Kategorien ist Stammdatenpflege. Jetzt vier Einträge, die tiefere Ebene
  // hängt an der Tab-Leiste der jeweiligen Route-Group (siehe
  // finance/(transaktionen)/ und finance/(planung)/layout.tsx).
  {
    href: '/finance', label: 'Finance', icon: TrendingUp,
    children: [
      { href: '/finance/accounts',     label: 'Konten' },
      { href: '/finance/transactions', label: 'Transaktionen',
        match: ['/finance/transactions', '/finance/categories'] },
      { href: '/finance/contracts',    label: 'Planung',
        match: ['/finance/contracts', '/finance/debts', '/finance/goals'] },
      // Hieß „Fixkosten" und lag auf /lebenshaltungskosten — derselbe Name, den
      // die Vertragsseite für ihre gebuchten Verpflichtungen benutzt („Fixkosten
      // nach Konto"). Zwei Nav-Punkte, ein Wort, zwei Datenmodelle: das hier
      // rechnet auf `budget_items` das nötige Mindesteinkommen aus.
      { href: '/finance/budget',       label: 'Budget' },
      { href: '/finance/steuer',       label: 'Steuer' },
    ],
  },
  // „Crypto", „Depot" und „Strategy" waren drei eigene Bereiche, sind aber
  // dasselbe Thema: Kapital, das Rendite erzeugen soll (Finance daneben ist das
  // Alltagsgeld). Als eine Gruppe braucht die Sidebar drei Einträge statt acht —
  // die Unterseiten der Bereiche hängen an der Tab-Leiste im Seitenkopf
  // (`SectionTabs`, siehe crypto/ und strategy/layout.tsx). Die URLs sind
  // bewusst unverändert geblieben; /investing leitet auf /crypto weiter.
  {
    href: '/investing', label: 'Investing', icon: LineChart,
    match: ['/crypto', '/depot', '/strategy'],
    children: [
      { href: '/crypto',              label: 'Krypto' },
      { href: '/depot',               label: 'Depot' },
      { href: '/strategy/indicators', label: 'Strategie', match: ['/strategy'] },
    ],
  },
  // Banking hatte hier bis vor Kurzem einen eigenen Punkt mit „Sync" und „Auswertung".
  // Beides ist dort weg, wo es hingehört: der Sync in den Kopf von Finance/Konten (er
  // aktualisiert Konten), die Auswertung als Unterpunkt von Analyse (sie wertet aus). Ein
  // Bereich weniger, und die Frage „verwalte ich Konten in Finance oder in Banking?"
  // stellt sich nicht mehr.
  {
    href: '/analyse', label: 'Analyse', icon: BarChart2,
    children: [
      // „Übersicht" läuft über `unified_transactions` (Bank + manuell), „Bankdaten" über
      // die gesyncten Rohdaten — der Unterschied steht im Kopf der jeweiligen Seite.
      { href: '/analyse',         label: 'Übersicht' },
      { href: '/analyse/banking', label: 'Bankdaten' },
      // War ein eigener Top-Level-Punkt „Historie" auf /history. Beides ist
      // Rückblick — die Charts hier, die Snapshot-Tabellen (Net Worth, Konten,
      // Portfolio, Monatsübersicht) dort — und die Frage „wo sehe ich die
      // Entwicklung meines Vermögens?" hatte zwei plausible Antworten.
      { href: '/analyse/verlauf', label: 'Verlauf' },
    ],
  },
  { href: '/inventar', label: 'Inventar',      icon: Gem       },
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
  const { themePreset } = useSettings()
  const isAthena = themePreset === 'athena' || themePreset === 'athena-dark'

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

      {/* Mäander-Fries — griechischer Schlüssel als leiser architektonischer
          Rahmen, nur für Athena Light/Dark (in anderen Themes stilfremd). */}
      {isAthena && (
        <div className="px-4 pt-2 text-sidebar-foreground">
          <MeanderFrieze id="sidebar-meander" color="currentColor" opacity={0.3} />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, children, match }) => {
          const sectionActive = [href, ...(match ?? [])].some(
            prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
          )

          return (
            <div key={href}>
              {/* Top-level item */}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  'w-full justify-start gap-2.5 font-normal text-sidebar-foreground',
                  // dark:hover:bg-sidebar-accent zusätzlich zum einfachen hover: nötig,
                  // weil der ghost-Button-Variant selbst `dark:hover:bg-accent/50`
                  // mitbringt (siehe button.tsx) — tailwind-merge dedupliziert nur
                  // Klassen mit IDENTISCHER Variantenkette. Ohne das Pendant überlebt
                  // der Accent-Wash in jedem Dark-Theme und legt sich über
                  // sidebar-accent/-primary (sichtbar als matschiger Hover).
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent',
                  // Aktive Blattseite: volle Gold-Fläche mit dunkler Schrift
                  // (sidebar-primary/-foreground), exakt wie im Figma-Redesign —
                  // sidebar-accent bleibt für Hover und die Avatar-Kachel reserviert.
                  sectionActive && !children &&
                    'bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground dark:hover:bg-sidebar-primary',
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
                        // Zeigt ein Kind auf die Bereichswurzel („Übersicht" in
                        // Analyse), gilt nur die exakte URL: mit `startsWith` wäre es
                        // auf jedem Unterpunkt mit-aktiv und zwei Einträge leuchteten
                        // gleichzeitig.
                        const prefix = child.match ?? child.href
                        const childActive = prefix === href
                          ? pathname === prefix
                          : pathname === prefix || pathname.startsWith(`${prefix}/`)
                        return (
                          <Button
                            key={child.href}
                            variant="ghost"
                            size="sm"
                            asChild
                            className={cn(
                              // h-7 statt der 32px von size="sm": auf großen Schirmen
                              // stehen alle drei Untergruppen dauerhaft offen, die vier
                              // Pixel pro Zeile entscheiden mit, ab welcher Fensterhöhe
                              // das ohne Scrollen passt.
                              'h-7 w-full justify-start font-normal text-sm text-sidebar-foreground',
                              // Unterpunkte fremder Bereiche sind dann ebenfalls sichtbar —
                              // gedämpft, damit nicht alle Zeilen gleich laut sind und der
                              // aktive Bereich weiter heraussticht.
                              !sectionActive && 'text-sidebar-foreground/55 hover:text-sidebar-accent-foreground',
                              // Siehe Kommentar beim Top-Level-Button oben — derselbe
                              // ghost-`dark:hover:bg-accent/50`-Konflikt.
                              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent',
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
            className="w-full justify-start gap-2.5 font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
          >
            <LogOut className="size-4 shrink-0" />
            Abmelden
          </Button>
        </form>
      </div>
    </aside>
  )
}
