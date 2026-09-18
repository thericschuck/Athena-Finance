import { getAuthUser } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { AddCategoryDialog } from '@/components/finance/category-form'
import { CategoriesView, type CategoryNode } from '@/components/finance/categories-view'
import { getSettings } from '@/lib/settings'

type Category = Database['public']['Tables']['categories']['Row']
type EuerZeile = Database['public']['Tables']['euer_zeilen']['Row']

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

export default async function CategoriesPage() {
  const { supabase, user } = await getAuthUser()

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

      <CategoriesView tree={tree} flat={flat} euerZeilen={euerZeilen} locale={locale} />
    </div>
  )
}
