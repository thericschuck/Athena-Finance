import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEVEL_STYLES: Record<string, string> = {
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-muted text-muted-foreground',
  warn: 'bg-warning/15 text-warning',
  error: 'bg-destructive/15 text-destructive',
}

export type LogZeileDaten = {
  id: string
  level: string
  eventLabel: string
  message: string
  meta: unknown
  durationMs: number | null
  zeit: string
  conversationId: string | null
}

/**
 * Eine Logzeile, aufklappbar per natives <details> (kein Client-Code nötig).
 * Zeile 1: Zeit, Badge, Dauer; Zeile 2: Meldung (2 Zeilen). Die Titelfläche ist mindestens 44 px hoch.
 * Meta-JSON und Session-Link stehen erst im aufgeklappten Teil.
 */
export function LogZeile({ log }: { log: LogZeileDaten }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer select-none list-none items-start gap-2 px-3 py-2 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{log.zeit}</span>
              <span
                className={cn(
                  'min-w-0 truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                  LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info,
                )}
              >
                {log.eventLabel}
              </span>
              {log.durationMs !== null && (
                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                  {(log.durationMs / 1000).toFixed(1)} s
                </span>
              )}
            </span>
            {log.message && (
              <span className="line-clamp-2 break-words text-muted-foreground group-open:line-clamp-none">
                {log.message}
              </span>
            )}
          </span>
        </summary>
        <div className="space-y-2 px-3 pb-3 pl-9">
          {log.conversationId && (
            <Link
              href={`/assistant?s=${log.conversationId}`}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-3.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              Zur Session
            </Link>
          )}
          {log.meta != null && (
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(log.meta, null, 2)}
            </pre>
          )}
        </div>
      </details>
    </li>
  )
}
