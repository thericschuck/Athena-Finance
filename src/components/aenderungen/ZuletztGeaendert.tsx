import { cn } from '@/lib/utils'
import { datumDe, relativeZeit } from '@/lib/aenderungen/format'
import type { ZuletztGeaendertInfo } from '@/lib/data/aenderungen'

function werText(wer: string): string {
  if (wer === 'Du') return 'von dir'
  if (wer === 'System') return 'durch das System'
  if (wer === 'Unbekannt') return 'von unbekannt'
  return `von ${wer}`
}

/**
 * Dezente Zeile "Zuletzt geändert von Malik, vor 2 Stunden". Reiner Server-Baustein. Ohne Info (Alleinstehende oder
 * kein Logeintrag) wird nichts gerendert; die Aufrufer laden die Info nur bei mehreren Haushaltsmitgliedern.
 * Tooltip: was geändert wurde und das genaue Datum.
 */
export function ZuletztGeaendert({ info, className }: { info?: ZuletztGeaendertInfo | null; className?: string }) {
  if (!info) return null
  const rel = relativeZeit(info.wann)
  const text = `Zuletzt geändert ${werText(info.wer)}, ${/^\d/.test(rel) ? `am ${rel}` : rel}`
  return (
    <p
      className={cn('min-w-0 truncate text-xs text-muted-foreground', className)}
      title={`${info.aktion.charAt(0).toUpperCase()}${info.aktion.slice(1)} (${datumDe(info.wann)})`}
    >
      {text}
    </p>
  )
}
