'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  saveRebalancingTargets, markRebalancingDone, proposeRebalanceExecution,
} from '@/app/(dashboard)/crypto/actions'
import { PendingActionCard } from '@/components/assistant/PendingActionCard'
import { Zap } from 'lucide-react'
import {
  calculateRebalancing, formatDiffQty,
  type RebalancingResult, type RebalancingTarget,
} from '@/lib/crypto/rebalancing'
import { KrakenAssetCombobox } from '@/components/crypto/kraken-asset-combobox'
import type { AssetWithPrice } from '@/components/crypto/portfolio-overview'
import { useSettings } from '@/components/providers/settings-context'
import { fmtCurrency } from '@/lib/format'

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}.${m}.${y}`
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_BADGE_CLASS: Record<string, string> = {
  underweight: 'bg-success/10 text-success',
  overweight:  'bg-danger/10 text-danger',
  balanced:    'bg-muted text-muted-foreground',
}
const STATUS_BADGE_LABEL: Record<string, string> = {
  underweight: 'UNTERGEWICHTET',
  overweight:  'ÜBERGEWICHTET',
  balanced:    'BALANCED',
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  assets:          AssetWithPrice[]
  initialTargets:  RebalancingTarget[]
  totalValue:      number
  lastRebalancing: string | null
  livePrices?:     Record<string, number>
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RebalancingCalculator({
  assets, initialTargets, totalValue, lastRebalancing: initLast, livePrices = {},
}: Props) {
  const { locale } = useSettings()
  const fmtEur     = (n: number) => fmtCurrency(n, 'EUR', locale)
  const fmtDiffEur = (n: number) => `${n > 0 ? '+' : ''}${fmtEur(n)}`

  const nextRowId = useRef(initialTargets.length)
  const [targets, setTargets] = useState(() => initialTargets.map((t, i) => ({ ...t, _id: i })))
  const [threshold, setThreshold] = useState(5)
  const [result, setResult] = useState<RebalancingResult>(() =>
    calculateRebalancing(initialTargets, assets, totalValue, 5, livePrices)
  )
  const [lastRebalancing, setLastRebalancing] = useState(initLast)
  const [isMarking, setIsMarking] = useState(false)
  const [isSaving,  setIsSaving]  = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [dirty,     setDirty]     = useState(false)

  // Automatisches Rebalancing: derselbe Vorschlags-/Bestätigungsweg wie im Athena-Chat (siehe
  // proposeRebalanceExecution) — nach dem Vorschlag übernimmt exakt dieselbe PendingActionCard,
  // die auch im Chat erscheint.
  type RebalanceProposal = Extract<
    Awaited<ReturnType<typeof proposeRebalanceExecution>>, { status: 'pending_confirmation' }
  >
  const [proposal, setProposal]           = useState<RebalanceProposal | null>(null)
  const [proposeError, setProposeError]   = useState<string | null>(null)
  const [isProposing, setIsProposing]     = useState(false)

  async function handleAutoRebalance() {
    setIsProposing(true)
    setProposeError(null)
    try {
      const res = await proposeRebalanceExecution()
      if ('error' in res) setProposeError(res.error)
      else setProposal(res)
    } finally {
      setIsProposing(false)
    }
  }

  // New-target inputs
  const [newSymbol, setNewSymbol]         = useState('')
  const [newCoingeckoId, setNewCoingeckoId] = useState('')
  const [newPct, setNewPct]               = useState('')
  const [coinKey, setCoinKey]             = useState(0)

  useEffect(() => {
    setResult(calculateRebalancing(targets, assets, totalValue, threshold, livePrices))
  }, [targets, assets, totalValue, threshold, livePrices])

  const sumPct  = targets.reduce((s, t) => s + (t.target_pct || 0), 0)
  const isValid = Math.abs(sumPct - 100) < 0.1

  function updatePct(i: number, val: string) {
    const next = targets.map((t, idx) => idx === i ? { ...t, target_pct: parseFloat(val) || 0 } : t)
    setTargets(next)
    setDirty(true)
  }

  function removeRow(i: number) {
    setTargets(targets.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  function addRow() {
    const sym  = newSymbol.trim().toUpperCase()
    const cgId = newCoingeckoId.trim().toLowerCase()
    const pct  = parseFloat(newPct) || 0
    if (!sym || !cgId || pct <= 0) return
    if (targets.some(t => t.coingecko_id === cgId)) return
    setTargets([...targets, { symbol: sym, coingecko_id: cgId, target_pct: pct, _id: nextRowId.current++ }])
    setNewSymbol(''); setNewCoingeckoId(''); setNewPct('')
    setCoinKey(k => k + 1)
    setDirty(true)
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveMsg(null)
    try {
      await saveRebalancingTargets(targets.map(({ symbol, coingecko_id, target_pct }) => ({ symbol, coingecko_id, target_pct })))
      setSaveMsg({ text: 'Gespeichert', ok: true })
      setDirty(false)
    } catch (e) {
      setSaveMsg({ text: e instanceof Error ? e.message : 'Fehler beim Speichern', ok: false })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleMarkDone() {
    setIsMarking(true)
    try {
      await markRebalancingDone()
      setLastRebalancing(new Date().toISOString())
    } finally {
      setIsMarking(false)
    }
  }

  const isBalanced = result.rebalancing_volume < 1 && result.rows.length > 0

  return (
    <div className="space-y-8">
      {/* ── Header + stat cards ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Ziel-Portfolio</h2>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Abweichung ignorieren unter:</span>
            <Input
              type="number" min="0" max="50" step="0.5"
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value) || 0)}
              className="h-7 w-16 text-right"
            />
            <span className="text-muted-foreground">%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Gesamtportfolio" value={fmtEur(totalValue)} />
          <StatCard
            label="Letztes Rebalancing"
            value={lastRebalancing ? fmtDate(lastRebalancing) : 'Noch nie'}
          />
          <StatCard
            label="Rebalancing-Volumen"
            value={fmtEur(result.rebalancing_volume)}
            valueClass={result.rebalancing_volume > 0 ? 'text-warning' : ''}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleMarkDone} disabled={isMarking}>
            {isMarking ? 'Wird gespeichert…' : 'Als erledigt markieren'}
          </Button>
        </div>
      </div>

      {/* ── Target + result table ────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Coin</th>
                <th className="text-right px-4 py-2.5 font-medium">Ziel %</th>
                <th className="text-right px-4 py-2.5 font-medium">Ziel €</th>
                <th className="text-right px-4 py-2.5 font-medium">Aktuell €</th>
                <th className="text-right px-4 py-2.5 font-medium">Differenz €</th>
                <th className="text-left px-4 py-2.5 font-medium">Aktion</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="w-8 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => {
                const row = result.rows.find(r => r.coingecko_id === t.coingecko_id)
                const diffClass =
                  row?.action === 'buy'  ? 'text-success' :
                  row?.action === 'sell' ? 'text-danger'  : 'text-muted-foreground'

                return (
                  <tr key={t._id} className="border-b border-border hover:bg-muted/30 transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{t.symbol}</p>
                      <p className="text-xs text-muted-foreground/60">{t.coingecko_id}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Input
                        type="number" min="0" max="100" step="0.1"
                        value={t.target_pct}
                        onChange={e => updatePct(i, e.target.value)}
                        className="h-7 w-20 text-right ml-auto"
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row ? fmtEur(row.target_eur) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row ? fmtEur(row.current_eur) : '—'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${diffClass}`}>
                      {row ? fmtDiffEur(row.diff_eur) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums ${diffClass}`}>
                      {row ? formatDiffQty(row.diff_qty, row.symbol, row.diff_eur) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[row.status]}`}>
                          {STATUS_BADGE_LABEL[row.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => removeRow(i)}
                        aria-label={`${t.symbol} entfernen`}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {targets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Noch keine Ziel-Assets — unten hinzufügen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sum indicator */}
        {targets.length > 0 && (
          <div className={`text-xs flex items-center gap-1 ${isValid ? 'text-success' : 'text-warning'}`}>
            <span>Summe: {sumPct.toFixed(1).replace('.', ',')} %</span>
            <span>{isValid ? '✓' : '✗ (sollte 100 % ergeben)'}</span>
          </div>
        )}

        {/* Add row */}
        <div className="flex gap-2 items-end pt-1">
          <div className="space-y-1 flex-1 max-w-xs">
            <Label className="text-xs">Coin (Kraken)</Label>
            <KrakenAssetCombobox
              key={coinKey}
              defaultValue={newCoingeckoId || null}
              onChange={coin => {
                setNewSymbol(coin.symbol.toUpperCase())
                setNewCoingeckoId(coin.dbSymbol)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ziel %</Label>
            <Input
              type="number" placeholder="33.3"
              value={newPct}
              onChange={e => setNewPct(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRow()}
              className="h-9 w-24"
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

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pt-1">
          {saveMsg && (
            <span className={`text-xs ${saveMsg.ok ? 'text-success' : 'text-danger'}`}>{saveMsg.text}</span>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving || !dirty}>
            {isSaving ? 'Wird gespeichert…' : 'Ziel-Portfolio speichern'}
          </Button>
        </div>
      </div>

      {/* ── Balanced state ───────────────────────────────────────────────── */}
      {isBalanced && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-5 py-4">
          <CheckCircle2 className="size-5 text-success shrink-0" />
          <p className="text-sm font-medium text-success">
            Portfolio ist balanced — kein Rebalancing nötig
          </p>
        </div>
      )}

      {/* ── Summary footer ───────────────────────────────────────────────── */}
      {result.rebalancing_volume > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-1">
            <p className="text-xs text-success">Kaufen gesamt</p>
            <p className="text-lg font-semibold text-success tabular-nums">
              +{fmtEur(result.total_buy_eur)}
            </p>
          </div>
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 space-y-1">
            <p className="text-xs text-danger">Verkaufen gesamt</p>
            <p className="text-lg font-semibold text-danger tabular-nums">
              −{fmtEur(result.total_sell_eur)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Gesamt-Volumen</p>
            <p className="text-lg font-semibold tabular-nums">
              {fmtEur(result.rebalancing_volume)}
            </p>
          </div>
        </div>
      )}

      {/* ── Automatisches Rebalancing ────────────────────────────────────── */}
      {result.rebalancing_volume > 0 && (
        <div className="space-y-2">
          {!proposal && (
            <div className="flex items-center gap-3">
              <Button variant="default" size="sm" onClick={handleAutoRebalance} disabled={isProposing}>
                <Zap className="size-3.5" />
                {isProposing ? 'Prüft Kraken-Preise & Pairs…' : 'Automatisch rebalancen'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Prüft den günstigsten Ausführungsweg auf Kraken und zeigt die Trades zur
                Bestätigung — es wird noch nichts ausgeführt.
              </p>
            </div>
          )}
          {proposeError && <p className="text-xs text-destructive">{proposeError}</p>}
          {proposal && (
            <PendingActionCard
              actionId={proposal.actionId}
              action="executeRebalancing"
              label={proposal.label}
              summary={proposal.summary}
              details={proposal.details}
            />
          )}
        </div>
      )}
    </div>
  )
}
