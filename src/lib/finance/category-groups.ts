export interface CategoryForGrouping {
  id: string
  name: string
  parent_id: string | null
}

export interface CategoryGroup<T> {
  parent: T
  children: T[]
}

/**
 * Gruppiert eine flache Kategorienliste nach Hauptkategorie, alphabetisch sortiert -- für
 * Dropdowns, die sonst 30+ Kategorien in beliebiger DB-Reihenfolge (meist `sort_order = 0`
 * für alle) nebeneinander zeigen und dadurch unübersichtlich werden.
 */
export function groupCategoriesByParent<T extends CategoryForGrouping>(
  categories: T[],
): CategoryGroup<T>[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const childrenByParent = new Map<string, T[]>()
  const roots: T[] = []

  for (const c of categories) {
    if (c.parent_id && byId.has(c.parent_id)) {
      const list = childrenByParent.get(c.parent_id) ?? []
      list.push(c)
      childrenByParent.set(c.parent_id, list)
    } else {
      roots.push(c)
    }
  }

  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  return roots.sort(byName).map((parent) => ({
    parent,
    children: (childrenByParent.get(parent.id) ?? []).sort(byName),
  }))
}
