'use client'

import type { BudgetCategory, BudgetItem, IncomeTarget } from '@/app/(dashboard)/lebenshaltungskosten/page'

function monthlyItem(item: BudgetItem): number {
  return (item.unit_price * item.quantity) / item.interval_days * 30
}

function fmt(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

interface Props {
  categories: BudgetCategory[]
  items:      BudgetItem[]
  target:     IncomeTarget | null
}

export function OverviewTab({ categories, items, target }: Props) {
  const categoryMonthly = (catId: string) =>
    items.filter(i => i.category_id === catId).reduce((s, i) => s + monthlyItem(i), 0)

  const totalMonthly = items.reduce((s, i) => s + monthlyItem(i), 0)

  const buf     = (target?.buffer_pct  ?? 15) / 100
  const sav     = (target?.savings_pct ?? 10) / 100
  const tax     = (target?.tax_pct     ?? 30) / 100
  const netMin  = totalMonthly * (1 + buf) * (1 + sav)
  const grossMin = netMin / (1 - tax)

  return (
    <div className="space-y-6">
      {/* Mindestgehalt box */}
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
          Mindestgehalt-Kalkulation
        </p>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Netto / Monat</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">{fmt(netMin)}</p>
          </div>
          <div className="w-px bg-border hidden sm:block" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Brutto / Monat (Näherung)</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">{fmt(grossMin)}</p>
          </div>
          <div className="w-px bg-border hidden sm:block" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Lebenshaltung gesamt</p>
            <p className="text-2xl font-semibold tabular-nums">{fmt(totalMonthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              + {target?.buffer_pct ?? 15}% Puffer · + {target?.savings_pct ?? 10}% Sparen · {target?.tax_pct ?? 30}% Steuer
            </p>
          </div>
        </div>
      </div>

      {/* Category cards */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Kategorien</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Kategorien angelegt.</p>
        ) : (
          <div className="space-y-2">
            {categories
              .map(cat => {
                const actual = categoryMonthly(cat.id)
                const budget = cat.monthly_budget
                const delta  = budget != null ? actual - budget : null
                return { cat, actual, budget, delta }
              })
              .sort((a, b) => b.actual - a.actual)
              .map(({ cat, actual, budget, delta }) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <span className="text-xl w-8 text-center shrink-0">{cat.icon ?? '📦'}</span>
                  <span className="flex-1 text-sm font-medium">{cat.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground w-24 text-right">
                    {fmt(actual)}
                  </span>
                  {budget != null && (
                    <>
                      <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">
                        Ziel: {fmt(budget)}
                      </span>
                      <span className={`text-xs font-semibold tabular-nums w-20 text-right ${
                        delta! > 0 ? 'text-red-500' : 'text-green-500'
                      }`}>
                        {delta! > 0 ? '+' : ''}{fmt(delta!)}
                      </span>
                    </>
                  )}
                  {budget == null && (
                    <span className="text-xs text-muted-foreground w-44 text-right">kein Budget-Ziel</span>
                  )}
                </div>
              ))}
            {/* Total row */}
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 font-semibold">
              <span className="w-8 shrink-0" />
              <span className="flex-1 text-sm">Gesamt</span>
              <span className="text-sm tabular-nums w-24 text-right">{fmt(totalMonthly)}</span>
              <span className="w-44" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
