import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/server'
import { estimateCostUsd, formatUsd, type UsageLike } from '@/lib/assistant/cost'
import { aggregiereKosten, type KostenZeile } from '@/lib/assistant/kosten'
import { KostenAnsicht } from '@/components/assistant/kosten/KostenAnsicht'
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

const ANSICHTEN = [
  { value: 'protokoll', label: 'Protokoll', href: '/assistant/logs' },
  { value: 'kosten', label: 'Kosten', href: '/assistant/logs?ansicht=kosten' },
] as const

const SEITE = 1000 // PostgREST liefert höchstens 1000 Zeilen je Abfrage
const MAX_SEITEN = 20

type AuthClient = NonNullable<Awaited<ReturnType<typeof getAuthUser>>['supabase']>

/**
 * Kosten-Zeilen der letzten Tage: Chat-Antworten aus `ai_messages` (bleiben beim Löschen alter
 * Logs erhalten) plus automatische Läufe aus `ai_logs` (nur so weit, wie die Logs reichen).
 * Chat-Läufe stehen auch in ai_logs (kind fehlt) und werden dort bewusst NICHT gezählt.
 */
async function ladeKostenZeilen(supabase: AuthClient, userId: string, seit: string): Promise<KostenZeile[]> {
  const zeilen: KostenZeile[] = []

  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const { data } = await supabase
      .from('ai_messages')
      .select('created_at, model, usage')
      .eq('user_id', userId)
      .eq('role', 'assistant')
      .not('usage', 'is', null)
      .gte('created_at', seit)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(seite * SEITE, (seite + 1) * SEITE - 1)
    for (const r of data ?? []) {
      zeilen.push({ zeit: r.created_at, model: r.model, usage: r.usage as UsageLike | null, quelle: 'chat' })
    }
    if ((data?.length ?? 0) < SEITE) break
  }

  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const { data } = await supabase
      .from('ai_logs')
      .select('created_at, meta')
      .eq('user_id', userId)
      .eq('event', 'run.finish')
      .in('meta->>kind', ['review', 'categorize'])
      .gte('created_at', seit)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(seite * SEITE, (seite + 1) * SEITE - 1)
    for (const r of data ?? []) {
      const meta = r.meta as { model?: string; usage?: UsageLike } | null
      zeilen.push({ zeit: r.created_at, model: meta?.model ?? null, usage: meta?.usage ?? null, quelle: 'auto' })
    }
    if ((data?.length ?? 0) < SEITE) break
  }

  return zeilen
}

function AnsichtWahl({ aktiv }: { aktiv: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ANSICHTEN.map((a) => (
        <Link
          key={a.value}
          href={a.href}
          aria-current={aktiv === a.value ? 'true' : undefined}
          className={chipKlasse(aktiv === a.value)}
        >
          {a.label}
        </Link>
      ))}
    </div>
  )
}

export default async function AthenaLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; ansicht?: string; tage?: string }>
}) {
  const [{ level = 'all', ansicht, tage: tageParam }, { supabase, user }] = await Promise.all([
    searchParams,
    getAuthUser(),
  ])
  if (!user) return null

  if (ansicht === 'kosten') {
    const tage = tageParam === '90' ? 90 : 30
    // 91 Tage zurück deckt auch die Berliner Tagesgrenze des ältesten Tags ab.
    const seit = new Date(Date.now() - (tage + 1) * 86_400_000).toISOString()
    const zeilen = await ladeKostenZeilen(supabase, user.id, seit)
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto pb-6">
        <AnsichtWahl aktiv="kosten" />
        <KostenAnsicht auswertung={aggregiereKosten(zeilen, tage)} tage={tage} />
      </div>
    )
  }

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
      <AnsichtWahl aktiv="protokoll" />
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
