import Link from 'next/link'
import type { Ansicht } from '@/lib/vertraege/rechnen'

const LABEL: Record<Ansicht, string> = { alle: 'Alle', fixkosten: 'Fixkosten', sparraten: 'Sparraten', inaktiv: 'Inaktiv' }

/**
 * Ansichts-Chips (Alle / Fixkosten / Sparraten / Inaktiv) als Links mit `?ansicht=`: die Seite bleibt
 * eine Server-Komponente, Zurück-Taste und Teilen funktionieren. Chips mit 0 Treffern entfallen, außer „Alle“.
 */
export function VertraegeAnsicht({ aktiv, zahlen }: { aktiv: Ansicht; zahlen: Record<Ansicht, number> }) {
  const sichtbar = (Object.keys(LABEL) as Ansicht[]).filter(a => a === 'alle' || zahlen[a] > 0 || a === aktiv)
  return (
    <nav aria-label="Ansicht" className="flex min-w-0 flex-wrap gap-2">
      {sichtbar.map(a => (
        <Link
          key={a}
          href={a === 'alle' ? '/finance/contracts' : `/finance/contracts?ansicht=${a}`}
          scroll={false}
          aria-current={a === aktiv ? 'page' : undefined}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors md:min-h-8 md:px-3 ${
            a === aktiv ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          {LABEL[a]}
          <span className="text-xs tabular-nums text-muted-foreground">{zahlen[a]}</span>
        </Link>
      ))}
    </nav>
  )
}
