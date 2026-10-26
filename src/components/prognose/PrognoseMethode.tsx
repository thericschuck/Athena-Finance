'use client'

import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * „Wie wird gerechnet?“ als Popover am Kopf der Seite statt eines langen Textblocks. Der Inhalt kommt
 * fertig von der Server-Seite (children); die Karte ist höchstens so breit wie der Bildschirm und
 * scrollt bei Bedarf in sich.
 */
export function PrognoseMethode({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground sm:h-8"
        >
          <Info className="size-3.5" aria-hidden /> Wie wird gerechnet?
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-[min(26rem,calc(100vw-2rem))] space-y-2 overflow-y-auto p-4 text-xs leading-relaxed text-muted-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
