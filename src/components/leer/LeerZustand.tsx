import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type LeerAktion = {
  label: string
  href: string
}

type Props = {
  /** Kurzer Titel, sagt was fehlt („Noch keine Konten“). */
  titel: string
  /** 1–2 Sätze: wozu die Seite/der Bereich dient und was passiert, sobald Daten da sind. */
  text: React.ReactNode
  icon?: LucideIcon
  /** Primäre Aktion: der nächste sinnvolle Schritt. */
  aktion?: LeerAktion
  /** Zusätzliche Aktion, z. B. Dialog-Auslöser (AddAccountDialog o. Ä.) statt eines Links. */
  aktionNode?: React.ReactNode
  /** Sekundäre Aktion (Textlink). */
  sekundaer?: LeerAktion
  /**
   * 'karte'      gestrichelter Rahmen wie die bisherigen Leerkarten (Seiten und Listen),
   * 'eingebettet' ohne Rahmen, für das Innere einer vorhandenen Karte (Chart-Fläche, Tabelle),
   * 'kompakt'    schmale Variante für Kacheln (z. B. Dashboard-Karten).
   */
  variante?: 'karte' | 'eingebettet' | 'kompakt'
  className?: string
  children?: React.ReactNode
}

/**
 * Ruhiger, einheitlicher Leerzustand: Symbol, Titel, Erklärung und höchstens eine primäre Aktion.
 * Reiner Server-Baustein (kein State): auch in Server Components verwendbar. Aktionen mit
 * Dialogen übergibt man als `aktionNode`.
 */
export function LeerZustand({
  titel, text, icon: Icon, aktion, aktionNode, sekundaer, variante = 'karte', className, children,
}: Props) {
  const kompakt = variante === 'kompakt'
  return (
    <div
      role="status"
      className={cn(
        'flex min-w-0 flex-col items-center text-center',
        variante === 'karte' && 'rounded-lg border border-dashed border-border bg-card px-4 py-10 sm:py-12',
        variante === 'eingebettet' && 'px-4 py-10',
        kompakt && 'justify-center gap-1 px-2 py-4',
        className,
      )}
    >
      {Icon && <Icon className={cn('text-muted-foreground', kompakt ? 'size-5' : 'size-6')} aria-hidden />}
      <p className={cn('font-medium text-foreground', Icon && (kompakt ? 'mt-1' : 'mt-3'), 'text-sm')}>
        {titel}
      </p>
      <p className={cn('text-muted-foreground', kompakt ? 'max-w-[16rem] text-xs' : 'mt-1 max-w-md text-sm')}>{text}</p>
      {children}
      {(aktion || aktionNode || sekundaer) && (
        <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-2', kompakt ? 'mt-2' : 'mt-4')}>
          {aktion && (
            <Button asChild size={kompakt ? 'sm' : 'default'}>
              <Link href={aktion.href}>{aktion.label}</Link>
            </Button>
          )}
          {aktionNode}
          {sekundaer && (
            <Link
              href={sekundaer.href}
              className="inline-flex min-h-10 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sekundaer.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
