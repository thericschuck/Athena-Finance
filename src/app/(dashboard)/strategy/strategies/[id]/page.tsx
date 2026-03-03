import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, XCircle, Minus, ExternalLink } from 'lucide-react'
import { ChecklistPanel, ChecklistState } from '@/components/strategy/checklist-panel'
import { EditStrategyDialog, DeleteStrategyButton } from '@/components/strategy/strategy-form'

// ─── Status helpers ───────────────────────────────────────────────────────────
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
    <span className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.development}`}>
      {status}
    </span>
  )
}

// ─── Robustness test result row ───────────────────────────────────────────────
function TestRow({ label, result }: { label: string; result: string | null }) {
  const pass = result?.toLowerCase() === 'pass'
  const fail = result?.toLowerCase() === 'fail'

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {pass && <CheckCircle2 className="size-4 text-green-500" />}
        {fail && <XCircle      className="size-4 text-red-500"   />}
        {!pass && !fail && <Minus className="size-4 text-muted-foreground/40" />}
        <span className={`text-xs font-medium ${pass ? 'text-green-600 dark:text-green-400' : fail ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {result ?? '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Parallel data fetching
  const [
    { data: strategy },
    { data: checklist },
    { data: robustness },
    { data: combosRaw },
  ] = await Promise.all([
    supabase.from('strategies').select('*').eq('id', id).eq('user_id', user!.id).single(),
    supabase.from('submission_checklist').select('*').eq('strategy_id', id).maybeSingle(),
    supabase.from('robustness_status').select('*').eq('strategy_id', id).maybeSingle(),
    supabase.from('combos').select('id, name').eq('user_id', user!.id).order('name'),
  ])

  if (!strategy) notFound()

  const comboOptions = combosRaw ?? []
  const comboName = comboOptions.find(c => c.id === strategy.combo_id)?.name ?? null

  // Default checklist (all false if row doesn't exist yet)
  const checklistState: ChecklistState = {
    equity_screenshot: checklist?.equity_screenshot ?? false,
    indicator_desc:    checklist?.indicator_desc    ?? false,
    inputs_screenshot: checklist?.inputs_screenshot ?? false,
    repaint_tested:    checklist?.repaint_tested    ?? false,
    robustness_sheet:  checklist?.robustness_sheet  ?? false,
    stats_screenshot:  checklist?.stats_screenshot  ?? false,
    tv_script_url:     checklist?.tv_script_url     ?? false,
  }

  const checklistDone = Object.values(checklistState).filter(Boolean).length
  const robustnessPasses = robustness?.all_tests_pass

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Back link */}
      <Link
        href="/strategy/strategies"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zu Strategien
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{strategy.name}</h1>
            <StatusBadge status={strategy.status} />
            {robustnessPasses === true && (
              <CheckCircle2 className="size-5 text-green-500" title="Robustness: all pass" />
            )}
            {robustnessPasses === false && (
              <XCircle className="size-5 text-red-500" title="Robustness: failures" />
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground">{strategy.asset}</span>
            <span className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{strategy.timeframe}</span>
            <span className="px-1.5 py-0.5 bg-muted rounded text-xs">{strategy.asset_class}</span>
            <span>Pine v{strategy.pine_version}</span>
            <span>v{strategy.version}</span>
            <span>${strategy.initial_capital.toLocaleString('de-DE')}</span>
            {strategy.process_on_close && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Process on Close
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {comboName && (
              <span>Combo: <span className="text-foreground">{comboName}</span></span>
            )}
            {strategy.submission_date && (
              <span>Submission: <span className="text-foreground">{new Date(strategy.submission_date).toLocaleDateString('de-DE')}</span></span>
            )}
            {strategy.tv_script_url && (
              <a
                href={strategy.tv_script_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3" /> TradingView Script
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <EditStrategyDialog strategy={strategy} comboOptions={comboOptions} />
          <DeleteStrategyButton id={strategy.id} redirectAfter />
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Submission Checklist */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Submission Checklist</h2>
            <span className={`text-xs font-medium tabular-nums ${checklistDone === 7 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {checklistDone}/7
            </span>
          </div>
          <ChecklistPanel strategyId={strategy.id} initial={checklistState} />
        </div>

        {/* Robustness Status */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Robustness Status</h2>
            {robustnessPasses === true  && <span className="text-xs font-medium text-green-600 dark:text-green-400">All Pass</span>}
            {robustnessPasses === false && <span className="text-xs font-medium text-red-600 dark:text-red-400">Failures</span>}
            {robustnessPasses == null   && <span className="text-xs text-muted-foreground">Kein Ergebnis</span>}
          </div>

          {robustness ? (
            <div>
              <TestRow label="Parameter-Test"  result={robustness.parameter_test} />
              <TestRow label="Exchange-Test"   result={robustness.exchange_test}  />
              <TestRow label="Timeframe-Test"  result={robustness.timeframe_test} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Noch keine Robustness-Daten vorhanden.
            </p>
          )}
        </div>
      </div>

      {/* Notes */}
      {strategy.notes && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-2">Notizen</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{strategy.notes}</p>
        </div>
      )}
    </div>
  )
}
