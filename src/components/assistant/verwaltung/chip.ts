import { cn } from '@/lib/utils'

/** Filter-Chip im App-Stil (Logs-Filter, Kategorien im Speicher, Tags im Wissen). */
export function chipKlasse(aktiv: boolean, extra?: string): string {
  return cn(
    'inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm transition-colors',
    aktiv
      ? 'border-foreground bg-foreground text-background'
      : 'border-border text-muted-foreground hover:bg-muted',
    extra,
  )
}

/** Kleine, nicht klickbare Beschriftung (Kategorie, Tag) in einer Eintragszeile. */
export const LABEL_KLASSE =
  'rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground'
