import { cn } from '@/lib/utils'

/**
 * Aktionsleiste eines Eintrags (Bearbeiten, Löschen, Anheften). Am Handy immer sichtbar, am Desktop
 * erst beim Überfahren oder Fokussieren der Zeile (Eltern braucht die Klasse `group`).
 * Die Buttons darin nutzen `AKTION_KLASSE`: 40-px-Ziele unter md.
 */
export function EintragAktionen({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center',
        'opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 md:focus-within:opacity-100',
      )}
    >
      {children}
    </div>
  )
}

export const AKTION_KLASSE = 'size-10 md:size-8'
