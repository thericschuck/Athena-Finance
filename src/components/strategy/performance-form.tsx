'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarChart2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createPerformance, updatePerformance, deletePerformance,
  type PerfActionState,
} from '@/app/(dashboard)/strategy/indicators/actions'
import { Database } from '@/types/database'

type Perf      = Database['public']['Tables']['indicator_performance']['Row']
type Indicator = Database['public']['Tables']['indicators']['Row']

const ASSET_CLASSES = ['major', 'alt']
const TIMEFRAMES    = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1D', '3D', '1W', '1M']

// ─── Number field helper ──────────────────────────────────────────────────────
function NumField({ id, name, label, defaultValue, placeholder, step = '0.01' }: {
  id: string; name: string; label: string
  defaultValue?: number | null; placeholder?: string; step?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} name={name} type="number" step={step}
        defaultValue={defaultValue ?? ''}
        placeholder={placeholder ?? '0'}
      />
    </div>
  )
}

// ─── Shared performance form fields ──────────────────────────────────────────
function PerfFields({
  perf,
  indicatorId,
  defaultAssetClass,
  defaultTimeframe,
}: {
  perf?: Perf
  indicatorId: string
  defaultAssetClass?: string
  defaultTimeframe?: string
}) {
  return (
    <>
      {perf && <input type="hidden" name="id" value={perf.id} />}
      <input type="hidden" name="indicator_id" value={indicatorId} />

      {/* Asset + Asset Class */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-asset">Asset *</Label>
          <Input id="p-asset" name="asset" defaultValue={perf?.asset} placeholder="BTCUSDT" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-class">Asset-Klasse *</Label>
          <Input
            id="p-class" name="asset_class" list="asset-class-list"
            defaultValue={perf?.asset_class ?? defaultAssetClass} placeholder="Crypto" required
          />
          <datalist id="asset-class-list">
            {ASSET_CLASSES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      {/* Timeframe + Settings */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-tf">Timeframe *</Label>
          <Input
            id="p-tf" name="timeframe" list="tf-list"
            defaultValue={perf?.timeframe ?? defaultTimeframe} placeholder="4h" required
          />
          <datalist id="tf-list">
            {TIMEFRAMES.map(t => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-settings">Settings</Label>
          <Input id="p-settings" name="settings" defaultValue={perf?.settings ?? ''} placeholder="14, 2.0…" />
        </div>
      </div>

      {/* Cobra Green + Cobra Red */}
      <div className="grid grid-cols-2 gap-3">
        <NumField id="p-cg" name="cobra_green" label="Cobra Green (0–7)" defaultValue={perf?.cobra_green} placeholder="0–7" step="1" />
        <NumField id="p-cr" name="cobra_red"   label="Cobra Red (0–7)"   defaultValue={perf?.cobra_red}   placeholder="0–7" step="1" />
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Performance-Metriken</p>
        <div className="grid grid-cols-2 gap-3">
          <NumField id="p-np"  name="net_profit_pct" label="Net Profit %"     defaultValue={perf?.net_profit_pct} />
          <NumField id="p-pf"  name="profit_factor"  label="Profit Factor"    defaultValue={perf?.profit_factor}  />
          <NumField id="p-wr"  name="win_rate"        label="Win Rate %"       defaultValue={perf?.win_rate}       />
          <NumField id="p-tr"  name="trades"          label="Trades"           defaultValue={perf?.trades}         step="1" />
          <NumField id="p-sh"  name="sharpe"          label="Sharpe Ratio"     defaultValue={perf?.sharpe}         />
          <NumField id="p-so"  name="sortino"         label="Sortino Ratio"    defaultValue={perf?.sortino}        />
          <NumField id="p-om"  name="omega_ratio"     label="Omega Ratio"      defaultValue={perf?.omega_ratio}    />
          <NumField id="p-dd"  name="equity_max_dd"   label="Max Drawdown %"   defaultValue={perf?.equity_max_dd}  />
          <NumField id="p-idd" name="intra_trade_dd"  label="Intra-Trade DD %"  defaultValue={perf?.intra_trade_dd} />
        </div>
      </div>

      {/* Test period */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-ts">Test Start</Label>
          <Input id="p-ts" name="test_start" type="date" defaultValue={perf?.test_start ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-te">Test End</Label>
          <Input id="p-te" name="test_end" type="date" defaultValue={perf?.test_end ?? ''} />
        </div>
      </div>
    </>
  )
}

// ─── Shared dialog wrapper ────────────────────────────────────────────────────
function PerfDialog({
  mode, perf, indicatorId, trigger, defaultAssetClass, defaultTimeframe,
}: {
  mode:               'create' | 'edit'
  perf?:              Perf
  indicatorId:        string
  trigger:            React.ReactNode
  defaultAssetClass?: string
  defaultTimeframe?:  string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const action = mode === 'create' ? createPerformance : updatePerformance
  const [state, formAction, isPending] = useActionState<PerfActionState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) { setOpen(false); router.refresh() }
  }, [state, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Backtest hinzufügen' : 'Backtest bearbeiten'}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4 pt-2">
          <PerfFields
            perf={perf}
            indicatorId={indicatorId}
            defaultAssetClass={mode === 'create' ? defaultAssetClass : undefined}
            defaultTimeframe={mode === 'create' ? defaultTimeframe : undefined}
          />
          {state && 'error' in state && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Wird gespeichert…' : mode === 'create' ? 'Hinzufügen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Backtests overview dialog ────────────────────────────────────────────────
export function BacktestsDialog({
  ind, perfs, defaultAssetClass, defaultTimeframe,
}: {
  ind: Indicator
  perfs: Perf[]
  defaultAssetClass?: string
  defaultTimeframe?:  string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, startDelete] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleDelete(id: string) {
    startDelete(async () => {
      const result = await deletePerformance(id)
      if (result.error) setDeleteError(result.error)
      else router.refresh()
    })
  }

  const indicatorPerfs = perfs.filter(p => p.indicator_id === ind.id)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground gap-1">
          <BarChart2 className="size-3" />
          {indicatorPerfs.length}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>Backtests — {ind.name}</span>
            <PerfDialog
              mode="create" indicatorId={ind.id}
              defaultAssetClass={defaultAssetClass}
              defaultTimeframe={defaultTimeframe}
              trigger={<Button size="sm"><Plus className="size-4" />Hinzufügen</Button>}
            />
          </DialogTitle>
        </DialogHeader>

        {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

        {indicatorPerfs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Backtest-Einträge. Füge den ersten hinzu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 pr-3 font-medium">Asset</th>
                  <th className="pb-2 pr-3 font-medium">TF</th>
                  <th className="pb-2 pr-3 font-medium text-right">Cobra ▲</th>
                  <th className="pb-2 pr-3 font-medium text-right">Cobra ▼</th>
                  <th className="pb-2 pr-3 font-medium text-right">PF</th>
                  <th className="pb-2 pr-3 font-medium text-right">WR %</th>
                  <th className="pb-2 pr-3 font-medium text-right">Net %</th>
                  <th className="pb-2 pr-3 font-medium text-right">Trades</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {indicatorPerfs.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 group">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{p.asset}</p>
                      <p className="text-xs text-muted-foreground">{p.asset_class}</p>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{p.timeframe}</td>
                    <td className="py-2 pr-3 text-right">
                      {p.cobra_green != null
                        ? <span className="font-medium text-green-600 dark:text-green-400">{p.cobra_green}</span>
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {p.cobra_red != null
                        ? <span className="font-medium text-red-500 dark:text-red-400">{p.cobra_red}</span>
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {p.profit_factor?.toFixed(2) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {p.win_rate != null ? `${p.win_rate.toFixed(1)} %` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {p.net_profit_pct != null ? `${p.net_profit_pct.toFixed(1)} %` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">
                      {p.trades ?? '—'}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <PerfDialog
                          mode="edit" perf={p} indicatorId={ind.id}
                          trigger={<Button variant="ghost" size="icon-xs"><Pencil className="size-3" /></Button>}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="size-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Backtest für <strong>{p.asset} {p.timeframe}</strong> wird gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(p.id)} disabled={deleting}
                                className="bg-destructive text-white hover:bg-destructive/90"
                              >
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
