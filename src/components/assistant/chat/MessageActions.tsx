'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dezente Aktionen unter einer Athena-Antwort. Am Handy immer sichtbar (kein
 * Hover), ab md nur bei Hover/Fokus der Nachricht (`group/msg` am Elternteil)
 * oder bei der letzten Nachricht.
 *
 * „Neu generieren" gibt es nur, wenn `onRegenerate` gesetzt ist (letzte Antwort, nicht busy,
 * ohne Bestätigungskarte — die Entscheidung trifft der Aufrufer). Der Server ersetzt dann die
 * letzte Antwort und speichert die Nutzernachricht nicht ein zweites Mal (Flag `regenerate`).
 */
export function MessageActions({
  text,
  alwaysVisible,
  onRegenerate,
}: {
  text: string
  alwaysVisible: boolean
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Zwischenablage gesperrt (z. B. unsicherer Kontext) — kein Feedback statt falschem Häkchen.
    }
  }

  const hatText = text.trim().length > 0
  if (!hatText && !onRegenerate) return null

  const knopf =
    'flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <div
      className={cn(
        'mt-1 flex items-center transition-opacity',
        !alwaysVisible &&
          'md:opacity-0 md:group-focus-within/msg:opacity-100 md:group-hover/msg:opacity-100',
      )}
    >
      {hatText && (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Kopiert' : 'Antwort kopieren'}
          className={cn(knopf, '-ml-2')}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label="Antwort neu generieren"
          className={cn(knopf, !hatText && '-ml-2')}
        >
          <RotateCcw className="size-3.5" />
          Neu generieren
        </button>
      )}
    </div>
  )
}
