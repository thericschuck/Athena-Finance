import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fortschritt, naechsterSchritt, type Schritt } from '@/lib/leer/erste-schritte'

/**
 * Checkliste „Erste Schritte“ (ohne State, in Server und Client Components verwendbar).
 * Erledigte Schritte sind abgehakt und gedimmt; der nächste offene Schritt trägt die primäre
 * Aktion, die übrigen einen schlichten Link. Der Fortschrittsbalken zählt nur Pflichtschritte.
 */
export function ErsteSchritteListe({ schritte, className }: { schritte: Schritt[]; className?: string }) {
  const f = fortschritt(schritte)
  const naechster = naechsterSchritt(schritte)
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-center gap-3">
        <span
          role="progressbar"
          aria-valuenow={f.prozent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${f.erledigt} von ${f.gesamt} Schritten erledigt`}
          className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <span className="block h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${f.prozent}%` }} />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.erledigt} von {f.gesamt}</span>
      </div>
      <ol className="divide-y divide-border">
        {schritte.map((s, i) => {
          const istNaechster = naechster?.id === s.id
          return (
            <li key={s.id} className="flex items-start gap-3 py-3">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                  s.erledigt ? 'border-success/40 bg-success/10 text-success' : 'border-border text-muted-foreground',
                )}
              >
                {s.erledigt ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', s.erledigt && 'text-muted-foreground')}>
                  {s.titel}
                  {s.optional && <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>}
                  {s.erledigt && <span className="sr-only"> (erledigt)</span>}
                </p>
                {!s.erledigt && <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>}
                {!s.erledigt && (
                  <div className="mt-2">
                    {istNaechster ? (
                      <Button asChild size="sm"><Link href={s.href}>{s.aktion}</Link></Button>
                    ) : (
                      <Link
                        href={s.href}
                        className="inline-flex min-h-10 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
                      >
                        {s.aktion}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
