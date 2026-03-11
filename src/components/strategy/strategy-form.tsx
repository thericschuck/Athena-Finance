'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  createStrategy,
  updateStrategy,
  deleteStrategy,
  StrategyActionState,
} from '@/app/(dashboard)/strategy/strategies/actions'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ComboOption = { id: string; name: string }

export type StrategyData = {
  id: string
  name: string
  asset: string
  asset_class: string
  status: string
  timeframe: string
  pine_version: number
  version: number
  initial_capital: number
  process_on_close: boolean
  combo_id: string | null
  tv_script_url: string | null
  submission_date: string | null
  notes: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUSES     = ['development', 'testing', 'slapper', 'submitted', 'live', 'archived']
const ASSET_CLASSES = ['major', 'alt']

// ─── Shared field styles ──────────────────────────────────────────────────────
const inputCls    = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const selectCls   = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const textareaCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none'

// ─── Shared form body ─────────────────────────────────────────────────────────
function StrategyFormBody({
  defaults,
  comboOptions,
  state,
  pending,
  onCancel,
  submitLabel,
}: {
  defaults?: Partial<StrategyData>
  comboOptions: ComboOption[]
  state: StrategyActionState
  pending: boolean
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Name *</label>
        <input
          name="name"
          required
          defaultValue={defaults?.name ?? ''}
          className={inputCls}
          placeholder="z.B. EMA Cross Strategy v1"
        />
      </div>

      {/* Asset + Asset-Klasse */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Asset *</label>
          <input name="asset" required defaultValue={defaults?.asset ?? ''} className={inputCls} placeholder="z.B. BTCUSDT" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Asset-Klasse</label>
          <select name="asset_class" defaultValue={defaults?.asset_class ?? 'major'} className={selectCls}>
            {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Timeframe + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Timeframe *</label>
          <input name="timeframe" required defaultValue={defaults?.timeframe ?? ''} className={inputCls} placeholder="z.B. 4H, 1D" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Status</label>
          <select name="status" defaultValue={defaults?.status ?? 'development'} className={selectCls}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Combo */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Combo</label>
        <select name="combo_id" defaultValue={defaults?.combo_id ?? ''} className={selectCls}>
          <option value="">— Kein Combo —</option>
          {comboOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Pine version + Version + Startkapital */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Pine v</label>
          <input
            name="pine_version"
            type="number"
            min="1" max="6"
            defaultValue={defaults?.pine_version ?? 5}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Version</label>
          <input
            name="version"
            type="number"
            min="1"
            defaultValue={defaults?.version ?? 1}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Startkapital</label>
          <input
            name="initial_capital"
            type="number"
            min="0"
            step="1000"
            defaultValue={defaults?.initial_capital ?? 10000}
            className={inputCls}
          />
        </div>
      </div>

      {/* Process on Close */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="process_on_close"
          name="process_on_close"
          value="true"
          defaultChecked={defaults?.process_on_close ?? false}
          className="h-4 w-4 rounded border-input accent-foreground"
        />
        <label htmlFor="process_on_close" className="text-sm">Process on Close</label>
      </div>

      {/* TV Script URL */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">TradingView Script URL</label>
        <input
          name="tv_script_url"
          type="url"
          defaultValue={defaults?.tv_script_url ?? ''}
          className={inputCls}
          placeholder="https://www.tradingview.com/..."
        />
      </div>

      {/* Submission Date */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Submission-Datum</label>
        <input
          name="submission_date"
          type="date"
          defaultValue={defaults?.submission_date?.slice(0, 10) ?? ''}
          className={inputCls}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Notizen</label>
        <textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ''} className={textareaCls} />
      </div>

      {state && 'error' in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>Abbrechen</Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Speichern…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}

// ─── Add Dialog ───────────────────────────────────────────────────────────────
export function AddStrategyDialog({
  comboOptions,
  defaultAssetClass,
  defaultTimeframe,
}: {
  comboOptions: ComboOption[]
  defaultAssetClass?: string
  defaultTimeframe?: string
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(createStrategy, null)

  useEffect(() => {
    if (state && 'success' in state) setOpen(false)
  }, [state])

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-2" /> Neue Strategie
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Neue Strategie</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </div>
        <form action={action}>
          <StrategyFormBody
            defaults={{ asset_class: defaultAssetClass ?? 'major', timeframe: defaultTimeframe ?? '' }}
            comboOptions={comboOptions}
            state={state}
            pending={pending}
            onCancel={() => setOpen(false)}
            submitLabel="Erstellen"
          />
        </form>
      </div>
    </div>
  )
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
export function EditStrategyDialog({
  strategy,
  comboOptions,
}: {
  strategy: StrategyData
  comboOptions: ComboOption[]
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateStrategy, null)

  useEffect(() => {
    if (state && 'success' in state) setOpen(false)
  }, [state])

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Bearbeiten
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Strategie bearbeiten</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </div>
        <form action={action}>
          <StrategyFormBody
            defaults={strategy}
            comboOptions={comboOptions}
            state={state}
            pending={pending}
            onCancel={() => setOpen(false)}
            submitLabel="Speichern"
          />
        </form>
      </div>
    </div>
  )
}

// ─── Delete Button ────────────────────────────────────────────────────────────
export function DeleteStrategyButton({ id, redirectAfter }: { id: string; redirectAfter?: boolean }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleDelete() {
    setPending(true)
    await deleteStrategy(id)
    setPending(false)
    if (redirectAfter) router.push('/strategy/strategies')
  }

  if (!confirm) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirm(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">Löschen?</span>
      <Button variant="destructive" size="sm" disabled={pending} onClick={handleDelete}>Ja</Button>
      <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>Nein</Button>
    </div>
  )
}
