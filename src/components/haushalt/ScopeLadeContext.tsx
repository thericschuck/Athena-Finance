'use client'

import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'
import { setScope } from '@/lib/haushalt/actions'
import type { ScopeName } from '@/lib/haushalt/scope'
import { cn } from '@/lib/utils'

type ScopeLadeWert = {
  /** Angezeigter Scope: waehrend des Wechsels sofort der gewaehlte (optimistisch), danach der echte vom Server. */
  scope: ScopeName
  /** `true`, bis die Server Action samt neu gerendertem Layout/Seite durch ist. */
  laedt: boolean
  wechseln: (ziel: ScopeName) => void
}

const Ctx = createContext<ScopeLadeWert | null>(null)

/**
 * Haelt den Scope-Wechsel an EINER Stelle (AppShell), damit Umschalter, Leer-Hinweis, Fortschrittsbalken und
 * Seiteninhalt denselben Zustand sehen. `laedt` ist das `isPending` einer Transition mit async Funktion: React haelt
 * sie offen, bis die Server Action beendet UND das daraus entstandene Router-Update (revalidatePath -> neuer RSC-Baum)
 * committed ist. Dieselbe Transition haelt auch den optimistischen Wert; erst danach wird er durch `active` ersetzt.
 */
export function ScopeLadeProvider({ active, children }: { active: ScopeName; children: React.ReactNode }) {
  const [laedt, startTransition] = useTransition()
  const [scope, setOptimistic] = useOptimistic(active)

  const wechseln = useCallback((ziel: ScopeName) => {
    startTransition(async () => {
      setOptimistic(ziel)
      try {
        await setScope(ziel)
      } catch {
        // Der optimistische Wert faellt am Ende der Transition von selbst auf `active` zurueck.
        toast.error('Ansicht konnte nicht gewechselt werden. Bitte noch einmal versuchen.')
      }
    })
  }, [setOptimistic])

  const wert = useMemo(() => ({ scope, laedt, wechseln }), [scope, laedt, wechseln])
  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>
}

const FALLBACK: ScopeLadeWert = { scope: 'ich', laedt: false, wechseln: () => {} }

export function useScopeLade(): ScopeLadeWert {
  return useContext(Ctx) ?? FALLBACK
}

/** Duenner Balken am oberen Rand, solange der Scope wechselt (animiert nur ohne prefers-reduced-motion). */
export function ScopeLadeBalken() {
  const { laedt } = useScopeLade()
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden transition-opacity duration-200"
      style={{ opacity: laedt ? 1 : 0 }}
    >
      <div className="scope-lade-balken h-full w-1/2 bg-primary" />
    </div>
  )
}

/**
 * Huellt den Seiteninhalt: waehrend des Wechsels gedimmt und nicht klickbar, sonst unveraendert.
 * Gleiche Flex-Rolle wie zuvor die Seite selbst (kein Layoutsprung), der Inhalt bleibt im DOM.
 */
export function ScopeLadeInhalt({ children }: { children: React.ReactNode }) {
  const { laedt } = useScopeLade()
  return (
    <div
      aria-busy={laedt}
      data-scope-laedt={laedt ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col transition-opacity duration-200',
        laedt && 'pointer-events-none select-none opacity-[0.55]',
      )}
    >
      {children}
    </div>
  )
}
