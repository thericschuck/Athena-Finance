'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  addInitialHolding,
  addManualDeposit,
  getDepotTransactions,
  getPortfolioHistory,
  deleteDepotTransaction,
  createSavingsPlan,
  getSavingsPlans,
  toggleSavingsPlan,
  deleteSavingsPlan,
  executeSavingsPlanPayment,
  getDepots,
  createDepot,
  deleteDepot,
} from '@/app/actions/depot'
import type { DepotTransaction, PortfolioHistoryPoint, SavingsPlan, Depot } from '@/app/actions/depot'
import { checkDueSavingsPlans } from '@/lib/depot/savingsPlanChecker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ChevronDown, Plus, Trash2, Zap } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MONTHLY_AMOUNT = 50

type FormTab   = 'deposit' | 'initial' | 'savings_plan'
type ChartTab  = 'Wert' | 'Anteile' | 'Cost Basis' | 'Rendite'
const CHART_TABS: ChartTab[] = ['Wert', 'Anteile', 'Cost Basis', 'Rendite']

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'
}
function fmtShares(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateShort(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#30363d]/60 ${className ?? ''}`} />
}

function StatCard({ title, value, sub, color, loading }: {
  title: string; value: string; sub?: string
  color?: 'green' | 'red' | 'neutral'; loading?: boolean
}) {
  const colorClass = color === 'green' ? 'text-[#3fb950]' : color === 'red' ? 'text-[#f85149]' : 'text-[#c9d1d9]'
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
      <p className="text-xs text-[#8b949e] mb-1">{title}</p>
      {loading ? (
        <><Skeleton className="h-6 w-24 mb-1" /><Skeleton className="h-4 w-16" /></>
      ) : (
        <>
          <p className={`text-lg font-semibold ${colorClass}`}>{value}</p>
          {sub && <p className="text-xs text-[#8b949e] mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ value: number; name: string; [k: string]: any }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs shadow-lg">
      <p className="text-[#8b949e] mb-1">{label ? fmtDate(label) : ''}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[#c9d1d9]">
          {p.name === 'portfolioValue' ? 'Wert: ' + fmtEur(p.value) :
           p.name === 'totalInvested'  ? 'Investiert: ' + fmtEur(p.value) :
           p.name === 'totalShares'    ? 'Anteile: ' + fmtShares(p.value) :
           p.name === 'returnPct'      ? 'Rendite: ' + fmtPct(p.value) :
           String(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DepotDashboard() {
  const today = new Date().toISOString().split('T')[0]

  // ─── Depot management ───────────────────────────────────────────────────────
  const [depots, setDepots]               = useState<Depot[]>([])
  const [activeDepot, setActiveDepot]     = useState<Depot | null>(null)
  const [depotsLoading, setDepotsLoading] = useState(true)
  const [showDepotPicker, setShowDepotPicker]   = useState(false)
  const [showNewDepotForm, setShowNewDepotForm] = useState(false)
  const [newDepotName, setNewDepotName]   = useState('')
  const [newDepotIsin, setNewDepotIsin]   = useState('')
  const [newDepotError, setNewDepotError] = useState<string | null>(null)
  const [newDepotBusy, setNewDepotBusy]   = useState(false)
  const [depotToDelete, setDepotToDelete] = useState<Depot | null>(null)
  const depotPickerRef = useRef<HTMLDivElement>(null)

  // ─── Live price ─────────────────────────────────────────────────────────────
  const [livePrice, setLivePrice]          = useState<number | null>(null)
  const [livePriceFetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isLive, setIsLive]                = useState(false)
  const livePricePreFilled                 = useRef(false)

  // ─── Form tabs ──────────────────────────────────────────────────────────────
  const [formTab, setFormTab] = useState<FormTab>('deposit')

  // ─── Deposit form ───────────────────────────────────────────────────────────
  const [depDate, setDepDate]     = useState(today)
  const [depAmount, setDepAmount] = useState(String(DEFAULT_MONTHLY_AMOUNT))
  const [depPrice, setDepPrice]   = useState('')
  const [depNotes, setDepNotes]   = useState('')
  const [depError, setDepError]   = useState<string | null>(null)
  const [depBusy, setDepBusy]     = useState(false)

  // ─── Initial holding form ───────────────────────────────────────────────────
  const [initShares, setInitShares] = useState('')
  const [initPrice, setInitPrice]   = useState('')
  const [initDate, setInitDate]     = useState(today)
  const [initError, setInitError]   = useState<string | null>(null)
  const [initBusy, setInitBusy]     = useState(false)

  // ─── Savings plan form ──────────────────────────────────────────────────────
  const [planAmount, setPlanAmount] = useState(String(DEFAULT_MONTHLY_AMOUNT))
  const [planDay, setPlanDay]       = useState('1')
  const [planStart, setPlanStart]   = useState(today)
  const [planError, setPlanError]   = useState<string | null>(null)
  const [planBusy, setPlanBusy]     = useState(false)

  // ─── Data ───────────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<DepotTransaction[]>([])
  const [history, setHistory]           = useState<PortfolioHistoryPoint[]>([])
  const [savingsPlans, setSavingsPlans] = useState<SavingsPlan[]>([])
  const [duePlans, setDuePlans]         = useState<SavingsPlan[]>([])
  const [loading, setLoading]           = useState(false)

  // ─── Chart ──────────────────────────────────────────────────────────────────
  const [chartTab, setChartTab] = useState<ChartTab>('Wert')

  // ─── Load depots (once on mount) ────────────────────────────────────────────
  useEffect(() => {
    getDepots().then(list => {
      setDepots(list)
      if (list.length > 0) setActiveDepot(list[0])
      setDepotsLoading(false)
    })
  }, [])

  // ─── Close depot picker on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showDepotPicker) return
    function handleOutside(e: MouseEvent) {
      if (depotPickerRef.current && !depotPickerRef.current.contains(e.target as Node)) {
        setShowDepotPicker(false)
        setShowNewDepotForm(false)
        setNewDepotError(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showDepotPicker])

  // ─── Live price polling (restarts when active depot changes) ────────────────
  useEffect(() => {
    if (!activeDepot) return
    setLivePrice(null)
    setFetchedAt(null)
    setIsLive(false)
    livePricePreFilled.current = false

    const fetchPrice = async () => {
      try {
        const res  = await fetch(`/api/depot/live-price?isin=${activeDepot.isin}`)
        const data = await res.json()
        if (data.price) {
          setLivePrice(Number(data.price))
          if (!livePricePreFilled.current) {
            setDepPrice(Number(data.price).toFixed(4))
            livePricePreFilled.current = true
          }
        }
        setIsLive(data.isLive ?? false)
        setFetchedAt(data.fetchedAt ?? null)
      } catch {}
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 5 * 60_000)
    return () => clearInterval(interval)
  }, [activeDepot])

  // ─── Load transaction data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!activeDepot) return
    setLoading(true)
    const [txs, hist, allPlans] = await Promise.all([
      getDepotTransactions(activeDepot.isin),
      getPortfolioHistory(activeDepot.isin),
      getSavingsPlans(),
    ])
    const plans = allPlans.filter(p => p.isin === activeDepot.isin)
    setTransactions(txs)
    setHistory(hist)
    setSavingsPlans(plans)
    setDuePlans(checkDueSavingsPlans(plans, txs))
    setLoading(false)
  }, [activeDepot])

  useEffect(() => { loadData() }, [loadData])

  // ─── Derived stats ──────────────────────────────────────────────────────────
  const lastPoint      = history[history.length - 1]
  const totalShares    = lastPoint?.totalShares    ?? 0
  const totalInvested  = lastPoint?.totalInvested  ?? 0
  const portfolioValue = livePrice ? totalShares * livePrice : (lastPoint?.portfolioValue ?? 0)
  const returnAbs      = portfolioValue - totalInvested
  const returnPct      = totalInvested > 0 ? (returnAbs / totalInvested) * 100 : 0
  const hasData        = history.length > 0
  const hasInitial     = transactions.some(t => t.transaction_type === 'initial')

  const previewShares = useMemo(() => {
    const a = parseFloat(depAmount), p = parseFloat(depPrice)
    return (!isNaN(a) && a > 0 && !isNaN(p) && p > 0) ? a / p : null
  }, [depAmount, depPrice])

  const sortedTx = [...transactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))

  function yTickFmt(v: number) {
    if (chartTab === 'Rendite') return v.toFixed(1) + '%'
    if (chartTab === 'Anteile') return v.toFixed(3)
    return Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────
  async function handleDeleteDepot() {
    if (!depotToDelete) return
    await deleteDepot(depotToDelete.id)
    const list = await getDepots()
    setDepots(list)
    if (activeDepot?.id === depotToDelete.id) {
      setActiveDepot(list[0] ?? null)
    }
    setDepotToDelete(null)
  }

  async function handleCreateDepot(e: React.FormEvent) {
    e.preventDefault()
    setNewDepotError(null)
    setNewDepotBusy(true)
    const result = await createDepot(newDepotName.trim(), newDepotIsin.trim())
    setNewDepotBusy(false)
    if (!result.success) { setNewDepotError(result.error ?? 'Fehler'); return }
    const list = await getDepots()
    setDepots(list)
    const created = list.find(d => d.id === result.id)
    if (created) setActiveDepot(created)
    setNewDepotName('')
    setNewDepotIsin('')
    setShowNewDepotForm(false)
    setShowDepotPicker(false)
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault(); setDepError(null); setDepBusy(true)
    if (!activeDepot) return
    const result = await addManualDeposit(
      activeDepot.isin, activeDepot.name,
      parseFloat(depAmount), parseFloat(depPrice), depDate, depNotes || undefined
    )
    setDepBusy(false)
    if (!result.success) { setDepError(result.error ?? 'Fehler'); return }
    setDepAmount(String(DEFAULT_MONTHLY_AMOUNT))
    setDepNotes('')
    await loadData()
  }

  async function handleInitial(e: React.FormEvent) {
    e.preventDefault(); setInitError(null); setInitBusy(true)
    if (!activeDepot) return
    const priceToUse = initPrice ? parseFloat(initPrice) : livePrice
    if (!priceToUse) {
      setInitError('Kein Live-Kurs verfügbar – bitte Kurs manuell eingeben')
      setInitBusy(false)
      return
    }
    const result = await addInitialHolding(
      activeDepot.isin, activeDepot.name,
      parseFloat(initShares), priceToUse, initDate
    )
    setInitBusy(false)
    if (!result.success) { setInitError(result.error ?? 'Fehler'); return }
    setInitShares('')
    await loadData()
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault(); setPlanError(null); setPlanBusy(true)
    if (!activeDepot) return
    const result = await createSavingsPlan(
      activeDepot.isin, activeDepot.name,
      parseFloat(planAmount), parseInt(planDay), planStart
    )
    setPlanBusy(false)
    if (!result.success) { setPlanError(result.error ?? 'Fehler'); return }
    setPlanAmount(String(DEFAULT_MONTHLY_AMOUNT))
    setPlanDay('1')
    setPlanStart(today)
    await loadData()
  }

  async function handleToggle(id: string, current: boolean) {
    await toggleSavingsPlan(id, !current)
    await loadData()
  }

  async function handleExecutePlan(plan: SavingsPlan) {
    if (!livePrice) return
    await executeSavingsPlanPayment(plan.id, livePrice)
    await loadData()
  }

  async function handleDeletePlan(id: string) {
    await deleteSavingsPlan(id)
    await loadData()
  }

  async function handleDeleteTx(id: string) {
    await deleteDepotTransaction(id)
    await loadData()
  }

  // ─── Live price badge ────────────────────────────────────────────────────────
  const priceStatus = livePrice === null
    ? { dot: 'bg-[#f85149]', label: 'Offline',    color: 'text-[#f85149]' }
    : isLive
    ? { dot: 'bg-[#3fb950]', label: 'LIVE',        color: 'text-[#3fb950]' }
    : { dot: 'bg-[#e3b341]', label: 'Verzögert',   color: 'text-[#e3b341]' }

  // ─── Empty state: no depots yet ──────────────────────────────────────────────
  if (!depotsLoading && depots.length === 0) {
    return (
      <div className="p-4 sm:p-8 min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 max-w-sm w-full">
          <h2 className="text-lg font-semibold text-[#c9d1d9] mb-1">Erstes Depot anlegen</h2>
          <p className="text-sm text-[#8b949e] mb-5">
            Trage Name und ISIN deines Fonds ein, um zu beginnen.
          </p>
          <form onSubmit={handleCreateDepot} className="space-y-3">
            <input
              placeholder="Name (z.B. UniGlobal Depot)"
              value={newDepotName} onChange={e => setNewDepotName(e.target.value)}
              className="w-full text-sm rounded-md bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] px-3 py-2 outline-none focus:border-[#58a6ff]"
              required
            />
            <input
              placeholder="ISIN (z.B. DE0008491051)"
              value={newDepotIsin} onChange={e => setNewDepotIsin(e.target.value)}
              className="w-full text-sm rounded-md bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] px-3 py-2 outline-none focus:border-[#58a6ff] font-mono"
              required
            />
            {newDepotError && <p className="text-xs text-[#f85149]">{newDepotError}</p>}
            <button
              type="submit" disabled={newDepotBusy}
              className="w-full rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm px-3 py-2 transition-colors disabled:opacity-50"
            >
              {newDepotBusy ? 'Anlegen …' : 'Depot anlegen'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-8 min-h-screen bg-[#0d1117]">

      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        {/* Depot switcher */}
        <div className="relative" ref={depotPickerRef}>
          <button
            onClick={() => { setShowDepotPicker(!showDepotPicker); setShowNewDepotForm(false) }}
            className="flex items-start gap-1 text-left"
          >
            <div>
              <h1 className="text-xl font-semibold text-[#c9d1d9]">Depot</h1>
              <p className="text-sm text-[#8b949e] mt-0.5 flex items-center gap-1">
                {activeDepot ? `${activeDepot.name} · ${activeDepot.isin}` : '—'}
                <ChevronDown className={`size-3 transition-transform ${showDepotPicker ? 'rotate-180' : ''}`} />
              </p>
            </div>
          </button>

          {/* Dropdown */}
          {showDepotPicker && (
            <div className="absolute top-full left-0 mt-2 w-72 rounded-xl border border-[#30363d] bg-[#161b22] shadow-xl z-50 overflow-hidden">
              {depots.map(d => (
                <div
                  key={d.id}
                  className={`flex items-center group transition-colors hover:bg-[#30363d]/60 ${d.id === activeDepot?.id ? 'bg-[#30363d]/40' : ''}`}
                >
                  <button
                    onClick={() => { setActiveDepot(d); setShowDepotPicker(false) }}
                    className="flex-1 px-4 py-3 text-left"
                  >
                    <p className="text-sm text-[#c9d1d9] font-medium">{d.name}</p>
                    <p className="text-xs text-[#8b949e] font-mono">{d.isin}</p>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDepotToDelete(d); setShowDepotPicker(false) }}
                    className="pr-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#8b949e] hover:text-[#f85149]"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}

              <div className="border-t border-[#30363d]" />

              {!showNewDepotForm ? (
                <button
                  onClick={() => setShowNewDepotForm(true)}
                  className="w-full px-4 py-3 text-left text-sm text-[#58a6ff] hover:bg-[#30363d]/60 transition-colors flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  Neues Depot
                </button>
              ) : (
                <form onSubmit={handleCreateDepot} className="p-4 space-y-2">
                  <p className="text-xs font-medium text-[#c9d1d9] mb-2">Neues Depot</p>
                  <input
                    placeholder="Name (z.B. UniGlobal)"
                    value={newDepotName} onChange={e => setNewDepotName(e.target.value)}
                    className="w-full text-sm rounded-md bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 outline-none focus:border-[#58a6ff]"
                    autoFocus required
                  />
                  <input
                    placeholder="ISIN"
                    value={newDepotIsin} onChange={e => setNewDepotIsin(e.target.value)}
                    className="w-full text-sm rounded-md bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] px-3 py-1.5 outline-none focus:border-[#58a6ff] font-mono"
                    required
                  />
                  {newDepotError && <p className="text-xs text-[#f85149]">{newDepotError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit" disabled={newDepotBusy}
                      className="flex-1 text-xs rounded-md bg-[#238636] hover:bg-[#2ea043] text-white px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {newDepotBusy ? 'Anlegen …' : 'Anlegen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewDepotForm(false); setNewDepotError(null) }}
                      className="text-xs rounded-md bg-[#30363d] hover:bg-[#30363d]/80 text-[#c9d1d9] px-3 py-1.5 transition-colors"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Live price badge */}
        <div className="flex items-center gap-2 rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-2 self-start sm:self-auto">
          <span className={`size-2 rounded-full shrink-0 ${priceStatus.dot}`} />
          <span className={`text-xs font-medium ${priceStatus.color}`}>{priceStatus.label}</span>
          {livePrice !== null && (
            <span className="text-base font-semibold text-[#c9d1d9] ml-1">
              {livePrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          )}
          {livePriceFetchedAt && (
            <span className="text-xs text-[#8b949e] ml-1">Stand: {fmtTime(livePriceFetchedAt)}</span>
          )}
        </div>
      </div>

      {/* Due plans banner */}
      {duePlans.length > 0 && (
        <div className="mb-5 rounded-xl border border-[#e3b341]/40 bg-[#e3b341]/10 px-4 py-3">
          {duePlans.map(plan => (
            <div key={plan.id} className="flex items-center gap-3">
              <Zap className="size-4 text-[#e3b341] shrink-0" />
              <p className="text-sm text-[#e3b341] flex-1">
                Sparplan fällig — {plan.fund_name}{' '}
                {plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
              <Button
                size="sm"
                disabled={!livePrice}
                onClick={() => handleExecutePlan(plan)}
                className="bg-[#e3b341]/20 hover:bg-[#e3b341]/30 text-[#e3b341] border border-[#e3b341]/40 text-xs"
              >
                Jetzt ausführen
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── Left: Form tabs ─────────────────────────────────────────────── */}
        <div className="lg:w-1/3 shrink-0">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
            {/* Tab buttons */}
            <div className="flex border-b border-[#30363d]">
              {(['deposit', 'initial', 'savings_plan'] as FormTab[]).map(tab => {
                const labels: Record<FormTab, string> = {
                  deposit: 'Einzahlung',
                  initial: 'Bestand',
                  savings_plan: 'Sparplan',
                }
                return (
                  <button
                    key={tab}
                    onClick={() => setFormTab(tab)}
                    className={
                      'flex-1 py-2.5 text-xs font-medium transition-colors ' +
                      (formTab === tab
                        ? 'bg-[#30363d]/60 text-[#c9d1d9]'
                        : 'text-[#8b949e] hover:text-[#c9d1d9]')
                    }
                  >
                    {labels[tab]}
                  </button>
                )
              })}
            </div>

            <div className="p-5">
              {/* ── Tab: Einzahlung ─────────────────────────────────────────── */}
              {formTab === 'deposit' && (
                <form onSubmit={handleDeposit} className="space-y-4">
                  <div>
                    <Label htmlFor="dep-date" className="text-xs text-[#8b949e]">Datum</Label>
                    <Input id="dep-date" type="date" value={depDate}
                      onChange={e => setDepDate(e.target.value)}
                      className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-amount" className="text-xs text-[#8b949e]">Betrag (€)</Label>
                    <Input id="dep-amount" type="number" min="0.01" step="0.01" value={depAmount}
                      onChange={e => setDepAmount(e.target.value)}
                      className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-price" className="text-xs text-[#8b949e]">Kurs (NAV)</Label>
                    <Input id="dep-price" type="number" min="0.0001" step="0.0001" value={depPrice}
                      onChange={e => setDepPrice(e.target.value)}
                      className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-notes" className="text-xs text-[#8b949e]">Notiz (optional)</Label>
                    <Input id="dep-notes" type="text" value={depNotes}
                      onChange={e => setDepNotes(e.target.value)}
                      className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" />
                  </div>
                  {previewShares !== null && (
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] px-3 py-2 text-xs text-[#8b949e]">
                      <span>&#8776;&nbsp;</span>
                      <span className="text-[#58a6ff] font-mono">{fmtShares(previewShares)}</span>
                      <span>&nbsp;Anteile bei&nbsp;</span>
                      <span className="text-[#c9d1d9] font-mono">
                        {parseFloat(depPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                      </span>
                      <span>&nbsp;/ Anteil</span>
                    </div>
                  )}
                  {depError && <p className="text-xs text-[#f85149]">{depError}</p>}
                  <Button type="submit" disabled={depBusy}
                    className="w-full bg-[#238636] hover:bg-[#2ea043] text-white border-0">
                    {depBusy ? 'Speichern …' : 'Einzahlung speichern'}
                  </Button>
                </form>
              )}

              {/* ── Tab: Bestandsübernahme ──────────────────────────────────── */}
              {formTab === 'initial' && (
                hasInitial ? (
                  <div className="rounded-lg bg-[#0d1117] border border-[#30363d] px-4 py-6 text-center">
                    <p className="text-sm text-[#8b949e]">Bestand wurde bereits eingetragen.</p>
                    <p className="text-xs text-[#8b949e] mt-1">Nur eine Bestandsübernahme pro Depot möglich.</p>
                  </div>
                ) : (
                  <form onSubmit={handleInitial} className="space-y-4">
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] px-3 py-2 text-xs text-[#8b949e]">
                      Trage hier deine bereits vorhandenen Anteile ein (einmalig). Der Kurs ist optional – leer lassen verwendet den aktuellen Live-Kurs als Einstandspreis.
                    </div>
                    <div>
                      <Label htmlFor="init-shares" className="text-xs text-[#8b949e]">Anzahl Anteile</Label>
                      <Input id="init-shares" type="number" min="0.000001" step="0.000001" value={initShares}
                        onChange={e => setInitShares(e.target.value)} placeholder="z.B. 1.43682"
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                    </div>
                    <div>
                      <Label htmlFor="init-price" className="text-xs text-[#8b949e]">
                        Einstandspreis <span className="text-[#8b949e]/60">(optional – Standard: Live-Kurs)</span>
                      </Label>
                      <Input id="init-price" type="number" min="0.0001" step="0.0001" value={initPrice}
                        onChange={e => setInitPrice(e.target.value)}
                        placeholder={livePrice ? livePrice.toFixed(2) : 'z.B. 348.20'}
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" />
                    </div>
                    <div>
                      <Label htmlFor="init-date" className="text-xs text-[#8b949e]">Datum der Übernahme</Label>
                      <Input id="init-date" type="date" value={initDate}
                        onChange={e => setInitDate(e.target.value)}
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                    </div>
                    {initError && <p className="text-xs text-[#f85149]">{initError}</p>}
                    <Button type="submit" disabled={initBusy}
                      className="w-full bg-[#238636] hover:bg-[#2ea043] text-white border-0">
                      {initBusy ? 'Speichern …' : 'Bestand übernehmen'}
                    </Button>
                  </form>
                )
              )}

              {/* ── Tab: Sparplan ───────────────────────────────────────────── */}
              {formTab === 'savings_plan' && (
                <div className="space-y-5">
                  <form onSubmit={handleCreatePlan} className="space-y-3">
                    <p className="text-xs font-medium text-[#c9d1d9]">Neuen Sparplan anlegen</p>
                    <div>
                      <Label htmlFor="plan-amount" className="text-xs text-[#8b949e]">Betrag / Monat (€)</Label>
                      <Input id="plan-amount" type="number" min="1" step="0.01" value={planAmount}
                        onChange={e => setPlanAmount(e.target.value)}
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                    </div>
                    <div>
                      <Label htmlFor="plan-day" className="text-xs text-[#8b949e]">Ausführungstag (1–28)</Label>
                      <Input id="plan-day" type="number" min="1" max="28" step="1" value={planDay}
                        onChange={e => setPlanDay(e.target.value)}
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                    </div>
                    <div>
                      <Label htmlFor="plan-start" className="text-xs text-[#8b949e]">Startdatum</Label>
                      <Input id="plan-start" type="date" value={planStart}
                        onChange={e => setPlanStart(e.target.value)}
                        className="mt-1 bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" required />
                    </div>
                    {planError && <p className="text-xs text-[#f85149]">{planError}</p>}
                    <Button type="submit" disabled={planBusy}
                      className="w-full bg-[#238636] hover:bg-[#2ea043] text-white border-0">
                      {planBusy ? 'Anlegen …' : 'Sparplan anlegen'}
                    </Button>
                  </form>

                  {savingsPlans.length > 0 && (
                    <div className="space-y-2 border-t border-[#30363d] pt-4">
                      <p className="text-xs font-medium text-[#c9d1d9]">Aktive Sparpläne</p>
                      {savingsPlans.map(plan => (
                        <div key={plan.id}
                          className="rounded-lg border border-[#30363d] bg-[#0d1117] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-[#c9d1d9] font-medium">
                                {plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / Monat
                              </p>
                              <p className="text-xs text-[#8b949e]">
                                Tag {plan.execution_day} · ab {fmtDate(plan.start_date)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleToggle(plan.id, plan.is_active)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${plan.is_active ? 'bg-[#238636]' : 'bg-[#30363d]'}`}
                            >
                              <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${plan.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!livePrice || !plan.is_active}
                              onClick={() => handleExecutePlan(plan)}
                              className="flex-1 text-xs bg-[#30363d] hover:bg-[#30363d]/80 text-[#c9d1d9] border-0 h-7"
                            >
                              <Zap className="size-3 mr-1" />
                              Jetzt ausführen
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="text-[#8b949e] hover:text-[#f85149] transition-colors px-1">
                                  <Trash2 className="size-4" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-[#161b22] border-[#30363d]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-[#c9d1d9]">Sparplan löschen?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-[#8b949e]">
                                    Der Sparplan über {plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € (Tag {plan.execution_day}) wird dauerhaft gelöscht.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-[#30363d] text-[#c9d1d9] bg-transparent hover:bg-[#30363d]">Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeletePlan(plan.id)}
                                    className="bg-[#da3633] hover:bg-[#f85149] text-white border-0">Löschen</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Stats + Chart + Table ────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard title="Portfoliowert"
              value={loading ? '' : fmtEur(portfolioValue)}
              sub={loading ? '' : (hasData ? fmtShares(totalShares) + ' Anteile' : '–')}
              loading={loading} />
            <StatCard title="Investiert"
              value={loading ? '' : fmtEur(totalInvested)}
              loading={loading} />
            <StatCard title="Gewinn / Verlust"
              value={loading ? '' : (returnAbs >= 0 ? '+' : '') + fmtEur(returnAbs)}
              sub={loading ? '' : (hasData ? (returnPct >= 0 ? '+' : '') + fmtPct(returnPct) : '–')}
              color={!loading && hasData ? (returnAbs >= 0 ? 'green' : 'red') : 'neutral'}
              loading={loading} />
            <StatCard title="Live-Kurs"
              value={loading ? '' : (livePrice ? livePrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '–')}
              sub={loading ? '' : (livePriceFetchedAt ? priceStatus.label + ' ' + fmtTime(livePriceFetchedAt) : '')}
              loading={loading} />
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="flex gap-1 mb-5 flex-wrap">
              {CHART_TABS.map(tab => (
                <button key={tab} onClick={() => setChartTab(tab)}
                  className={
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors ' +
                    (chartTab === tab ? 'bg-[#30363d] text-[#c9d1d9]' : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d]/50')
                  }>
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : !hasData ? (
              <div className="flex items-center justify-center h-52 text-sm text-[#8b949e]">
                Noch keine Daten – trage deinen ersten Kauf ein.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                {chartTab === 'Rendite' ? (
                  <LineChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#30363d" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="returnPct" stroke="#58a6ff" dot={false} strokeWidth={2} />
                  </LineChart>
                ) : (
                  <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradValue"    x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#58a6ff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3fb950" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    {chartTab === 'Wert' && (
                      <Area type="monotone" dataKey="portfolioValue" stroke="#58a6ff" fill="url(#gradValue)" strokeWidth={2} dot={false} />
                    )}
                    {chartTab === 'Anteile' && (
                      <Area type="monotone" dataKey="totalShares" stroke="#58a6ff" fill="url(#gradValue)" strokeWidth={2} dot={false} />
                    )}
                    {chartTab === 'Cost Basis' && (
                      <>
                        <Area type="monotone" dataKey="portfolioValue" stroke="#58a6ff" fill="url(#gradValue)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="totalInvested" stroke="#3fb950" fill="url(#gradInvested)" strokeWidth={2} dot={false} />
                      </>
                    )}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            )}
          </div>

          {/* Transactions table */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#30363d]">
              <h2 className="text-sm font-semibold text-[#c9d1d9]">Transaktionen</h2>
            </div>
            {loading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : sortedTx.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[#8b949e]">
                Noch keine Transaktionen vorhanden.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e] text-xs">
                      <th className="text-left px-5 py-2 font-medium">Datum</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Typ</th>
                      <th className="text-right px-3 py-2 font-medium">Betrag</th>
                      <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Kurs</th>
                      <th className="text-right px-3 py-2 font-medium">Anteile</th>
                      <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Notiz</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTx.map(tx => {
                      const typeLabel = tx.transaction_type === 'initial' ? 'Bestand' : tx.transaction_type === 'savings_plan' ? 'Sparplan' : 'Kauf'
                      const typeColor = tx.transaction_type === 'initial' ? 'text-[#e3b341]' : tx.transaction_type === 'savings_plan' ? 'text-[#58a6ff]' : 'text-[#3fb950]'
                      return (
                        <tr key={tx.id} className="group border-b border-[#30363d]/50 hover:bg-[#30363d]/20 transition-colors">
                          <td className="px-5 py-2.5 text-[#c9d1d9] whitespace-nowrap">{fmtDate(tx.transaction_date)}</td>
                          <td className={`px-3 py-2.5 text-xs hidden sm:table-cell whitespace-nowrap ${typeColor}`}>{typeLabel}</td>
                          <td className="px-3 py-2.5 text-right text-[#c9d1d9] whitespace-nowrap">{fmtEur(tx.amount_eur)}</td>
                          <td className="px-3 py-2.5 text-right text-[#8b949e] whitespace-nowrap hidden sm:table-cell">
                            {tx.price_per_share.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                          </td>
                          <td className="px-3 py-2.5 text-right text-[#58a6ff] font-mono whitespace-nowrap">
                            {fmtShares(tx.shares)}
                          </td>
                          <td className="px-3 py-2.5 text-[#8b949e] hidden md:table-cell max-w-[120px] truncate">
                            {tx.notes ?? '–'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-[#8b949e] hover:text-[#f85149]">
                                  <Trash2 className="size-4" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-[#161b22] border-[#30363d]">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-[#c9d1d9]">Transaktion löschen?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-[#8b949e]">
                                    Transaktion vom {fmtDate(tx.transaction_date)} über {fmtEur(tx.amount_eur)} wird dauerhaft gelöscht.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-[#30363d] text-[#c9d1d9] bg-transparent hover:bg-[#30363d]">Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteTx(tx.id)}
                                    className="bg-[#da3633] hover:bg-[#f85149] text-white border-0">Löschen</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete depot confirmation */}
      <AlertDialog open={depotToDelete !== null} onOpenChange={open => { if (!open) setDepotToDelete(null) }}>
        <AlertDialogContent className="bg-[#161b22] border-[#30363d]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#c9d1d9]">Depot löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8b949e]">
              {depotToDelete?.name} ({depotToDelete?.isin}) wird dauerhaft gelöscht. Transaktionen bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#30363d] text-[#c9d1d9] bg-transparent hover:bg-[#30363d]">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDepot} className="bg-[#da3633] hover:bg-[#f85149] text-white border-0">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
