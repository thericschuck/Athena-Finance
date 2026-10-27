'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { BudgetCategory, BudgetItem, IncomeTarget } from '@/app/(dashboard)/finance/budget/page'
import { OverviewTab } from './OverviewTab'
import { KategorienTab } from './KategorienTab'
import { EinstellungenTab } from './EinstellungenTab'

type Tab = 'übersicht' | 'kategorien' | 'einstellungen'

const TABS: { id: Tab; label: string }[] = [
  { id: 'übersicht',     label: 'Übersicht' },
  { id: 'kategorien',    label: 'Kategorien & Produkte' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

interface Props {
  categories: BudgetCategory[]
  items:      BudgetItem[]
  target:     IncomeTarget | null
}

export function LebenshaltungskostenClient({ categories, items, target }: Props) {
  const [tab, setTab] = useState<Tab>('übersicht')

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Lebenshaltungskosten, Produktverbrauch und Mindestgehalt-Kalkulation
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'übersicht'     && <OverviewTab     categories={categories} items={items} target={target} onZuProdukten={() => setTab('kategorien')} />}
      {tab === 'kategorien'    && <KategorienTab   categories={categories} items={items} />}
      {tab === 'einstellungen' && <EinstellungenTab target={target} />}
    </div>
  )
}
