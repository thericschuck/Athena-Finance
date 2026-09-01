'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveAnalyseDefaults, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { SettingsMap } from '@/lib/settings'

const selectCls = 'h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

const PERIODS = [
  { value: '1M',    label: '1 Monat' },
  { value: '3M',    label: '3 Monate' },
  { value: '6M',    label: '6 Monate' },
  { value: '1J',    label: '1 Jahr' },
  { value: 'Alles', label: 'Alles' },
] as const

const HEATMAP_MODES = [
  { value: 'ausgaben',  label: 'Ausgaben' },
  { value: 'einnahmen', label: 'Einnahmen' },
  { value: 'guv',       label: 'GuV' },
] as const

export interface AnalyseFormAccount {
  id:    string
  name:  string
  color: string | null
}

export function AnalyseForm({
  initialSettings,
  accounts,
}: {
  initialSettings: SettingsMap
  accounts: AnalyseFormAccount[]
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveAnalyseDefaults, null)

  const savedAccountIds = Array.isArray(initialSettings.analyse_default_accounts)
    ? (initialSettings.analyse_default_accounts as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const [selected, setSelected] = useState<Set<string>>(() => new Set(savedAccountIds))

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Analyse-Einstellungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Analyse</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Voreinstellungen für den Analyse-Tab — greifen, solange dort kein abweichender Filter aktiv ist
        </p>
      </div>

      <div className="space-y-4">
        {/* Zeitraum */}
        <div className="space-y-1.5">
          <label htmlFor="analyse_default_period" className="text-sm font-medium">Standard-Zeitraum</label>
          <select
            id="analyse_default_period"
            name="analyse_default_period"
            defaultValue={(initialSettings.analyse_default_period as string) ?? '1J'}
            className={selectCls}
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Heatmap-Ansicht */}
        <div className="space-y-1.5">
          <label htmlFor="analyse_default_heatmap_mode" className="text-sm font-medium">Standard-Heatmap-Ansicht</label>
          <select
            id="analyse_default_heatmap_mode"
            name="analyse_default_heatmap_mode"
            defaultValue={(initialSettings.analyse_default_heatmap_mode as string) ?? 'ausgaben'}
            className={selectCls}
          >
            {HEATMAP_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Konten */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Standard-Kontenauswahl</p>
          <p className="text-xs text-muted-foreground">Keine Auswahl = alle Konten</p>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Konten vorhanden.</p>
          ) : (
            <div className="max-w-xs space-y-0.5 rounded-md border border-border p-2">
              {accounts.map(a => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm transition-colors hover:bg-accent cursor-pointer select-none"
                >
                  <Checkbox
                    name="analyse_default_accounts"
                    value={a.id}
                    checked={selected.has(a.id)}
                    onCheckedChange={() => toggle(a.id)}
                  />
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: a.color ?? '#94a3b8' }}
                  />
                  <span className="truncate">{a.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
