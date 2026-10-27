'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { PageWrapper } from '@/components/layout/page-wrapper'
import { AssistantSheet } from '@/components/assistant/AssistantSheet'
import { useSettings } from '@/components/providers/settings-context'
import { OliveVines } from '@/components/landing/olive-vines'
import { PrivacyToggle } from '@/components/layout/privacy-toggle'
import type { ScopeSwitcherProps } from '@/components/haushalt/ScopeSwitcher'

/**
 * Pro Bereich unterschiedliche Ranken-Platzierung (Seite/Dichte/Größe) statt
 * überall derselben beidseitigen Vollkachel — die wirkte auf jeder Seite wie
 * dieselbe Tapete. `null` lässt eine Seite bewusst frei (Settings trägt
 * bereits die Athena-Statue, Assistant lebt vom Lesefluss).
 */
type VineVariant = { sides: Array<'l' | 'r'>; maxBranches?: number; opacity: number; width: string }
const VINE_VARIANTS: Record<string, VineVariant | null> = {
  '/dashboard':             { sides: ['l', 'r'], maxBranches: 2, opacity: 0.09, width: '130px' },
  '/finance':               { sides: ['r'],                     opacity: 0.11, width: '150px' },
  // Investing ist ein Bereich (Sidebar-Gruppe über /crypto, /depot, /strategy) —
  // dieselbe Ranken-Platzierung, damit sich der Wechsel zwischen den drei
  // Unterbereichen nicht wie ein Sprung in eine andere Gegend anfühlt.
  '/investing':             { sides: ['l'],      maxBranches: 2, opacity: 0.12, width: '160px' },
  '/crypto':                { sides: ['l'],      maxBranches: 2, opacity: 0.12, width: '160px' },
  '/strategy':              { sides: ['l'],      maxBranches: 2, opacity: 0.12, width: '160px' },
  '/depot':                 { sides: ['l'],      maxBranches: 2, opacity: 0.12, width: '160px' },
  '/analyse':               { sides: ['l'],      maxBranches: 2, opacity: 0.1,  width: '150px' },
  '/settings':              null,
  '/assistant':             null,
}
const DEFAULT_VINE_VARIANT: VineVariant = { sides: ['l', 'r'], maxBranches: 1, opacity: 0.08, width: '120px' }

function vineVariantFor(pathname: string): VineVariant | null {
  const section = Object.keys(VINE_VARIANTS).find(p => pathname === p || pathname.startsWith(`${p}/`))
  if (section) return VINE_VARIANTS[section]
  return DEFAULT_VINE_VARIANT
}

export function AppShell({
  children, email, displayName, avatarUrl, scope,
}: {
  children: React.ReactNode
  email: string
  displayName: string | null
  avatarUrl: string | null
  scope?: Pick<ScopeSwitcherProps, 'available' | 'active' | 'partnerName'>
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { themePreset } = useSettings()
  const isDarkAthena = themePreset === 'athena-dark'
  const isAthena = themePreset === 'athena' || isDarkAthena
  const vineVariant = isAthena ? vineVariantFor(pathname) : null

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Navigation schliessen"
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
        scope={scope}
      />

      <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Olivenranken als leiser Rahmen des Content-Bereichs — nur Athena
            Light/Dark, statisch (keine Wachs-/Wiege-Animation: reine
            Dauerdekoration, kein erzählerischer Moment wie im Landing-Hero).
            `-z-10` schiebt sie hinter Header/PageWrapper — das setzt
            `isolate` auf DIESEM Wrapper voraus: ohne eigene Stacking-Context
            würde der negative z-index bis zum nächsten echten Kontext
            durchschlagen (hier: die äußere `bg-background`-Fläche in
            AppShell) und die Ranken komplett dahinter verschwinden lassen —
            sichtbar unsichtbar statt nur "hinter den Karten". */}
        {vineVariant && (
          <div className="pointer-events-none absolute inset-0 -z-10">
            <OliveVines
              tone={isDarkAthena ? 'dark' : 'light'}
              opacity={vineVariant.opacity}
              width={vineVariant.width}
              sides={vineVariant.sides}
              maxBranches={vineVariant.maxBranches}
              static
              swaying={false}
            />
          </div>
        )}

        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
            aria-label="Navigation"
          >
            <Menu className="size-5" />
          </button>
          <span className="flex-1 text-sm font-semibold tracking-tight">Athena Finance</span>
          <PrivacyToggle />
        </header>

        <PageWrapper>{children}</PageWrapper>
      </div>

      {/* Auf der eigenen Assistant-Seite gibt es die Konversation schon
          großflächig — kein zweites, schwebendes Sheet-Trigger nötig. */}
      {!pathname.startsWith('/assistant') && <AssistantSheet />}
    </div>
  )
}
