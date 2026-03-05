'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { saveTrading, SettingsState } from '@/app/(dashboard)/settings/actions'
import { Button } from '@/components/ui/button'
import type { SettingsMap } from '@/lib/settings'

const inputCls  = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

const ASSET_CLASSES = [
  { value: 'major', label: 'Major' },
  { value: 'alt',   label: 'Alt' },
]

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W']

export function TradingForm({ initialSettings }: { initialSettings: SettingsMap }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveTrading, null)

  useEffect(() => {
    if (!state) return
    if ('success' in state) toast.success('Trading-Einstellungen gespeichert')
    if ('error'   in state) toast.error(state.error)
  }, [state])

  return (
    <form action={action} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Trading</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Standard-Parameter für deine Trading-Setups</p>
      </div>

      <div className="space-y-4">
        {/* Default asset class */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Standard-Asset-Klasse</label>
          <select
            name="default_asset_class"
            defaultValue={(initialSettings.default_asset_class as string) ?? 'major'}
            className={selectCls}
          >
            {ASSET_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Default timeframe */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Standard-Timeframe</label>
          <input
            name="default_timeframe"
            list="timeframe-list"
            defaultValue={(initialSettings.default_timeframe as string) ?? ''}
            className={inputCls}
            placeholder="z.B. 4h"
          />
          <datalist id="timeframe-list">
            {TIMEFRAMES.map(tf => <option key={tf} value={tf} />)}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Risk per trade */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Risiko pro Trade (%)</label>
            <input
              name="risk_per_trade_pct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={(initialSettings.risk_per_trade_pct as number) ?? ''}
              className={inputCls}
              placeholder="z.B. 1.0"
            />
            <p className="text-xs text-muted-foreground">% des Portfolios</p>
          </div>

          {/* Max open trades */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max. offene Trades</label>
            <input
              name="max_open_trades"
              type="number"
              step="1"
              min="1"
              defaultValue={(initialSettings.max_open_trades as number) ?? ''}
              className={inputCls}
              placeholder="z.B. 5"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Speichern…' : 'Speichern'}
      </Button>
    </form>
  )
}
