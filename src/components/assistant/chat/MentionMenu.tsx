'use client'

import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MENTION_LABEL, type MentionOption } from '@/lib/assistant/mentions'

export const MENTION_LISTBOX_ID = 'athena-mention-liste'

export function mentionOptionId(index: number): string {
  return `athena-mention-${index}`
}

/**
 * Auswahl der @-Bezüge über dem Eingabefeld. Die Liste kommt bereits gefiltert UND in
 * Anzeigereihenfolge (nach Gruppen sortiert), `aktiv` ist der Index darin. Der Fokus bleibt im
 * Textfeld (mousedown wird verschluckt); Tastatursteuerung liegt dort, hier nur Anzeige und Tap.
 *
 * Am Handy volle Breite des Eingabebereichs, höchstens ~40 % der Höhe, scrollbar.
 */
export function MentionMenu({
  optionen,
  aktiv,
  laedt,
  onWaehlen,
  onHover,
}: {
  optionen: MentionOption[]
  aktiv: number
  laedt: boolean
  onWaehlen: (option: MentionOption) => void
  onHover: (index: number) => void
}) {
  const aktivRef = useRef<HTMLDivElement>(null)

  // Mit den Pfeiltasten gewählte Zeile in den sichtbaren Bereich holen.
  useEffect(() => {
    aktivRef.current?.scrollIntoView({ block: 'nearest' })
  }, [aktiv])

  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-[40dvh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
      {laedt && optionen.length === 0 ? (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Lädt…
        </p>
      ) : (
        <div id={MENTION_LISTBOX_ID} role="listbox" aria-label="Bezug wählen">
          {optionen.map((o, i) => (
            <div key={`${o.typ}:${o.id}`}>
              {(i === 0 || optionen[i - 1].typ !== o.typ) && (
                <p
                  role="presentation"
                  className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {MENTION_LABEL[o.typ]}
                </p>
              )}
              <div
                ref={i === aktiv ? aktivRef : undefined}
                id={mentionOptionId(i)}
                role="option"
                aria-selected={i === aktiv}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onWaehlen(o)}
                className={cn(
                  'flex min-h-11 cursor-pointer flex-col justify-center rounded-md px-3 py-1.5',
                  i === aktiv && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="truncate text-sm">{o.label}</span>
                {o.sub && <span className="truncate text-xs text-muted-foreground">{o.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
