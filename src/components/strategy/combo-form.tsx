'use client'

import { useActionState, useState, useEffect, useRef } from 'react'
import { createCombo, updateCombo, deleteCombo, ComboActionState } from '@/app/(dashboard)/strategy/combos/actions'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type IndicatorOption = { id: string; name: string; author: string }

type IndicatorRow = {
  _key: number          // stable React key, not sent to server
  indicator_id: string
  role: string
  settings_override: string
  sort_order: number
}

type ComboData = {
  id: string
  name: string
  asset: string
  asset_class: string
  status: string
  long_condition: string | null
  short_condition: string | null
  notes: string | null
  combo_indicators: {
    indicator_id: string
    role: string
    settings_override: string
    sort_order: number
  }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ASSET_CLASSES = ['major', 'alt']
const STATUSES      = ['draft', 'testing', 'passed', 'failed', 'archived']
// Will update ROLES once combo_indicators_role_check constraint is known
const ROLES         = ['primary', 'filter', 'confirmation']

// ─── Shared field styles ──────────────────────────────────────────────────────
const inputCls    = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const selectCls   = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const textareaCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none'

// ─── Stable-key counter ───────────────────────────────────────────────────────
let _keySeq = 0
const nextKey = () => ++_keySeq

function toRows(ci: ComboData['combo_indicators']): IndicatorRow[] {
  return ci.map(r => ({ ...r, _key: nextKey() }))
}

// ─── Dynamic indicator list ───────────────────────────────────────────────────
function IndicatorList({
  rows,
  options,
  onChange,
}: {
  rows: IndicatorRow[]
  options: IndicatorOption[]
  onChange: (rows: IndicatorRow[]) => void
}) {
  function addRow() {
    const firstId = options[0]?.id ?? ''
    onChange([
      ...rows,
      { _key: nextKey(), indicator_id: firstId, role: ROLES[0], settings_override: '', sort_order: rows.length },
    ])
  }

  function removeRow(key: number) {
    onChange(
      rows.filter(r => r._key !== key).map((r, idx) => ({ ...r, sort_order: idx }))
    )
  }

  function setField(key: number, field: keyof Omit<IndicatorRow, '_key'>, value: string | number) {
    onChange(rows.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  // Serialise for hidden input (strip _key)
  const json = JSON.stringify(
    rows.map(({ _key: _k, ...rest }) => rest)
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Indikatoren</span>
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={options.length === 0}>
          <Plus className="size-3.5 mr-1" /> Hinzufügen
        </Button>
      </div>

      <input type="hidden" name="indicators_json" value={json} />

      {options.length === 0 && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Erst Indikatoren in der Bibliothek anlegen.</p>
      )}

      {rows.map(row => (
        <div key={row._key} className="flex gap-2 items-center rounded-md border border-border bg-muted/20 p-2">
          {/* Indicator */}
          <select
            className={`${selectCls} flex-1 min-w-0`}
            value={row.indicator_id}
            onChange={e => setField(row._key, 'indicator_id', e.target.value)}
          >
            {options.map(o => (
              <option key={o.id} value={o.id}>{o.name} · {o.author}</option>
            ))}
          </select>

          {/* Role */}
          <select
            className={`${selectCls} w-36 shrink-0`}
            value={row.role}
            onChange={e => setField(row._key, 'role', e.target.value)}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* Settings override */}
          <input
            type="text"
            placeholder="Settings"
            className={`${inputCls} w-28 shrink-0`}
            value={row.settings_override}
            onChange={e => setField(row._key, 'settings_override', e.target.value)}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(row._key)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}

// ─── Shared form body ─────────────────────────────────────────────────────────
function ComboFormBody({
  defaults,
  rows,
  onRowsChange,
  indicatorOptions,
  state,
  pending,
  onCancel,
  submitLabel,
}: {
  defaults?: Partial<ComboData>
  rows: IndicatorRow[]
  onRowsChange: (r: IndicatorRow[]) => void
  indicatorOptions: IndicatorOption[]
  state: ComboActionState
  pending: boolean
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div className="p-6 space-y-4">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}

      {/* Name + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Name *</label>
          <input name="name" required defaultValue={defaults?.name ?? ''} className={inputCls} placeholder="z.B. EMA Cross + RSI" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Status</label>
          <select name="status" defaultValue={defaults?.status ?? 'draft'} className={selectCls}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Asset + Asset-Klasse */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Asset *</label>
          <input name="asset" required defaultValue={defaults?.asset ?? ''} className={inputCls} placeholder="z.B. BTCUSDT" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Asset-Klasse *</label>
          <select name="asset_class" required defaultValue={defaults?.asset_class ?? 'major'} className={selectCls}>
            {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Indicators */}
      <IndicatorList rows={rows} options={indicatorOptions} onChange={onRowsChange} />

      {/* Long / Short conditions */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Long-Bedingung</label>
          <textarea name="long_condition" rows={3} defaultValue={defaults?.long_condition ?? ''} className={textareaCls} placeholder="z.B. EMA 20 > EMA 50 und RSI > 50" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Short-Bedingung</label>
          <textarea name="short_condition" rows={3} defaultValue={defaults?.short_condition ?? ''} className={textareaCls} placeholder="z.B. EMA 20 < EMA 50 und RSI < 50" />
        </div>
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
export function AddComboDialog({ indicatorOptions }: { indicatorOptions: IndicatorOption[] }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<IndicatorRow[]>([])
  const [state, action, pending] = useActionState(createCombo, null)

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      setRows([])
    }
  }, [state])

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-2" /> Neue Combo
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Neue Combo</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </div>
        <form action={action}>
          <ComboFormBody
            rows={rows}
            onRowsChange={setRows}
            indicatorOptions={indicatorOptions}
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
export function EditComboDialog({
  combo,
  indicatorOptions,
}: {
  combo: ComboData
  indicatorOptions: IndicatorOption[]
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<IndicatorRow[]>(() => toRows(combo.combo_indicators))
  const [state, action, pending] = useActionState(updateCombo, null)

  useEffect(() => {
    if (state && 'success' in state) setOpen(false)
  }, [state])

  // Reset rows when dialog re-opens
  useEffect(() => {
    if (open) setRows(toRows(combo.combo_indicators))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Bearbeiten
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Combo bearbeiten</h2>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </div>
        <form action={action}>
          <ComboFormBody
            defaults={combo}
            rows={rows}
            onRowsChange={setRows}
            indicatorOptions={indicatorOptions}
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
export function DeleteComboButton({ id }: { id: string }) {
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleDelete() {
    setPending(true)
    await deleteCombo(id)
    setPending(false)
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
