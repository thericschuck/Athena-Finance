'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AddCategoryDialog,
  EditCategoryDialog,
  DeleteCategoryButton,
} from '@/components/finance/category-form'
import { effektiveRollen } from '@/lib/tax/rollen'
import { fmtCurrency } from '@/lib/format'
import type { CategoryRow, EuerZeileRow } from '@/lib/data/finance-transactions'

type Category = CategoryRow
type EuerZeile = EuerZeileRow
export type CategoryNode = Category & { children: CategoryNode[] }

const TYPE_CONFIG: Record<string, { label: string; classes: string }> = {
  expense: { label: 'Ausgabe', classes: 'bg-danger/10 text-danger' },
  income: { label: 'Einnahme', classes: 'bg-success/10 text-success' },
  neutral: { label: 'Neutral', classes: 'bg-muted text-muted-foreground' },
}

/**
 * Nur die vier tatsächlich vergebenen Rollen bekommen ein Badge -- "nicht
 * zugeordnet" ist der Normalfall und würde als Badge nur Rauschen erzeugen.
 * Business-Rollen (Einnahme/Ausgabe/Lohn) teilen sich eine Farbe, damit man
 * "hat eine steuerliche Business-Rolle" auf einen Blick von "Privat"
 * unterscheiden kann, ohne die Legende um drei weitere Farben zu erweitern.
 */
const ROLE_BADGE: Record<string, { label: string; classes: string }> = {
  betriebseinnahme: { label: 'Betriebseinnahme', classes: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  betriebsausgabe: { label: 'Betriebsausgabe', classes: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  lohn: { label: 'Lohn', classes: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  privat: { label: 'Privat', classes: 'bg-muted text-muted-foreground' },
}

const ROLE_GROUPS: { key: string; label: string }[] = [
  { key: 'betriebseinnahme', label: 'Betriebseinnahme' },
  { key: 'betriebsausgabe', label: 'Betriebsausgabe' },
  { key: 'lohn', label: 'Lohn' },
  { key: 'privat', label: 'Privat' },
  { key: '__none__', label: 'Nicht zugeordnet' },
]

type ViewMode = 'hierarchy' | 'tax_role'

function IconChip({ color, icon }: { color: string | null; icon: string | null }) {
  const bg = color ?? '#94a3b8'
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm"
      style={{ backgroundColor: `${bg}22` }}
    >
      {icon ? icon : <span className="size-2 rounded-full" style={{ backgroundColor: bg }} />}
    </span>
  )
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null
  const cfg = ROLE_BADGE[role]
  if (!cfg) return null
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, classes: 'bg-muted text-muted-foreground' }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

function CategoryRow({
  category,
  allCategories,
  euerZeilen,
  locale,
  role,
  parentName,
}: {
  category: Category
  allCategories: Category[]
  euerZeilen: EuerZeile[]
  locale: string
  role: string | null
  /** Nur in der Steuerrollen-Ansicht gesetzt -- ohne Baum fehlt sonst der Kontext, wo die Kategorie hängt. */
  parentName?: string | null
}) {
  return (
    <div className="group flex items-center gap-2.5 px-4 py-2.5 pl-11 hover:bg-muted/30 transition-colors">
      <IconChip color={category.color} icon={category.icon} />
      <span className="flex-1 min-w-0 text-sm text-foreground truncate">
        {category.name}
        {parentName && <span className="ml-1.5 text-xs text-muted-foreground">· {parentName}</span>}
      </span>
      <TypeBadge type={category.type} />
      <RoleBadge role={role} />
      <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {category.budget_monthly != null ? fmtCurrency(category.budget_monthly, 'EUR', locale) : '—'}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <EditCategoryDialog category={category} allCategories={allCategories} euerZeilen={euerZeilen} />
        <DeleteCategoryButton category={category} />
      </div>
    </div>
  )
}

function CategoryGroup({
  parent,
  items,
  allCategories,
  euerZeilen,
  locale,
  roleById,
}: {
  parent: CategoryNode
  items: CategoryNode[]
  allCategories: Category[]
  euerZeilen: EuerZeile[]
  locale: string
  roleById: Map<string, string | null>
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group flex items-center gap-1 pr-2 hover:bg-muted/30 transition-colors">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2.5 px-4 py-3 text-left min-w-0">
            <ChevronRight
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <IconChip color={parent.color} icon={parent.icon} />
            <span className="font-medium text-foreground truncate">{parent.name}</span>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">({items.length})</span>
            )}
            <RoleBadge role={roleById.get(parent.id) ?? null} />
          </CollapsibleTrigger>
          <TypeBadge type={parent.type} />
          <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
            {parent.budget_monthly != null ? fmtCurrency(parent.budget_monthly, 'EUR', locale) : '—'}
          </span>
          <AddCategoryDialog
            allCategories={allCategories}
            euerZeilen={euerZeilen}
            defaultParentId={parent.id}
            trigger={
              <Button variant="ghost" size="icon-sm" title="Unterkategorie anlegen">
                <Plus className="size-3.5" />
              </Button>
            }
          />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <EditCategoryDialog category={parent} allCategories={allCategories} euerZeilen={euerZeilen} />
            <DeleteCategoryButton category={parent} />
          </div>
        </div>
        <CollapsibleContent>
          <div className="divide-y divide-border border-t border-border">
            {items.length === 0 ? (
              <p className="px-4 py-3 pl-11 text-xs text-muted-foreground">
                Noch keine Unterkategorien
              </p>
            ) : (
              items.map((child) => (
                <CategoryRow
                  key={child.id}
                  category={child}
                  allCategories={allCategories}
                  euerZeilen={euerZeilen}
                  locale={locale}
                  role={roleById.get(child.id) ?? null}
                />
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function RoleGroup({
  label,
  items,
  allCategories,
  euerZeilen,
  locale,
  roleById,
}: {
  label: string
  items: Category[]
  allCategories: Category[]
  euerZeilen: EuerZeile[]
  locale: string
  roleById: Map<string, string | null>
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40">
        <span className="font-medium text-foreground">{label}</span>
        <span className="ml-2 text-xs text-muted-foreground">({items.length})</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            allCategories={allCategories}
            euerZeilen={euerZeilen}
            locale={locale}
            role={roleById.get(c.id) ?? null}
            parentName={allCategories.find((p) => p.id === c.parent_id)?.name ?? null}
          />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <p className="text-sm font-medium text-foreground">Noch keine Kategorien</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Lege deine erste Kategorie an, um Transaktionen zu organisieren.
      </p>
    </div>
  )
}

export function CategoriesView({
  tree,
  flat,
  euerZeilen,
  locale,
}: {
  tree: CategoryNode[]
  flat: Category[]
  euerZeilen: EuerZeile[]
  locale: string
}) {
  const [mode, setMode] = useState<ViewMode>('hierarchy')
  const roleById = useMemo(() => effektiveRollen(flat), [flat])

  const roleGroups = useMemo(() => {
    if (mode !== 'tax_role') return []
    const byKey = new Map<string, Category[]>(ROLE_GROUPS.map((g) => [g.key, []]))
    for (const c of flat) {
      const key = roleById.get(c.id) ?? '__none__'
      byKey.get(key)?.push(c)
    }
    return ROLE_GROUPS.map((g) => ({ ...g, items: byKey.get(g.key) ?? [] })).filter(
      (g) => g.items.length > 0,
    )
  }, [mode, flat, roleById])

  if (flat.length === 0) return <EmptyState />

  return (
    <div className="space-y-4">
      {/* Gruppieren nach */}
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        {(
          [
            ['hierarchy', 'Hauptkategorie'],
            ['tax_role', 'Steuerliche Rolle'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'hierarchy' ? (
        <div className="space-y-3">
          {tree.map((parent) => (
            <CategoryGroup
              key={parent.id}
              parent={parent}
              items={parent.children}
              allCategories={flat}
              euerZeilen={euerZeilen}
              locale={locale}
              roleById={roleById}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {roleGroups.map((g) => (
            <RoleGroup
              key={g.key}
              label={g.label}
              items={g.items}
              allCategories={flat}
              euerZeilen={euerZeilen}
              locale={locale}
              roleById={roleById}
            />
          ))}
        </div>
      )}
    </div>
  )
}
