'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { ChartTab } from '@/components/depot/depot-chart'
import { DepotTransactionsTable } from '@/components/depot/depot-transactions-table'
import { Skeleton, SkeletonChartBody } from '@/components/ui/skeleton'
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
import { ZuletztGeaendert } from '@/components/aenderungen/ZuletztGeaendert'
import type { ZuletztGeaendertInfo } from '@/lib/data/aenderungen'
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
const CHART_TABS: ChartTab[] = ['Wert', 'Anteile', 'Cost Basis', 'Rendite']

// recharts is a heavy dependency — load it on demand, client-only.
const DepotChart = dynamic(
  () => import('@/components/depot/depot-chart').then(m => m.DepotChart),
  { ssr: false }
)

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
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ title, value, sub, color, loading }: {
  title: string; value: string; sub?: string
  color?: 'green' | 'red' | 'neutral'; loading?: boolean
}) {
  const colorClass = color === 'green' ? 'text-success' : color === 'red' ? 'text-danger' : 'text-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      {loading ? (
        <><Skeleton className="h-6 w-24 mb-1" /><Skeleton className="h-4 w-16" /></>
      ) : (
        <>
          <p className={`text-lg font-semibold tabular-nums ${colorClass}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{sub}</p>}
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DepotDashboard({ canShare = false, leerHinweis, zuletzt }: { canShare?: boolean; leerHinweis?: React.ReactNode; zuletzt?: Record<string, ZuletztGeaendertInfo> }) {
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
  const [newDepotShared, setNewDepotShared] = useState(false)
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

    let cancelled = false

    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/depot/live-price?isin=${activeDepot.isin}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
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
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeDepot])

  // ─── Load transaction data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!activeDepot) return
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
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
    try {
      const result = await createDepot(newDepotName.trim(), newDepotIsin.trim(), canShare && newDepotShared)
      if (!result.success) { setNewDepotError(result.error ?? 'Fehler'); return }
      const list = await getDepots()
      setDepots(list)
      const created = list.find(d => d.id === result.id)
      if (created) setActiveDepot(created)
      setNewDepotName('')
      setNewDepotIsin('')
      setNewDepotShared(false)
      setShowNewDepotForm(false)
      setShowDepotPicker(false)
    } finally {
      setNewDepotBusy(false)
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault(); setDepError(null); setDepBusy(true)
    if (!activeDepot) return
    try {
      const result = await addManualDeposit(
        activeDepot.isin, activeDepot.name,
        parseFloat(depAmount), parseFloat(depPrice), depDate, depNotes || undefined
      )
      if (!result.success) { setDepError(result.error ?? 'Fehler'); return }
      setDepAmount(String(DEFAULT_MONTHLY_AMOUNT))
      setDepNotes('')
      await loadData()
    } finally {
      setDepBusy(false)
    }
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
    try {
      const result = await addInitialHolding(
        activeDepot.isin, activeDepot.name,
        parseFloat(initShares), priceToUse, initDate
      )
      if (!result.success) { setInitError(result.error ?? 'Fehler'); return }
      setInitShares('')
      await loadData()
    } finally {
      setInitBusy(false)
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault(); setPlanError(null); setPlanBusy(true)
    if (!activeDepot) return
    try {
      const result = await createSavingsPlan(
        activeDepot.isin, activeDepot.name,
        parseFloat(planAmount), parseInt(planDay), planStart
      )
      if (!result.success) { setPlanError(result.error ?? 'Fehler'); return }
      setPlanAmount(String(DEFAULT_MONTHLY_AMOUNT))
      setPlanDay('1')
      setPlanStart(today)
      await loadData()
    } finally {
      setPlanBusy(false)
    }
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
    ? { dot: 'bg-destructive', label: 'Offline',    color: 'text-destructive' }
    : isLive
    ? { dot: 'bg-success',   label: 'LIVE',        color: 'text-success' }
    : { dot: 'bg-warning',  label: 'Verzögert',   color: 'text-warning' }

  // ─── Empty state: no depots yet ──────────────────────────────────────────────
  if (!depotsLoading && depots.length === 0) {
    return (
      <div className="p-4 sm:p-8 min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        {leerHinweis && <div className="w-full max-w-md">{leerHinweis}</div>}
        <div className="rounded-xl border border-border bg-card p-8 max-w-sm w-full">
          <h2 className="text-lg font-semibold text-foreground mb-1">Erstes Depot anlegen</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Das Depot verfolgt einen Fonds oder ETF: Käufe, Sparpläne, Wert und Rendite über die Zeit.
            Trage Name und ISIN ein, um zu beginnen.
          </p>
          <form onSubmit={handleCreateDepot} className="space-y-3">
            <input
              placeholder="Name (z.B. UniGlobal Depot)"
              aria-label="Depot-Name"
              value={newDepotName} onChange={e => setNewDepotName(e.target.value)}
              className="w-full text-sm rounded-md bg-background border border-border text-foreground px-3 py-2 outline-none focus:border-primary"
              required
            />
            <input
              placeholder="ISIN (z.B. DE0008491051)"
              aria-label="ISIN"
              value={newDepotIsin} onChange={e => setNewDepotIsin(e.target.value)}
              className="w-full text-sm rounded-md bg-background border border-border text-foreground px-3 py-2 outline-none focus:border-primary font-mono"
              required
            />
            {canShare && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={newDepotShared} onChange={e => setNewDepotShared(e.target.checked)} />
                Mit Haushalt teilen
              </label>
            )}
            {newDepotError && <p className="text-xs text-destructive">{newDepotError}</p>}
            <button
              type="submit" disabled={newDepotBusy}
              className="w-full rounded-md bg-primary hover:bg-primary/90 text-white text-sm px-3 py-2 transition-colors disabled:opacity-50"
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
    <div className="p-4 sm:p-8 min-h-screen bg-background">

      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        {/* Depot switcher */}
        <div className="relative" ref={depotPickerRef}>
          <button
            onClick={() => { setShowDepotPicker(!showDepotPicker); setShowNewDepotForm(false) }}
            className="flex items-start gap-1 text-left"
          >
            <div>
              <h1 className="text-xl font-semibold text-foreground">Depot</h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                {activeDepot ? `${activeDepot.name} · ${activeDepot.isin}` : '—'}
                <ChevronDown className={`size-3 transition-transform ${showDepotPicker ? 'rotate-180' : ''}`} />
              </p>
              {activeDepot && <ZuletztGeaendert info={zuletzt?.[activeDepot.id]} />}
            </div>
          </button>

          {/* Dropdown */}
          {showDepotPicker && (
            <div className="absolute top-full left-0 mt-2 w-72 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
              {depots.map(d => (
                <div
                  key={d.id}
                  className={`flex items-center group transition-colors hover:bg-muted/60 ${d.id === activeDepot?.id ? 'bg-muted/40' : ''}`}
                >
                  <button
                    onClick={() => { setActiveDepot(d); setShowDepotPicker(false) }}
                    className="flex-1 px-4 py-3 text-left"
                  >
                    <p className="text-sm text-foreground font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{d.isin}</p>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDepotToDelete(d); setShowDepotPicker(false) }}
                    aria-label={`Depot ${d.name} löschen`}
                    className="pr-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}

              <div className="border-t border-border" />

              {!showNewDepotForm ? (
                <button
                  onClick={() => setShowNewDepotForm(true)}
                  className="w-full px-4 py-3 text-left text-sm text-primary hover:bg-muted/60 transition-colors flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  Neues Depot
                </button>
              ) : (
                <form onSubmit={handleCreateDepot} className="p-4 space-y-2">
                  <p className="text-xs font-medium text-foreground mb-2">Neues Depot</p>
                  <input
                    placeholder="Name (z.B. UniGlobal)"
                    aria-label="Depot-Name"
                    value={newDepotName} onChange={e => setNewDepotName(e.target.value)}
                    className="w-full text-sm rounded-md bg-background border border-border text-foreground px-3 py-1.5 outline-none focus:border-primary"
                    autoFocus required
                  />
                  <input
                    placeholder="ISIN"
                    aria-label="ISIN"
                    value={newDepotIsin} onChange={e => setNewDepotIsin(e.target.value)}
                    className="w-full text-sm rounded-md bg-background border border-border text-foreground px-3 py-1.5 outline-none focus:border-primary font-mono"
                    required
                  />
                  {canShare && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={newDepotShared} onChange={e => setNewDepotShared(e.target.checked)} />
                      Mit Haushalt teilen
                    </label>
                  )}
                  {newDepotError && <p className="text-xs text-destructive">{newDepotError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit" disabled={newDepotBusy}
                      className="flex-1 text-xs rounded-md bg-primary hover:bg-primary/90 text-white px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {newDepotBusy ? 'Anlegen …' : 'Anlegen'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewDepotForm(false); setNewDepotError(null) }}
                      className="text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 transition-colors"
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
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 self-start sm:self-auto">
          <span className={`size-2 rounded-full shrink-0 ${priceStatus.dot}`} />
          <span className={`text-xs font-medium ${priceStatus.color}`}>{priceStatus.label}</span>
          {livePrice !== null && (
            <span className="text-base font-semibold text-foreground ml-1 tabular-nums">
              {livePrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          )}
          {livePriceFetchedAt && (
            <span className="text-xs text-muted-foreground ml-1">Stand: {fmtTime(livePriceFetchedAt)}</span>
          )}
        </div>
      </div>

      {/* Due plans banner */}
      {duePlans.length > 0 && (
        <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          {duePlans.map(plan => (
            <div key={plan.id} className="flex items-center gap-3">
              <Zap className="size-4 text-warning shrink-0" />
              <p className="text-sm text-warning flex-1">
                Sparplan fällig — {plan.fund_name}{' '}
                <span className="tabular-nums">{plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
              </p>
              <Button
                size="sm"
                disabled={!livePrice}
                onClick={() => handleExecutePlan(plan)}
                className="bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 text-xs"
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
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Tab buttons */}
            <div className="flex border-b border-border">
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
                        ? 'bg-muted/60 text-foreground'
                        : 'text-muted-foreground hover:text-foreground')
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
                    <Label htmlFor="dep-date" className="text-xs text-muted-foreground">Datum</Label>
                    <Input id="dep-date" type="date" value={depDate}
                      onChange={e => setDepDate(e.target.value)}
                      className="mt-1 bg-background border-border text-foreground" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-amount" className="text-xs text-muted-foreground">Betrag (€)</Label>
                    <Input id="dep-amount" type="number" min="0.01" step="0.01" value={depAmount}
                      onChange={e => setDepAmount(e.target.value)}
                      className="mt-1 bg-background border-border text-foreground" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-price" className="text-xs text-muted-foreground">Kurs (NAV)</Label>
                    <Input id="dep-price" type="number" min="0.0001" step="0.0001" value={depPrice}
                      onChange={e => setDepPrice(e.target.value)}
                      className="mt-1 bg-background border-border text-foreground" required />
                  </div>
                  <div>
                    <Label htmlFor="dep-notes" className="text-xs text-muted-foreground">Notiz (optional)</Label>
                    <Input id="dep-notes" type="text" value={depNotes}
                      onChange={e => setDepNotes(e.target.value)}
                      className="mt-1 bg-background border-border text-foreground" />
                  </div>
                  {previewShares !== null && (
                    <div className="rounded-lg bg-background border border-border px-3 py-2 text-xs text-muted-foreground">
                      <span>&#8776;&nbsp;</span>
                      <span className="text-primary font-mono">{fmtShares(previewShares)}</span>
                      <span>&nbsp;Anteile bei&nbsp;</span>
                      <span className="text-foreground font-mono">
                        {parseFloat(depPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                      </span>
                      <span>&nbsp;/ Anteil</span>
                    </div>
                  )}
                  {depError && <p className="text-xs text-destructive">{depError}</p>}
                  <Button type="submit" disabled={depBusy}
                    className="w-full bg-primary hover:bg-primary/90 text-white border-0">
                    {depBusy ? 'Speichern …' : 'Einzahlung speichern'}
                  </Button>
                </form>
              )}

              {/* ── Tab: Bestandsübernahme ──────────────────────────────────── */}
              {formTab === 'initial' && (
                hasInitial ? (
                  <div className="rounded-lg bg-background border border-border px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Bestand wurde bereits eingetragen.</p>
                    <p className="text-xs text-muted-foreground mt-1">Nur eine Bestandsübernahme pro Depot möglich.</p>
                  </div>
                ) : (
                  <form onSubmit={handleInitial} className="space-y-4">
                    <div className="rounded-lg bg-background border border-border px-3 py-2 text-xs text-muted-foreground">
                      Trage hier deine bereits vorhandenen Anteile ein (einmalig). Der Kurs ist optional – leer lassen verwendet den aktuellen Live-Kurs als Einstandspreis.
                    </div>
                    <div>
                      <Label htmlFor="init-shares" className="text-xs text-muted-foreground">Anzahl Anteile</Label>
                      <Input id="init-shares" type="number" min="0.000001" step="0.000001" value={initShares}
                        onChange={e => setInitShares(e.target.value)} placeholder="z.B. 1.43682"
                        className="mt-1 bg-background border-border text-foreground" required />
                    </div>
                    <div>
                      <Label htmlFor="init-price" className="text-xs text-muted-foreground">
                        Einstandspreis <span className="text-muted-foreground/60">(optional – Standard: Live-Kurs)</span>
                      </Label>
                      <Input id="init-price" type="number" min="0.0001" step="0.0001" value={initPrice}
                        onChange={e => setInitPrice(e.target.value)}
                        placeholder={livePrice ? livePrice.toFixed(2) : 'z.B. 348.20'}
                        className="mt-1 bg-background border-border text-foreground" />
                    </div>
                    <div>
                      <Label htmlFor="init-date" className="text-xs text-muted-foreground">Datum der Übernahme</Label>
                      <Input id="init-date" type="date" value={initDate}
                        onChange={e => setInitDate(e.target.value)}
                        className="mt-1 bg-background border-border text-foreground" required />
                    </div>
                    {initError && <p className="text-xs text-destructive">{initError}</p>}
                    <Button type="submit" disabled={initBusy}
                      className="w-full bg-primary hover:bg-primary/90 text-white border-0">
                      {initBusy ? 'Speichern …' : 'Bestand übernehmen'}
                    </Button>
                  </form>
                )
              )}

              {/* ── Tab: Sparplan ───────────────────────────────────────────── */}
              {formTab === 'savings_plan' && (
                <div className="space-y-5">
                  <form onSubmit={handleCreatePlan} className="space-y-3">
                    <p className="text-xs font-medium text-foreground">Neuen Sparplan anlegen</p>
                    <div>
                      <Label htmlFor="plan-amount" className="text-xs text-muted-foreground">Betrag / Monat (€)</Label>
                      <Input id="plan-amount" type="number" min="1" step="0.01" value={planAmount}
                        onChange={e => setPlanAmount(e.target.value)}
                        className="mt-1 bg-background border-border text-foreground" required />
                    </div>
                    <div>
                      <Label htmlFor="plan-day" className="text-xs text-muted-foreground">Ausführungstag (1–28)</Label>
                      <Input id="plan-day" type="number" min="1" max="28" step="1" value={planDay}
                        onChange={e => setPlanDay(e.target.value)}
                        className="mt-1 bg-background border-border text-foreground" required />
                    </div>
                    <div>
                      <Label htmlFor="plan-start" className="text-xs text-muted-foreground">Startdatum</Label>
                      <Input id="plan-start" type="date" value={planStart}
                        onChange={e => setPlanStart(e.target.value)}
                        className="mt-1 bg-background border-border text-foreground" required />
                    </div>
                    {planError && <p className="text-xs text-destructive">{planError}</p>}
                    <Button type="submit" disabled={planBusy}
                      className="w-full bg-primary hover:bg-primary/90 text-white border-0">
                      {planBusy ? 'Anlegen …' : 'Sparplan anlegen'}
                    </Button>
                  </form>

                  {savingsPlans.length > 0 && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-xs font-medium text-foreground">Aktive Sparpläne</p>
                      {savingsPlans.map(plan => (
                        <div key={plan.id}
                          className="rounded-lg border border-border bg-background p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-foreground font-medium tabular-nums">
                                {plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / Monat
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Tag {plan.execution_day} · ab {fmtDate(plan.start_date)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleToggle(plan.id, plan.is_active)}
                              aria-label={plan.is_active ? 'Sparplan deaktivieren' : 'Sparplan aktivieren'}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${plan.is_active ? 'bg-primary' : 'bg-muted'}`}
                            >
                              <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${plan.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!livePrice || !plan.is_active}
                              onClick={() => handleExecutePlan(plan)}
                              className="flex-1 text-xs bg-muted hover:bg-muted/80 text-foreground border-0 h-7"
                            >
                              <Zap className="size-3 mr-1" />
                              Jetzt ausführen
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button aria-label="Sparplan löschen" className="text-muted-foreground hover:text-destructive transition-colors px-1">
                                  <Trash2 className="size-4" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-card border-border">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-foreground">Sparplan löschen?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-muted-foreground">
                                    Der Sparplan über <span className="tabular-nums">{plan.monthly_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span> (Tag {plan.execution_day}) wird dauerhaft gelöscht.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="border-border text-foreground bg-transparent hover:bg-muted">Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeletePlan(plan.id)}
                                    className="bg-destructive hover:bg-destructive/90 text-white border-0">Löschen</AlertDialogAction>
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
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex gap-1 mb-5 flex-wrap">
              {CHART_TABS.map(tab => (
                <button key={tab} onClick={() => setChartTab(tab)}
                  className={
                    'px-3 py-1 rounded-md text-xs font-medium transition-colors ' +
                    (chartTab === tab ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')
                  }>
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <SkeletonChartBody variant="area" height={208} />
            ) : !hasData ? (
              <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
                Noch keine Daten – trage deinen ersten Kauf ein.
              </div>
            ) : (
              <DepotChart chartTab={chartTab} history={history} />
            )}
          </div>

          {/* Transactions table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Transaktionen</h2>
            </div>
            {loading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : sortedTx.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                Noch keine Transaktionen vorhanden.
              </div>
            ) : (
              <DepotTransactionsTable transactions={sortedTx} onDelete={handleDeleteTx} />
            )}
          </div>
        </div>
      </div>

      {/* Delete depot confirmation */}
      <AlertDialog open={depotToDelete !== null} onOpenChange={open => { if (!open) setDepotToDelete(null) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Depot löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {depotToDelete?.name} ({depotToDelete?.isin}) wird dauerhaft gelöscht. Transaktionen bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-foreground bg-transparent hover:bg-muted">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDepot} className="bg-destructive hover:bg-destructive/90 text-white border-0">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
