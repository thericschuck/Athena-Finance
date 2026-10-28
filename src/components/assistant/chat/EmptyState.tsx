'use client'

import { useMemo } from 'react'
import { AthenaAvatar } from '@/components/assistant/AthenaAvatar'
import { Sparkles } from 'lucide-react'
import { KENNENLERN_LABEL, kennenlernPrompt, startfragenFuerRoute } from '@/lib/assistant/starter'
import { useNutzerName } from '@/components/providers/nutzer-context'

/** Leerzustand mit Startfragen, die zur aktuellen Seite passen. Am Handy als
    Liste untereinander, ab sm als Chips. */
export function EmptyState({
  pathname,
  onPick,
  onFill,
}: {
  pathname: string
  /** Startfrage: wird direkt gesendet. */
  onPick: (q: string) => void
  /** Kennenlern-Chip: legt den Text ins Eingabefeld (ohne zu senden). Fehlt sie, wird er wie eine Startfrage gesendet. */
  onFill?: (text: string) => void
}) {
  const fragen = useMemo(() => startfragenFuerRoute(pathname), [pathname])
  const name = useNutzerName()

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

      {/* Hervorgehobener Einstieg ins Kennenlern-Gespräch: primärer Rand und Icon, am Handy volle Breite. */}
      <button
        type="button"
        onClick={() => (onFill ?? onPick)(kennenlernPrompt(name))}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/15 sm:w-auto sm:rounded-full"
      >
        <Sparkles className="size-4 text-primary" aria-hidden />
        {KENNENLERN_LABEL}
      </button>

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
