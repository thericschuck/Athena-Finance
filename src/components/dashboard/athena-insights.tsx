'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, X, AlertTriangle, Info, AlertOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { dismissInsight } from '@/app/(dashboard)/dashboard/insight-actions'

export type InsightRow = {
  id: string
  type: string
  severity: string
  title: string
  body: string | null
  created_at: string
}

const SEVERITY = {
  info: { icon: Info, className: 'text-muted-foreground' },
  warning: { icon: AlertTriangle, className: 'text-warning' },
  critical: { icon: AlertOctagon, className: 'text-destructive' },
} as const

/**
 * Hinweise, die Athena angelegt hat. Anders als eine Chat-Antwort überleben sie
 * das Gespräch — deshalb stehen sie hier und nicht im Chat. Weggeklickte
 * Hinweise werden nicht gelöscht, sondern nur mit `dismissed_at` markiert; im
 * System-Log bleibt damit nachvollziehbar, was Athena wann bemerkt hat.
 */
export function AthenaInsights({ insights }: { insights: InsightRow[] }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const visible = insights.filter((insight) => !hidden.has(insight.id))
  if (visible.length === 0) return null

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-3.5 text-primary" />
          Athena
          <span className="ml-1 text-xs font-normal text-muted-foreground">{visible.length}</span>
        </h2>
        <Link
          href="/assistant"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Chat →
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {visible.map((insight) => {
          const { icon: Icon, className } = SEVERITY[insight.severity as keyof typeof SEVERITY] ?? SEVERITY.info
          return (
            <li key={insight.id} className="flex items-start gap-2.5">
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{insight.title}</p>
                {insight.body && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{insight.body}</p>
                )}
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Hinweis ausblenden"
                disabled={isPending}
                onClick={() => {
                  // Sofort ausblenden, Serverzustand danach — ein Klick auf „weg"
                  // soll nicht auf einen Roundtrip warten.
                  setHidden((prev) => new Set(prev).add(insight.id))
                  startTransition(async () => {
                    await dismissInsight(insight.id)
                    router.refresh()
                  })
                }}
              >
                <X className="size-3" />
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
