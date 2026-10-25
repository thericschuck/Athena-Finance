import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import { estimateCostUsd, formatUsd, type UsageLike } from '@/lib/assistant/cost'
import { ClearLogsButton } from '@/components/assistant/ClearLogsButton'
import { LogKennzahlen } from '@/components/assistant/logs/LogKennzahlen'
import { LogZeile } from '@/components/assistant/logs/LogZeile'
import { chipKlasse } from '@/components/assistant/verwaltung/chip'

export const dynamic = 'force-dynamic'

const LOG_LIMIT = 300

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

/** Immer in deutscher Zeit: auf dem Server (Vercel) läuft die Zeitzone sonst auf UTC. */
function timestamp(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
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
    .limit(LOG_LIMIT)
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

  const zeilen = logs ?? []

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pb-6">
      <LogKennzahlen
        zellen={[
          { titel: 'Läufe 24 h', wert: String(runs.length) },
          { titel: 'Fehler 24 h', wert: String(errors), schlecht: errors > 0 },
          { titel: 'Kosten ≈', wert: formatUsd(totalCost) },
          { titel: 'Ø Dauer', wert: avgDuration !== null ? `${avgDuration} s` : '—' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === 'all' ? '/assistant/logs' : `/assistant/logs?level=${filter.value}`}
            aria-current={level === filter.value ? 'true' : undefined}
            className={chipKlasse(level === filter.value)}
          >
            {filter.label}
          </Link>
        ))}
        <div className="ml-auto">
          <ClearLogsButton />
        </div>
      </div>

      {zeilen.length === 0 ? (
        <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          Keine Einträge.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {zeilen.map((log) => (
            <LogZeile
              key={log.id}
              log={{
                id: log.id,
                level: log.level,
                eventLabel: EVENT_LABELS[log.event] ?? log.event,
                message: log.message ?? '',
                meta: log.meta,
                durationMs: log.duration_ms,
                zeit: timestamp(log.created_at),
                conversationId: log.conversation_id,
              }}
            />
          ))}
        </ul>
      )}

      {zeilen.length >= LOG_LIMIT && (
        <p className="text-center text-xs text-muted-foreground">Letzte {LOG_LIMIT} Einträge</p>
      )}
    </div>
  )
}
