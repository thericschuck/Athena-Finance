'use client'

import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScopeLade } from '@/components/haushalt/ScopeLadeContext'
import type { ScopeHinweis } from '@/lib/leer/hinweis'

/**
 * Hinweis für Haushaltsmitglieder mit leerer Ansicht „Ich“: Daten können in „Gemeinsam“ liegen.
 * Der Wechsel nutzt dieselbe Server Action wie der ScopeSwitcher (setzt das Cookie, lädt neu).
 * Die Seite erzeugt den Hinweis mit `scopeHinweis()` (lib/leer/hinweis.ts) und rendert diese
 * Komponente nur, wenn er nicht null ist, also nur bei `ctx.available.length > 1`.
 */
export function ScopeLeerHinweis({ hinweis }: { hinweis: ScopeHinweis }) {
  const { laedt, wechseln } = useScopeLade()
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
        <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{hinweis.text}</span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={laedt}
        onClick={() => wechseln(hinweis.ziel)}
        className="shrink-0 self-start sm:self-auto"
      >
        {hinweis.aktion}
      </Button>
    </div>
  )
}
