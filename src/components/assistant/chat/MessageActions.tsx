'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dezente Aktionen unter einer Athena-Antwort. Am Handy immer sichtbar (kein
 * Hover), ab md nur bei Hover/Fokus der Nachricht (`group/msg` am Elternteil)
 * oder bei der letzten Nachricht.
 *
 * „Neu generieren" fehlt bewusst: `regenerate` schickt die Nutzernachricht
 * erneut an die Route, die sie dann ein zweites Mal in ai_messages schreibt
 * (und aufs Tageslimit anrechnet).
 */
export function MessageActions({ text, alwaysVisible }: { text: string; alwaysVisible: boolean }) {
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

  if (!text.trim()) return null

  return (
    <div
      className={cn(
        'mt-1 flex items-center transition-opacity',
        !alwaysVisible &&
          'md:opacity-0 md:group-focus-within/msg:opacity-100 md:group-hover/msg:opacity-100',
      )}
    >
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Kopiert' : 'Antwort kopieren'}
        className="-ml-2 flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  )
}
