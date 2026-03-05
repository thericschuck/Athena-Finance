'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { saveNotifications, SettingsState } from '@/app/(dashboard)/settings/actions'
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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function NotificationsForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [weeklyReport,     setWeeklyReport]     = useState(!!(initialSettings.email_weekly_report))
  const [priceAlerts,      setPriceAlerts]      = useState(!!(initialSettings.email_price_alerts))
  const [strategySignals,  setStrategySignals]  = useState(!!(initialSettings.email_strategy_signals))

  const [state, action, pending] = useActionState<SettingsState, FormData>(saveNotifications, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Benachrichtigungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="email_weekly_report"    value={String(weeklyReport)} />
      <input type="hidden" name="email_price_alerts"     value={String(priceAlerts)} />
      <input type="hidden" name="email_strategy_signals" value={String(strategySignals)} />

      <div>
        <h2 className="text-base font-semibold">Benachrichtigungen</h2>
        <p className="text-sm text-muted-foreground mt-0.5">E-Mail- und Alarm-Einstellungen</p>
      </div>

      <div className="space-y-3">
        <ToggleRow
          label="Wöchentlicher Report"
          description="Zusammenfassung deiner Finanzen und Portfolio-Performance"
          checked={weeklyReport}
          onChange={setWeeklyReport}
        />
        <ToggleRow
          label="Preis-Alerts"
          description="Benachrichtigung bei starken Kursveränderungen"
          checked={priceAlerts}
          onChange={setPriceAlerts}
        />
        <ToggleRow
          label="Strategie-Signale"
          description="Benachrichtigung bei neuen Trading-Signalen"
          checked={strategySignals}
          onChange={setStrategySignals}
        />
      </div>

      {/* Alert threshold */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Preis-Alert-Schwelle (%)</label>
        <input
          name="price_alert_threshold_pct"
          type="number"
          step="0.1"
          min="0"
          defaultValue={(initialSettings.price_alert_threshold_pct as number) ?? ''}
          className={inputCls}
          placeholder="z.B. 5.0"
        />
        <p className="text-xs text-muted-foreground">Alert auslösen bei Kursänderung ≥ diesem Wert</p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
