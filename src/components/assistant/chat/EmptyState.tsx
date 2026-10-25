'use client'

import { useMemo } from 'react'
import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { startfragenFuerRoute } from '@/lib/assistant/starter'

/** Leerzustand mit Startfragen, die zur aktuellen Seite passen. Am Handy als
    Liste untereinander, ab sm als Chips. */
export function EmptyState({ pathname, onPick }: { pathname: string; onPick: (q: string) => void }) {
  const fragen = useMemo(() => startfragenFuerRoute(pathname), [pathname])

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center sm:py-8">
      {/* Das Medaillon vor dem ersten Zug etwas größer: danach steht dasselbe
          Gesicht klein an jeder Antwort. */}
      <AthenaAvatar size={56} />

      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">Athena</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Liest deine Finanzdaten und schlägt Änderungen vor — ausgeführt wird nur, was du bestätigst.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        {fragen.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="min-h-10 rounded-xl border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:rounded-full sm:text-center sm:text-xs"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
