'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { saveFinance, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import type { SettingsMap } from '@/lib/settings'

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

export function FinanceForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveFinance, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Finanz-Einstellungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Finanzen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Budget- und Steuerparameter</p>
      </div>

      <div className="space-y-4">
        {/* Monthly budget */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Monatliches Ausgaben-Budget (€)</label>
          <input
            name="monthly_budget"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(initialSettings.monthly_budget as number) ?? ''}
            className={inputCls}
            placeholder="z.B. 2000"
          />
          <p className="text-xs text-muted-foreground">
            Wird im Dashboard als Referenzwert für deine monatlichen Ausgaben angezeigt
          </p>
        </div>

        {/* Tax rate */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Abgeltungsteuer inkl. Soli (%)</label>
          <input
            name="default_tax_rate"
            type="number"
            step="0.1"
            min="0"
            max="100"
            defaultValue={(initialSettings.default_tax_rate as number) ?? ''}
            className={inputCls}
            placeholder="26.375"
          />
          <p className="text-xs text-muted-foreground">
            Standardmäßig 26,375 % (25 % KESt + 5,5 % Soli) – wird für Nettorendite-Berechnungen im Depot verwendet
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
