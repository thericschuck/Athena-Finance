'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveStrategySignals, savePortfolioAllocations } from '@/app/(dashboard)/crypto/actions'
import { getPortfolioWeight } from '@/lib/crypto/rebalancing'
import {
  type StrategySignals,
  type PortfolioAllocations,
  type SubPortfolioAsset,
  type StrategySignal,
} from '@/lib/crypto/rebalancing-defaults'
import { CoinCombobox } from '@/components/crypto/coin-combobox'

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  initialSignals:     StrategySignals
  initialAllocations: PortfolioAllocations
  onChange: (signals: StrategySignals, allocations: PortfolioAllocations) => void
}

// ─── Inline badge ─────────────────────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  )
}

const SIGNAL_BADGE: Record<string, string> = {
  long_btc: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  long_eth: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  cash:     'bg-muted text-muted-foreground',
  long:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const SIGNAL_LABEL: Record<string, string> = {
  long_btc: 'Long BTC', long_eth: 'Long ETH', cash: 'Cash', long: 'Aktiv',
}

// ─── Editable asset-weight table ──────────────────────────────────────────────
function AssetWeightTable({
  assets,
  onChange,
}: {
  assets: SubPortfolioAsset[]
  onChange: (next: SubPortfolioAsset[]) => void
}) {
  // Store weights as % (0–100) locally for easy editing
  const [rows, setRows]           = useState(() => assets.map(a => ({ ...a, pct: +(a.weight * 100).toFixed(2) })))
  const [newSymbol, setNewSymbol]         = useState('')
  const [newCoingeckoId, setNewCoingeckoId] = useState('')
  const [newPct, setNewPct]               = useState('')
  const [coinKey, setCoinKey]             = useState(0) // reset combobox after add

  const sum     = rows.reduce((s, r) => s + (r.pct || 0), 0)
  const isValid = Math.abs(sum - 100) < 0.1

  function update(next: typeof rows) {
    setRows(next)
    if (Math.abs(next.reduce((s, r) => s + (r.pct || 0), 0) - 100) < 0.1) {
      onChange(next.map(r => ({ symbol: r.symbol, coingecko_id: r.coingecko_id, weight: r.pct / 100 })))
    }
  }

  function updatePct(i: number, val: string) {
    const next = rows.map((r, idx) => idx === i ? { ...r, pct: parseFloat(val) || 0 } : r)
    update(next)
  }

  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i)
    update(next)
  }

  function addRow() {
    const sym   = newSymbol.trim().toUpperCase()
    const cgId  = newCoingeckoId.trim().toLowerCase()
    const pct   = parseFloat(newPct) || 0
    if (!sym || !cgId || pct <= 0) return
    const next = [...rows, { symbol: sym, coingecko_id: cgId, pct, weight: pct / 100 }]
    setNewSymbol(''); setNewCoingeckoId(''); setNewPct('')
    setCoinKey(k => k + 1)
    update(next)
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Symbol</th>
              <th className="text-right px-3 py-2 font-medium">Gewicht %</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.coingecko_id}-${i}`} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{row.symbol}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number" min="0" max="100" step="0.1"
                    value={row.pct}
                    onChange={e => updatePct(i, e.target.value)}
                    className="h-7 w-24 text-right ml-auto"
                  />
                </td>
                <td className="px-2 py-2">
                  <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sum indicator */}
      <div className={`text-xs flex items-center gap-1 ${isValid ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
        <span>Summe: {sum.toFixed(1).replace('.', ',')} %</span>
        <span>{isValid ? '✓' : '✗ (muss 100 % ergeben)'}</span>
      </div>

      {/* Add row */}
      <div className="flex gap-2 items-end pt-1">
        <div className="space-y-1 flex-1">
          <Label className="text-xs">Coin</Label>
          <CoinCombobox
            key={coinKey}
            defaultValue={newCoingeckoId || null}
            onChange={coin => {
              setNewSymbol(coin.symbol.toUpperCase())
              setNewCoingeckoId(coin.coingecko_id)
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gewicht %</Label>
          <Input
            type="number" placeholder="25"
            value={newPct}
            onChange={e => setNewPct(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRow()}
            className="h-9 w-20"
          />
        </div>
        <Button
          variant="outline" size="sm"
          onClick={addRow}
          disabled={!newSymbol || !newCoingeckoId || !(parseFloat(newPct) > 0)}
        >
          <Plus className="size-3.5" />
          Hinzufügen
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StrategySignals({ initialSignals, initialAllocations, onChange }: Props) {
  const [signals,     setSignals]     = useState<StrategySignals>(initialSignals)
  const [allocations, setAllocations] = useState<PortfolioAllocations>(initialAllocations)
  const [isSaving,    setIsSaving]    = useState(false)
  const [saveMsg,     setSaveMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const weights = getPortfolioWeight(signals)

  function updateSignals(next: StrategySignals) {
    setSignals(next)
    onChange(next, allocations)
  }

  function updateAllocations(next: PortfolioAllocations) {
    setAllocations(next)
    onChange(signals, next)
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveMsg(null)
    try {
      await saveStrategySignals(signals)
      await savePortfolioAllocations(allocations)
      setSaveMsg({ text: 'Gespeichert', ok: true })
      onChange(signals, allocations)
    } catch (e) {
      setSaveMsg({ text: e instanceof Error ? e.message : 'Fehler beim Speichern', ok: false })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ── Card 1: Core ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Core Strategie</h3>
            <Badge color={SIGNAL_BADGE[signals.core.signal]}>
              {SIGNAL_LABEL[signals.core.signal]}
            </Badge>
          </div>

          {/* Signal radio */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Signal</Label>
            {(['long_btc', 'long_eth', 'cash'] as StrategySignal[]).map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="core-signal"
                  value={s}
                  checked={signals.core.signal === s}
                  onChange={() => updateSignals({ ...signals, core: { ...signals.core, signal: s } })}
                  className="accent-foreground"
                />
                <span className="text-sm">{SIGNAL_LABEL[s]}</span>
              </label>
            ))}
          </div>

          {/* Weight */}
          <div className="space-y-1.5">
            <Label htmlFor="core-weight" className="text-xs text-muted-foreground">
              Gewicht am Gesamtportfolio
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="core-weight"
                type="number" min="0" max="100" step="1"
                value={Math.round(signals.core.weight * 100)}
                onChange={e => updateSignals({
                  ...signals, core: { ...signals.core, weight: (parseFloat(e.target.value) || 0) / 100 }
                })}
                className="h-8 w-20 text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Anteil wenn aktiv</p>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Wenn Cash: Core-Anteil wird auf Adams Portfolio umgeschichtet
          </div>
        </div>

        {/* ── Card 2: Adam ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Adams Portfolio</h3>
          </div>

          {/* Readonly weight */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gewicht (berechnet)</Label>
            <p className="text-lg font-semibold tabular-nums">
              {(weights.adam * 100).toFixed(1).replace('.', ',')} %
            </p>
            <p className="text-xs text-muted-foreground">
              100 % − {Math.round(signals.core.weight * 100)} % − {Math.round(signals.high_beta.weight * 100)} % = {(weights.adam * 100).toFixed(1).replace('.', ',')} %
            </p>
          </div>

          {/* Editable asset table */}
          <AssetWeightTable
            assets={allocations.adam.assets}
            onChange={next => updateAllocations({ ...allocations, adam: { assets: next } })}
          />
        </div>

        {/* ── Card 3: High Beta ── */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">High Beta</h3>
            <Badge color="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              Experimentell
            </Badge>
          </div>

          {/* Active toggle */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex rounded-md border border-border overflow-hidden w-fit text-sm">
              {(['long', 'cash'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => updateSignals({
                    ...signals, high_beta: { ...signals.high_beta, signal: s }
                  })}
                  className={`px-3 py-1.5 transition-colors ${
                    signals.high_beta.signal === s
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'long' ? 'Aktiv' : 'Inaktiv'}
                </button>
              ))}
            </div>
          </div>

          {/* Weight */}
          <div className="space-y-1.5">
            <Label htmlFor="hb-weight" className="text-xs text-muted-foreground">
              Gewicht am Gesamtportfolio
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="hb-weight"
                type="number" min="0" max="100" step="1"
                value={Math.round(signals.high_beta.weight * 100)}
                onChange={e => updateSignals({
                  ...signals, high_beta: { ...signals.high_beta, weight: (parseFloat(e.target.value) || 0) / 100 }
                })}
                className="h-8 w-20 text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Fester Anteil wenn aktiv</p>
          </div>

          {/* Editable asset table */}
          <AssetWeightTable
            assets={allocations.high_beta.assets}
            onChange={next => updateAllocations({ ...allocations, high_beta: { assets: next } })}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Änderungen werden sofort im Rechner unten angezeigt
        </p>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs ${saveMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {saveMsg.text}
            </span>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Wird gespeichert…' : 'Einstellungen speichern'}
          </Button>
        </div>
      </div>
    </div>
  )
}
