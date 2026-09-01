'use client'

import { useState, useActionState } from 'react'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createCategory, updateCategory, deleteCategory,
  createItem,     updateItem,     deleteItem,
} from '@/app/(dashboard)/finance/budget/actions'
import type { BudgetCategory, BudgetItem } from '@/app/(dashboard)/finance/budget/page'

function monthlyItem(item: BudgetItem): number {
  return (item.unit_price * item.quantity) / item.interval_days * 30
}

function fmt(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Inline number input ────────────────────────────────────────────────────────
function Inp({ name, placeholder, defaultValue, step, required, className }: {
  name: string; placeholder?: string; defaultValue?: string | number
  step?: string; required?: boolean; className?: string
}) {
  return (
    <input
      name={name}
      placeholder={placeholder}
      defaultValue={defaultValue}
      step={step}
      required={required}
      className={cn(
        'h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring',
        className
      )}
    />
  )
}

// ── Add/Edit Item inline row ───────────────────────────────────────────────────
function ItemForm({
  categoryId,
  item,
  onDone,
}: {
  categoryId: string
  item?: BudgetItem
  onDone: () => void
}) {
  const action = item ? updateItem : createItem
  const [state, dispatch, pending] = useActionState(action, null)

  return (
    <form
      action={async (fd) => {
        await dispatch(fd)
        if (!('error' in (state ?? {}))) onDone()
      }}
      className="flex flex-wrap items-center gap-2 py-2 px-3 bg-muted/40 rounded-lg"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="category_id" value={categoryId} />
      <Inp name="name"          placeholder="Produkt"     defaultValue={item?.name}          className="w-36" required />
      <Inp name="unit_price"    placeholder="Preis €"     defaultValue={item?.unit_price}    step="0.01" className="w-24" required />
      <Inp name="quantity"      placeholder="Menge"       defaultValue={item?.quantity ?? 1} step="0.001" className="w-20" />
      <Inp name="interval_days" placeholder="Tage"        defaultValue={item?.interval_days}  className="w-16" required />
      <Inp name="notes"         placeholder="Notiz"       defaultValue={item?.notes ?? ''}   className="w-36" />
      {'error' in (state ?? {}) && (
        <span className="text-xs text-destructive w-full">{(state as {error:string}).error}</span>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-label="Speichern"
        className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        <Check className="size-4" />
      </button>
      <button type="button" onClick={onDone} aria-label="Abbrechen" className="h-8 px-2 rounded-md text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </form>
  )
}

// ── Single item row ────────────────────────────────────────────────────────────
function ItemRow({ item, onEdit }: { item: BudgetItem; onEdit: () => void }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteItem(item.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <tr className="group border-b border-border last:border-0">
      <td className="py-2 px-3 text-sm">{item.name}</td>
      <td className="py-2 px-3 text-sm tabular-nums text-right">{fmt(item.unit_price)}</td>
      <td className="py-2 px-3 text-sm tabular-nums text-right">{item.quantity}</td>
      <td className="py-2 px-3 text-sm tabular-nums text-right">{item.interval_days}d</td>
      <td className="py-2 px-3 text-sm tabular-nums text-right font-medium">{fmt(monthlyItem(item))}</td>
      <td className="py-2 px-3 text-xs text-muted-foreground max-w-32 truncate">{item.notes ?? ''}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            aria-label="Produkt bearbeiten"
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Produkt löschen"
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Category card ──────────────────────────────────────────────────────────────
function CategoryCard({
  category,
  items,
}: {
  category: BudgetCategory
  items: BudgetItem[]
}) {
  const [open,        setOpen]       = useState(false)
  const [addingItem,  setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingCat,  setEditingCat] = useState(false)
  const [deletingCat, setDeletingCat] = useState(false)

  const [catState, catDispatch, catPending] = useActionState(updateCategory, null)

  const total = items.reduce((s, i) => s + monthlyItem(i), 0)
  const budget = category.monthly_budget
  const delta = budget != null ? total - budget : null

  async function handleDeleteCat() {
    if (!confirm(`Kategorie "${category.name}" und alle Produkte löschen?`)) return
    setDeletingCat(true)
    await deleteCategory(category.id)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      {editingCat ? (
        <form
          action={async (fd) => {
            await catDispatch(fd)
            setEditingCat(false)
          }}
          className="flex flex-wrap items-center gap-2 p-3 bg-muted/40"
        >
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="sort_order" value={category.sort_order} />
          <Inp name="icon"           defaultValue={category.icon ?? ''}           placeholder="Icon" className="w-12" />
          <Inp name="name"           defaultValue={category.name}                 placeholder="Name" className="w-36" required />
          <Inp name="monthly_budget" defaultValue={category.monthly_budget ?? ''} placeholder="Ziel € (opt.)" step="0.01" className="w-28" />
          {'error' in (catState ?? {}) && (
            <span className="text-xs text-destructive w-full">{(catState as {error:string}).error}</span>
          )}
          <button type="submit" disabled={catPending} aria-label="Speichern" className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm">
            <Check className="size-4" />
          </button>
          <button type="button" onClick={() => setEditingCat(false)} aria-label="Abbrechen" className="h-8 px-2 rounded-md text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </form>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
          onClick={() => setOpen(o => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setOpen(o => !o)
            }
          }}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-base">
            {category.icon ?? '📦'}
          </span>
          <span className="flex-1 font-medium text-sm">{category.name}</span>
          <span className="flex items-center gap-2 mr-2">
            <span className="text-sm font-semibold tabular-nums">{fmt(total)}</span>
            {budget != null && (
              <span
                className="text-xs tabular-nums"
                style={{ color: delta! > 0 ? 'var(--chart-expense)' : 'var(--chart-income)' }}
              >
                Ziel: {fmt(budget)} ({delta! > 0 ? '+' : ''}{fmt(delta!)})
              </span>
            )}
          </span>
          <div
            className="flex items-center gap-1"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setEditingCat(true)}
              aria-label="Kategorie bearbeiten"
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={handleDeleteCat}
              disabled={deletingCat}
              aria-label="Kategorie löschen"
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          {open ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
        </div>
      )}

      {/* Items */}
      {open && (
        <div className="border-t border-border">
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Produkt</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Preis</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Menge</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">Intervall</th>
                    <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground">/ Monat</th>
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Notiz</th>
                    <th className="py-2 px-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item =>
                    editingItem === item.id ? (
                      <tr key={item.id}>
                        <td colSpan={7} className="p-2">
                          <ItemForm
                            categoryId={category.id}
                            item={item}
                            onDone={() => setEditingItem(null)}
                          />
                        </td>
                      </tr>
                    ) : (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => setEditingItem(item.id)}
                      />
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Add item row */}
          <div className="p-3">
            {addingItem ? (
              <ItemForm
                categoryId={category.id}
                onDone={() => setAddingItem(false)}
              />
            ) : (
              <button
                onClick={() => setAddingItem(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="size-4" />
                Produkt hinzufügen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Category form ──────────────────────────────────────────────────────────
function AddCategoryForm({ onDone }: { onDone: () => void }) {
  const [state, dispatch, pending] = useActionState(createCategory, null)

  return (
    <form
      action={async (fd) => {
        await dispatch(fd)
        if (!('error' in (state ?? {}))) onDone()
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <Inp name="icon"           placeholder="Icon (Emoji)" className="w-20" />
      <Inp name="name"           placeholder="Kategoriename"  className="w-40" required />
      <Inp name="monthly_budget" placeholder="Budget-Ziel (opt.)" step="0.01" className="w-36" />
      {'error' in (state ?? {}) && (
        <span className="text-xs text-destructive w-full">{(state as {error:string}).error}</span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        Kategorie anlegen
      </button>
      <button type="button" onClick={onDone} className="h-8 px-2 rounded-md text-muted-foreground hover:text-foreground text-sm">
        Abbrechen
      </button>
    </form>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────────
export function KategorienTab({ categories, items }: { categories: BudgetCategory[]; items: BudgetItem[] }) {
  const [addingCat, setAddingCat] = useState(false)

  const itemsByCategory = (catId: string) => items.filter(i => i.category_id === catId)

  return (
    <div className="space-y-3">
      {categories.map(cat => (
        <div key={cat.id} className="group">
          <CategoryCard category={cat} items={itemsByCategory(cat.id)} />
        </div>
      ))}

      {addingCat ? (
        <AddCategoryForm onDone={() => setAddingCat(false)} />
      ) : (
        <button
          onClick={() => setAddingCat(true)}
          className="flex items-center gap-2 w-full rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        >
          <Plus className="size-4" />
          Neue Kategorie
        </button>
      )}
    </div>
  )
}
