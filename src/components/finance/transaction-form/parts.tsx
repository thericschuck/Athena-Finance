import { SelectGroup, SelectItem, SelectSeparator } from '@/components/ui/select'
import { groupCategoriesByParent } from '@/lib/finance/category-groups'
import type { Database } from '@/types/database'
import type { DebtRow } from '@/lib/data/finance-planning'

export type Account = Pick<
  Database['public']['Tables']['accounts']['Row'],
  'id' | 'name' | 'color' | 'currency'
>
export type Category = Pick<
  Database['public']['Tables']['categories']['Row'],
  'id' | 'name' | 'color' | 'icon' | 'parent_id'
>
export type TxRow = Database['public']['Tables']['transactions']['Row']
export type Debt = DebtRow

export const NO_CATEGORY = '__none__'

export function categoryLabel(c: Category): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

/** Farbpunkt; ohne gewählte Farbe der Theme-Ton statt eines festen Hex-Werts. */
export function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
    />
  )
}

/**
 * Kategorien-Optionen nach Hauptkategorie gruppiert statt flach -- bei 30+ Kategorien war die
 * Reihenfolge sonst praktisch zufällig (fast alle haben `sort_order = 0`). Die Hauptkategorie
 * bleibt selbst wählbar (manche Buchungen hängen direkt an ihr, ohne Unterkategorie), ihre
 * Kinder folgen darunter eingerückt.
 */
export function CategorySelectOptions({ categories }: { categories: Category[] }) {
  const groups = groupCategoriesByParent(categories)
  return (
    <>
      {groups.map(({ parent, children }, i) => (
        <SelectGroup key={parent.id}>
          {i > 0 && <SelectSeparator />}
          <SelectItem value={parent.id}>
            <span className="flex items-center gap-2">
              <ColorDot color={parent.color} />
              {categoryLabel(parent)}
            </span>
          </SelectItem>
          {children.map((c) => (
            <SelectItem key={c.id} value={c.id} className="pl-6">
              <span className="flex items-center gap-2">
                <ColorDot color={c.color} />
                {categoryLabel(c)}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  )
}

export const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'BTC', 'ETH']

export function currencyForAccount(accountId: string | undefined, accounts: Account[]): string {
  const acc = accountId ? accounts.find((a) => a.id === accountId) : undefined
  return acc?.currency ?? 'EUR'
}
