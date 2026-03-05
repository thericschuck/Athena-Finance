import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle2, ExternalLink } from 'lucide-react'
import { AddStrategyDialog } from '@/components/strategy/strategy-form'
import { DeleteStrategyButton } from '@/components/strategy/strategy-form'

// ─── Badge helpers ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  development: 'bg-muted text-muted-foreground',
  testing:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  slapper:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  submitted:   'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  live:        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived:    'bg-muted text-muted-foreground opacity-60',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.development}`}>
      {status}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: Promise<{ ready?: string }>
}) {
  const params    = await searchParams
  const onlyReady = params.ready === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load combos for form selector
  const { data: combosRaw } = await supabase
    .from('combos')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name')
  const comboOptions = combosRaw ?? []

  // Load all strategies
  const { data: strategiesRaw } = await supabase
    .from('strategies')
    .select('*')
    .eq('user_id', user!.id)
    .order('name')
  const allStrategies = strategiesRaw ?? []

  // Load submission-ready IDs for filter and badge
  const { data: readyRaw } = await supabase
    .from('submission_ready')
    .select('id')
  const readyIdSet = new Set((readyRaw ?? []).map(r => r.id).filter(Boolean) as string[])

  const strategies = onlyReady
    ? allStrategies.filter(s => readyIdSet.has(s.id))
    : allStrategies

  const comboMap = new Map(comboOptions.map(c => [c.id, c.name]))

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategien</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {strategies.length} Strategie{strategies.length !== 1 ? 'n' : ''}
            {readyIdSet.size > 0 && ` · ${readyIdSet.size} submission-ready`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <Link
            href={onlyReady ? '/strategy/strategies' : '/strategy/strategies?ready=1'}
            className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
              onlyReady
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 className="size-3.5 inline mr-1.5 -mt-0.5" />
            Submission-ready
          </Link>
          <AddStrategyDialog comboOptions={comboOptions} />
        </div>
      </div>

      {/* Empty state */}
      {strategies.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            {onlyReady ? 'Keine submission-ready Strategien' : 'Noch keine Strategien'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {onlyReady
              ? 'Checklist und Robustness Tests müssen vollständig sein.'
              : 'Erstelle deine erste Trading-Strategie.'}
          </p>
        </div>
      )}

      {/* Strategy cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {strategies.map(s => (
          <div
            key={s.id}
            className="group rounded-lg border border-border bg-card flex flex-col hover:border-foreground/30 transition-colors"
          >
            {/* Card body — clickable link to detail */}
            <Link href={`/strategy/strategies/${s.id}`} className="flex-1 px-5 py-4 block">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{s.name}</h3>
                    <StatusBadge status={s.status} />
                    {readyIdSet.has(s.id) && (
                      <CheckCircle2 className="size-3.5 text-green-500 shrink-0" aria-label="Submission-ready" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                    <span className="font-medium text-foreground">{s.asset}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded font-mono">{s.timeframe}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{s.asset_class}</span>
                  </div>
                </div>
              </div>

              {/* Meta row */}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>Pine v{s.pine_version}</span>
                <span>v{s.version}</span>
                <span>${s.initial_capital.toLocaleString('de-DE')}</span>
                {s.process_on_close && <span className="text-amber-600 dark:text-amber-400">PoC</span>}
                {s.combo_id && comboMap.has(s.combo_id) && (
                  <span className="truncate max-w-[120px]">{comboMap.get(s.combo_id)}</span>
                )}
              </div>

              {s.notes && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.notes}</p>
              )}
            </Link>

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <div className="flex items-center gap-2">
                {s.tv_script_url && (
                  <a
                    href={s.tv_script_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3" /> TV
                  </a>
                )}
                {s.submission_date && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.submission_date).toLocaleDateString('de-DE')}
                  </span>
                )}
              </div>
              <DeleteStrategyButton id={s.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
