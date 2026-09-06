import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import {
  AddCategoryDialog,
  EditCategoryDialog,
  DeleteCategoryButton,
} from '@/components/finance/category-form'
import { getSettings } from '@/lib/settings'
import { fmtCurrency } from '@/lib/format'

type Category = Database['public']['Tables']['categories']['Row']
type EuerZeile = Database['public']['Tables']['euer_zeilen']['Row']
type CategoryNode = Category & { children: CategoryNode[] }

// Build parent→child tree from flat list
function buildTree(categories: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  for (const c of categories) map.set(c.id, { ...c, children: [] })

  const roots: CategoryNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort each level by sort_order then name
  const sort = (nodes: CategoryNode[]) =>
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  for (const node of map.values()) sort(node.children)
  return sort(roots)
}

const TYPE_CONFIG: Record<string, { label: string; classes: string }> = {
  expense: {
    label: 'Ausgabe',
    classes: 'bg-danger/10 text-danger',
  },
  income: {
    label: 'Einnahme',
    classes: 'bg-success/10 text-success',
  },
  neutral: {
    label: 'Neutral',
    classes: 'bg-muted text-muted-foreground',
  },
}

export default async function CategoriesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: categories }, settings, { data: euerRows }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('user_id', user!.id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    getSettings(user!.id),
    // Die Zeilen der Anlage EUER, damit die Zuordnung im Formular eine Auswahl
    // ist und keine Nummer, die man irgendwo nachschlagen muss. Nur Zeilen, in
    // die Buchungen fliessen -- Summen- und Ergebniszeilen rechnet die App.
    supabase
      .from('euer_zeilen')
      .select('*')
      .in('art', ['einnahme', 'ausgabe'])
      .order('jahr', { ascending: false })
      .order('zeile', { ascending: true }),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const flat = categories ?? []
  // Nur der jüngste hinterlegte Jahrgang — zwei Jahrgänge nebeneinander wären
  // im Auswahlfeld nicht unterscheidbar.
  const alleEuer = (euerRows ?? []) as EuerZeile[]
  const euerJahr = alleEuer[0]?.jahr ?? null
  const euerZeilen = euerJahr === null ? [] : alleEuer.filter((z) => z.jahr === euerJahr)
  const tree = buildTree(flat)

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kategorien</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {flat.length} Kategorien verwalten
          </p>
        </div>
        <AddCategoryDialog allCategories={flat} euerZeilen={euerZeilen} />
      </div>

      {/* Tree */}
      {tree.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Typ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Budget/Monat</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground w-20">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tree.map((parent) => (
                <React.Fragment key={parent.id}>
                  {/* Parent row */}
                  <CategoryRow
                    category={parent}
                    allCategories={flat}
                    euerZeilen={euerZeilen}
                    isParent
                    locale={locale}
                  />
                  {/* Child rows */}
                  {parent.children.map((child) => (
                    <CategoryRow
                      key={child.id}
                      category={child}
                      allCategories={flat}
                      euerZeilen={euerZeilen}
                      isParent={false}
                      locale={locale}
                    />
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CategoryRow({
  category,
  allCategories,
  euerZeilen,
  isParent,
  locale,
}: {
  category: CategoryNode
  allCategories: Category[]
  euerZeilen: EuerZeile[]
  isParent: boolean
  locale: string
}) {
  const typeCfg =
    TYPE_CONFIG[category.type] ?? { label: category.type, classes: 'bg-muted text-muted-foreground' }

  return (
    <tr className="hover:bg-muted/30 transition-colors group">
      {/* Name */}
      <td className="px-4 py-3">
        <div className={isParent ? 'flex items-center gap-2.5' : 'flex items-center gap-2.5 pl-6'}>
          {/* Indent indicator for children */}
          {!isParent && (
            <span className="text-muted-foreground/40 select-none">↳</span>
          )}

          {/* Color dot */}
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{ backgroundColor: category.color ?? '#94a3b8' }}
          />

          {/* Icon + name */}
          <span className={isParent ? 'font-medium text-foreground' : 'text-foreground'}>
            {category.icon && (
              <span className="mr-1.5">{category.icon}</span>
            )}
            {category.name}
          </span>

          {/* Child count badge */}
          {isParent && (category as CategoryNode).children.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({(category as CategoryNode).children.length})
            </span>
          )}
        </div>
      </td>

      {/* Typ */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeCfg.classes}`}
        >
          {typeCfg.label}
        </span>
      </td>

      {/* Budget */}
      <td className="px-4 py-3 text-muted-foreground tabular-nums">
        {category.budget_monthly != null
          ? fmtCurrency(category.budget_monthly, 'EUR', locale)
          : '—'}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <EditCategoryDialog category={category} allCategories={allCategories} euerZeilen={euerZeilen} />
          <DeleteCategoryButton category={category} />
        </div>
      </td>
    </tr>
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
