'use client'

import { AlertCircle, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatGroesse, type DateiArt } from '@/lib/assistant/dateien'
import { kuerzeName } from '@/lib/assistant/anhaenge'
import type { Anhang } from '@/components/assistant/chat/useAnhaenge'

/** Symbol je Dateiart — gleiche Zuordnung im Eingabefeld und im Verlauf. */
export function DateiIcon({ art, name, className }: { art: DateiArt; name: string; className?: string }) {
  if (art === 'bild') return <ImageIcon className={className} />
  if (art === 'text' && /\.(csv|tsv)$/i.test(name)) return <FileSpreadsheet className={className} />
  return <FileText className={className} />
}

/**
 * Chips der Anhänge über dem Textfeld, im selben Rahmen. Eine Zeile, die bei Bedarf seitlich
 * scrollt, damit der Eingabebereich nicht in die Höhe wächst.
 */
export function AnhangChips({
  anhaenge,
  onEntfernen,
}: {
  anhaenge: Anhang[]
  onEntfernen: (key: string) => void
}) {
  if (anhaenge.length === 0) return null
  return (
    <ul
      aria-label="Anhänge"
      className="flex gap-1.5 overflow-x-auto overscroll-x-contain px-2 pt-2 [scrollbar-width:thin]"
    >
      {anhaenge.map((a) => (
        <li
          key={a.key}
          title={a.fehler ?? a.name}
          className={cn(
            'flex h-10 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 pr-1 text-xs sm:h-8',
            a.status === 'fehler'
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-border bg-muted/50 text-foreground',
          )}
        >
          {a.status === 'laedt' ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Lädt hoch" />
          ) : a.status === 'fehler' ? (
            <AlertCircle className="size-3.5 shrink-0" aria-label="Fehler" />
          ) : (
            <DateiIcon art={a.art} name={a.name} className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="max-w-[9rem] truncate">{kuerzeName(a.name)}</span>
          <span className="shrink-0 text-muted-foreground">
            {a.status === 'fehler' ? (a.fehler ? 'Fehler' : '') : formatGroesse(a.size)}
          </span>
          <button
            type="button"
            onClick={() => onEntfernen(a.key)}
            aria-label={`${a.name} entfernen`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-sm:size-9 sm:size-6"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
