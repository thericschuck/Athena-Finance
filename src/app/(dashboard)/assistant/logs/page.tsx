import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { estimateCostUsd, formatUsd, type UsageLike } from '@/lib/assistant/cost'
import { ClearLogsButton } from '@/components/assistant/ClearLogsButton'

export const dynamic = 'force-dynamic'

const LEVEL_FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warnungen' },
  { value: 'error', label: 'Fehler' },
] as const

const EVENT_LABELS: Record<string, string> = {
  'run.start': 'Lauf gestartet',
  'run.finish': 'Lauf beendet',
  'run.error': 'Lauf abgebrochen',
  'run.limit': 'Limit erreicht',
  'step.finish': 'Schritt',
  'tool.error': 'Werkzeugfehler',
  'memory.write': 'Speicher geschrieben',
  'memory.delete': 'Speicher gelöscht',
  'knowledge.write': 'Wissen geschrieben',
  'knowledge.delete': 'Wissen gelöscht',
  'action.proposed': 'Aktion vorgeschlagen',
  'action.executed': 'Aktion ausgeführt',
  'action.rejected': 'Aktion verworfen',
  'action.failed': 'Aktion fehlgeschlagen',
  'session.create': 'Session angelegt',
  'session.rename': 'Session umbenannt',
  'session.delete': 'Session gelöscht',
  'web.search': 'Web-Recherche',
}

const LEVEL_STYLES: Record<string, string> = {
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-muted text-muted-foreground',
  warn: 'bg-warning/15 text-warning',
  error: 'bg-destructive/15 text-destructive',
}

function timestamp(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default async function AthenaLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>
}) {
  const [{ level = 'all' }, { supabase, user }] = await Promise.all([searchParams, getAuthUser()])
  if (!user) return null

  let query = supabase
    .from('ai_logs')
    .select('id, level, event, message, meta, duration_ms, created_at, conversation_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(300)
  if (level !== 'all') query = query.eq('level', level)

  const { data: logs } = await query

  // Kennzahlen der letzten 24 Stunden — beantwortet die erste Frage, die man an
  // ein System-Log hat ("läuft das gerade sauber und was kostet es").
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { data: recent } = await supabase
    .from('ai_logs')
    .select('event, level, meta, duration_ms')
    .eq('user_id', user.id)
    .gte('created_at', since)

  const runs = (recent ?? []).filter((r) => r.event === 'run.finish')
  const errors = (recent ?? []).filter((r) => r.level === 'error').length
  const totalCost = runs.reduce((sum, run) => {
    const meta = run.meta as { model?: string; usage?: UsageLike } | null
    return sum + (estimateCostUsd(meta?.model ?? null, meta?.usage ?? null) ?? 0)
  }, 0)
  const avgDuration = runs.length
    ? Math.round(runs.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / runs.length / 100) / 10
    : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Läufe (24 h)" value={String(runs.length)} />
        <Stat label="Fehler (24 h)" value={String(errors)} tone={errors > 0 ? 'bad' : undefined} />
        <Stat label="Kosten (24 h, geschätzt)" value={formatUsd(totalCost)} />
        <Stat label="Ø Dauer" value={avgDuration !== null ? `${avgDuration} s` : '—'} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {LEVEL_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={filter.value === 'all' ? '/assistant/logs' : `/assistant/logs?level=${filter.value}`}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm transition-colors',
                level === filter.value
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        <ClearLogsButton />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
        {(logs ?? []).length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Keine Einträge.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(logs ?? []).map((log) => (
              <li key={log.id} className="px-3 py-2 text-sm">
                <details>
                  <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {timestamp(log.created_at)}
                    </span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[11px] font-medium',
                        LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info,
                      )}
                    >
                      {EVENT_LABELS[log.event] ?? log.event}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {log.message}
                    </span>
                    {log.duration_ms !== null && (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {(log.duration_ms / 1000).toFixed(1)} s
                      </span>
                    )}
                    {log.conversation_id && (
                      <Link
                        href={`/assistant?s=${log.conversation_id}`}
                        className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Session
                      </Link>
                    )}
                  </summary>
                  {log.meta != null && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(log.meta, null, 2)}
                    </pre>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold', tone === 'bad' && 'text-destructive')}>
        {value}
      </p>
    </div>
  )
}
