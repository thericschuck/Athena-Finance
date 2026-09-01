'use client'

import { Wallet, Landmark, ShoppingBasket } from 'lucide-react'
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

  const bufPct  = target?.buffer_pct  ?? 15
  const savPct  = target?.savings_pct ?? 10
  const taxPct  = target?.tax_pct     ?? 30
  const buf     = bufPct / 100
  const sav     = savPct / 100
  const tax     = taxPct / 100
  const bufAbs  = totalMonthly * buf
  const savAbs  = (totalMonthly + bufAbs) * sav
  const netMin  = totalMonthly + bufAbs + savAbs
  const grossMin = netMin / (1 - tax)

  // Zusammensetzung von netMin als Segmente einer Kompositions-Leiste — macht
  // sichtbar, WORAUS die Zahl sich ergibt, statt nur das Endergebnis zu zeigen.
  const composition = [
    { label: 'Lebenshaltung', value: totalMonthly, color: 'var(--chart-cat-1)' },
    { label: `Puffer (${bufPct}%)`,  value: bufAbs,  color: 'var(--chart-cat-2)' },
    { label: `Sparen (${savPct}%)`,  value: savAbs,  color: 'var(--chart-cat-3)' },
  ]

  const rows = categories
    .map(cat => {
      const actual = categoryMonthly(cat.id)
      const budget = cat.monthly_budget
      const delta  = budget != null ? actual - budget : null
      const pct    = budget != null && budget > 0 ? Math.min(actual / budget, 1) * 100 : null
      const over   = delta != null && delta > 0
      return { cat, actual, budget, delta, pct, over }
    })
    .sort((a, b) => b.actual - a.actual)

  return (
    <div className="space-y-6">
      {/* Mindestgehalt box */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Mindestgehalt-Kalkulation
        </p>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1 flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-(--chart-accent)/15 text-(--chart-accent)">
              <Wallet className="size-4.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Netto / Monat</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{fmt(netMin)}</p>
            </div>
          </div>
          <div className="w-px bg-border hidden sm:block" />
          <div className="flex-1 flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Landmark className="size-4.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Brutto / Monat (Näherung)</p>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">{fmt(grossMin)}</p>
            </div>
          </div>
          <div className="w-px bg-border hidden sm:block" />
          <div className="flex-1 flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-(--chart-cat-1)/15 text-(--chart-cat-1)">
              <ShoppingBasket className="size-4.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Lebenshaltung gesamt</p>
              <p className="text-2xl font-semibold tabular-nums">{fmt(totalMonthly)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                + {bufPct}% Puffer · + {savPct}% Sparen · {taxPct}% Steuer
              </p>
            </div>
          </div>
        </div>

        {/* Kompositions-Leiste: zeigt, woraus sich das Netto-Minimum zusammensetzt */}
        <div className="space-y-1.5">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {composition.map(seg => (
              <div
                key={seg.label}
                style={{ width: `${(seg.value / netMin) * 100}%`, background: seg.color }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {composition.map(seg => (
              <span key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full shrink-0" style={{ background: seg.color }} />
                {seg.label} · {fmt(seg.value)}
              </span>
            ))}
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
            {rows.map(({ cat, actual, budget, delta, pct, over }) => (
              <div
                key={cat.id}
                className="card-hover flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
                  {cat.icon ?? '📦'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate">{cat.name}</span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{fmt(actual)}</span>
                  </div>
                  {pct != null ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: over ? 'var(--chart-expense)' : 'var(--chart-income)',
                          }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                        Ziel {fmt(budget!)}
                      </span>
                      <span
                        className="text-xs font-semibold tabular-nums shrink-0 w-20 text-right"
                        style={{ color: over ? 'var(--chart-expense)' : 'var(--chart-income)' }}
                      >
                        {delta! > 0 ? '+' : ''}{fmt(delta!)}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">kein Budget-Ziel</p>
                  )}
                </div>
              </div>
            ))}

            {/* Total row */}
            <div className="flex items-center gap-3 rounded-lg border border-(--chart-accent)/25 bg-(--chart-accent)/8 px-4 py-3 font-semibold">
              <span className="size-9 shrink-0" />
              <span className="flex-1 text-sm">Gesamt</span>
              <span className="text-sm tabular-nums">{fmt(totalMonthly)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
