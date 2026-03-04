'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveFinance, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SettingsMap } from '@/lib/settings'

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  )
}

export function FinanceForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [autoTransfer, setAutoTransfer] = useState(!!(initialSettings.savings_auto_transfer))
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveFinance, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Finanz-Einstellungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="savings_auto_transfer" value={String(autoTransfer)} />

      <div>
        <h2 className="text-base font-semibold">Finanzen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Budget, Steuern und Spareinstellungen</p>
      </div>

      <div className="space-y-4">
        {/* Monthly budget */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Monatliches Budget (€)</label>
          <input
            name="monthly_budget"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(initialSettings.monthly_budget as number) ?? ''}
            className={inputCls}
            placeholder="z.B. 3000"
          />
          <p className="text-xs text-muted-foreground">Wird als Referenzwert für Budget-Übersichten verwendet</p>
        </div>

        {/* Tax rate */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Steuersatz (%)</label>
          <input
            name="default_tax_rate"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={(initialSettings.default_tax_rate as number) ?? ''}
            className={inputCls}
            placeholder="z.B. 26.375"
          />
          <p className="text-xs text-muted-foreground">Kapitalertragsteuer inkl. Solidaritätszuschlag</p>
        </div>

        {/* Auto transfer */}
        <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
          <div>
            <p className="text-sm font-medium">Automatische Sparübertragung</p>
            <p className="text-xs text-muted-foreground">Monatliche Sparziele automatisch buchen</p>
          </div>
          <Toggle checked={autoTransfer} onChange={setAutoTransfer} />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
