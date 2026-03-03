'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toggleChecklistItem } from '@/app/(dashboard)/strategy/strategies/actions'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ChecklistState = {
  equity_screenshot: boolean
  indicator_desc:    boolean
  inputs_screenshot: boolean
  repaint_tested:    boolean
  robustness_sheet:  boolean
  stats_screenshot:  boolean
  tv_script_url:     boolean
}

const ITEMS: { field: keyof ChecklistState; label: string }[] = [
  { field: 'equity_screenshot', label: 'Equity Screenshot' },
  { field: 'indicator_desc',    label: 'Indikator-Beschreibung' },
  { field: 'inputs_screenshot', label: 'Inputs Screenshot' },
  { field: 'repaint_tested',    label: 'Repaint getestet' },
  { field: 'robustness_sheet',  label: 'Robustness Sheet' },
  { field: 'stats_screenshot',  label: 'Stats Screenshot' },
  { field: 'tv_script_url',     label: 'TV Script URL hinterlegt' },
]

// ─── Component ────────────────────────────────────────────────────────────────
export function ChecklistPanel({
  strategyId,
  initial,
}: {
  strategyId: string
  initial: ChecklistState
}) {
  const [state, setState] = useState<ChecklistState>(initial)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(field: keyof ChecklistState) {
    const next = !state[field]
    setState(prev => ({ ...prev, [field]: next }))
    setPending(field)
    await toggleChecklistItem(strategyId, field, next)
    setPending(null)
  }

  const doneCount = ITEMS.filter(i => state[i.field]).length

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-2">
        {doneCount}/{ITEMS.length} erledigt
      </p>
      {ITEMS.map(({ field, label }) => {
        const checked   = state[field]
        const isLoading = pending === field

        return (
          <button
            key={field}
            onClick={() => toggle(field)}
            disabled={isLoading}
            className="flex items-center gap-3 w-full rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors text-left disabled:opacity-60"
          >
            <span className={`
              flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors
              ${checked
                ? 'border-green-500 bg-green-500 dark:border-green-400 dark:bg-green-400'
                : 'border-border bg-background'}
            `}>
              {checked && <Check className="size-3 text-white dark:text-black" strokeWidth={3} />}
            </span>
            <span className={`text-sm ${checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
