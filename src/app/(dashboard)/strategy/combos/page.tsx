import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, XCircle, CircleDashed } from 'lucide-react'
import { AddComboDialog, EditComboDialog, DeleteComboButton } from '@/components/strategy/combo-form'

// ─── Types ────────────────────────────────────────────────────────────────────
type ComboIndicatorRow = {
  indicator_id: string
  role: string
  settings_override: string | null
  sort_order: number
}

type ComboRow = {
  id: string
  name: string
  asset: string
  asset_class: string
  status: string
  passes_guard: boolean | null
  guard_failures: string[] | null
  long_condition: string | null
  short_condition: string | null
  indicator_count: number | null
  notes: string | null
  combo_indicators: ComboIndicatorRow[]
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  draft:    'bg-muted text-muted-foreground',
  testing:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  passed:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-muted text-muted-foreground',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE[status] ?? STATUS_BADGE.archiviert}`}>
      {status}
    </span>
  )
}

function AssetClassBadge({ cls }: { cls: string }) {
  const color = cls === 'major'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${color}`}>{cls}</span>
  )
}

function GuardIcon({ passes }: { passes: boolean | null }) {
  if (passes === true)  return <CheckCircle2 className="size-4 text-green-500" />
  if (passes === false) return <XCircle      className="size-4 text-red-500"   />
  return <CircleDashed className="size-4 text-muted-foreground/50" />
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function CombosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Load indicators for selector options
  const { data: indicatorsRaw } = await supabase
    .from('indicators')
    .select('id, name, author')
    .eq('user_id', user!.id)
    .order('name')

  const indicatorOptions = indicatorsRaw ?? []

  // Load combos with their combo_indicators (sorted by sort_order)
  const { data: combosRaw } = await supabase
    .from('combos')
    .select('*, combo_indicators(indicator_id, role, settings_override, sort_order)')
    .eq('user_id', user!.id)
    .order('name')

  const combos: ComboRow[] = (combosRaw ?? []).map(c => ({
    ...c,
    combo_indicators: ((c.combo_indicators as ComboIndicatorRow[]) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order),
  }))

  // Build indicator name map for display
  const indicatorMap = new Map(indicatorOptions.map(i => [i.id, i.name]))

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Combos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{combos.length} Kombination{combos.length !== 1 ? 'en' : ''}</p>
        </div>
        <AddComboDialog indicatorOptions={indicatorOptions} />
      </div>

      {/* Empty state */}
      {combos.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">Noch keine Combos</p>
          <p className="mt-1 text-sm text-muted-foreground">Erstelle deine erste Indikator-Kombination.</p>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {combos.map(combo => (
          <div key={combo.id} className="rounded-lg border border-border bg-card flex flex-col">
            {/* Card header */}
            <div className="flex items-start gap-3 px-5 pt-4 pb-3">
              <div className="mt-0.5">
                <GuardIcon passes={combo.passes_guard} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{combo.name}</h3>
                  <StatusBadge status={combo.status} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-medium text-muted-foreground">{combo.asset}</span>
                  <AssetClassBadge cls={combo.asset_class} />
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <EditComboDialog
                  combo={{
                    ...combo,
                    combo_indicators: combo.combo_indicators.map(ci => ({
                      ...ci,
                      settings_override: ci.settings_override ?? '',
                    })),
                  }}
                  indicatorOptions={indicatorOptions}
                />
                <DeleteComboButton id={combo.id} />
              </div>
            </div>

            {/* Guard failures */}
            {combo.guard_failures && combo.guard_failures.length > 0 && (
              <div className="px-5 pb-2 flex flex-wrap gap-1">
                {combo.guard_failures.map(f => (
                  <span key={f} className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {f}
                  </span>
                ))}
              </div>
            )}

            {/* Indicators list */}
            {combo.combo_indicators.length > 0 && (
              <div className="px-5 pb-3">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Indikatoren</p>
                <div className="space-y-1">
                  {combo.combo_indicators.map((ci, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-xs rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-mono">{ci.role}</span>
                      <span className="truncate">{indicatorMap.get(ci.indicator_id) ?? ci.indicator_id}</span>
                      {ci.settings_override && (
                        <span className="text-xs text-muted-foreground truncate">{ci.settings_override}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions */}
            {(combo.long_condition || combo.short_condition) && (
              <div className="border-t border-border px-5 py-3 space-y-2">
                {combo.long_condition && (
                  <div>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-0.5">Long</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{combo.long_condition}</p>
                  </div>
                )}
                {combo.short_condition && (
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-0.5">Short</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{combo.short_condition}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {combo.notes && (
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs text-muted-foreground line-clamp-2">{combo.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
