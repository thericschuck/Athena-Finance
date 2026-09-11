'use client'

import { useEffect, useState } from 'react'
import { ArrowLeftRight, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtCurrency, fmtDate } from '@/lib/format'
import { SkeletonTable } from '@/components/ui/skeleton'
import { useSettings } from '@/components/providers/settings-context'
import type { BankTransaction, FinanceCategory } from '@/types/bank'

const NO_CATEGORY = '__none__'

interface Props {
  transactions:     BankTransaction[]
  categories:       FinanceCategory[]
  isLoading:        boolean
  /** Mindestens eine Antwort ist da — erst dann darf der Leerzustand gezeigt werden. */
  hasLoaded:        boolean
  onFilter:         (params: { q?: string; categoryId?: string }) => void
  onUpdateCategory: (id: string, categoryId: string | null) => void
  /**
   * Erkennt Umbuchungen zwischen Erics eigenen Konten (Gegen-IBAN = eigene bank_iban) —
   * dieselbe Regel, mit der `unified_transactions` sie aus den Auswertungen herausrechnet
   * (siehe [[flow_kind_regel]]). Hier nur zur Anzeige: die Zeile bleibt in der Liste und
   * bleibt kategorisierbar, sie wird nur nicht mehr als Einnahme/Ausgabe eingefärbt.
   */
  isInternalTransfer?: (tx: BankTransaction) => boolean
}

function categoryLabel(c: FinanceCategory): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

/** Wie viele Zeilen zunaechst gerendert werden, bevor „Mehr laden“ noetig ist. */
const PAGE = 60

/**
 * Kategorie-Zelle, die ihre Auswahlliste erst beim Anklicken aufbaut.
 *
 * Vorher hing in JEDER Zeile eine fertige Radix-Select. Bei 609 Buchungen und 19
 * Kategorien waren das 609 Select-Instanzen mit gut 12.000 Eintraegen — und Radix ist
 * kein natives <select>, sondern richtet pro Instanz Context, Portal, Fokusverwaltung und
 * eine Collection ein. Genau daran hing die Seite beim Laden.
 *
 * Jetzt steht dort ein einfacher Button; die Select entsteht erst, wenn man ihn benutzt,
 * und verschwindet danach wieder. Statt 609 gleichzeitig existiert nie mehr als eine.
 */
function CategoryCell({
  tx, current, categories, onUpdateCategory,
}: {
  tx: BankTransaction
  current: FinanceCategory | undefined
  categories: FinanceCategory[]
  onUpdateCategory: (id: string, categoryId: string | null) => void
}) {
  const [editing, setEditing] = useState(false)

  const chipStyle = current?.color
    ? { backgroundColor: `${current.color}1a`, color: current.color }
    : undefined

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Kategorie ändern"
        className={`inline-flex h-7 max-w-[160px] items-center gap-1 truncate rounded-full px-2.5 text-xs transition-colors ${
          current ? '' : 'text-muted-foreground hover:bg-muted'
        }`}
        style={chipStyle}
      >
        <span className="truncate">{current ? categoryLabel(current) : 'Kategorisieren…'}</span>
      </button>
    )
  }

  return (
    <Select
      defaultOpen
      value={tx.category_id ?? NO_CATEGORY}
      onValueChange={v => {
        onUpdateCategory(tx.id, v === NO_CATEGORY ? null : v)
        setEditing(false)
      }}
      // Schliesst der Nutzer ohne Auswahl, faellt die Zelle auf den Button zurueck —
      // sonst bliebe die Select fuer den Rest der Sitzung gemountet.
      onOpenChange={open => { if (!open) setEditing(false) }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Kategorie ändern"
        className="h-7 max-w-[160px] rounded-full border-none px-2.5 text-xs shadow-none"
        style={chipStyle}
      >
        <SelectValue placeholder="Kategorisieren…">
          {current ? categoryLabel(current) : 'Kategorisieren…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_CATEGORY}>Ohne Kategorie</SelectItem>
        {categories.map(c => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2">
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: c.color ?? '#94a3b8' }}
              />
              {categoryLabel(c)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function BankTransactionsView({ transactions, categories, isLoading, hasLoaded, onFilter, onUpdateCategory, isInternalTransfer }: Props) {
  const { locale, dateFormat } = useSettings()
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 2 })

  const [search,     setSearch]     = useState('')
  const [categoryId, setCategoryId] = useState('')
  // Nicht alle Buchungen auf einmal ins DOM: 609 Zeilen mit je fuenf Zellen sind rund
  // 3.000 Elemente, die der Browser bei jedem Rendern anfassen muss.
  const [visible, setVisible] = useState(PAGE)

  const categoriesById = new Map(categories.map(c => [c.id, c]))
  const shown = transactions.slice(0, visible)
  const rest  = transactions.length - shown.length

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onFilter({ q: search || undefined, categoryId: categoryId || undefined })
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId])

  // Nach einem Filterwechsel wieder oben anfangen — sonst zeigt eine Suche mit drei
  // Treffern immer noch „300 von 609“ aus dem vorherigen Zustand.
  useEffect(() => { setVisible(PAGE) }, [search, categoryId, transactions.length])

  // ── Empty / loading states ──────────────────────────────────────────────────
  // Die Filterleiste steht in allen drei Zuständen an derselben Stelle und wird nie
  // ausgehängt. Vorher ersetzte der Ladezustand die komplette Ansicht: 300 ms nach dem
  // ersten Tastendruck verschwand das Suchfeld samt Fokus, und man tippte ins Leere.
  const filterBar = (
    <FilterBar
      search={search} setSearch={setSearch}
      categoryId={categoryId} setCategoryId={setCategoryId}
      categories={categories}
    />
  )

  if (isLoading || !hasLoaded) {
    return (
      <div className="space-y-4">
        {filterBar}
        <SkeletonTable rows={8} cols={[72, 120, 200, 120, 80]} />
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-4">
        {filterBar}
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm font-medium">Keine Transaktionen</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Synchronisiere dein Konto, um Transaktionen zu laden.
          </p>
        </div>
      </div>
    )
  }

  // ── Transaction table ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {filterBar}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium whitespace-nowrap">Datum</th>
                <th className="px-4 py-2.5 font-medium">Empfänger / Auftraggeber</th>
                <th className="px-4 py-2.5 font-medium">Beschreibung</th>
                <th className="px-4 py-2.5 font-medium">Kategorie</th>
                <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tx, i) => {
                const isCredit  = tx.amount >= 0
                const isLast    = i === shown.length - 1
                const current   = tx.category_id ? categoriesById.get(tx.category_id) : undefined
                const isTransfer = isInternalTransfer?.(tx) ?? false

                return (
                  <tr
                    key={tx.id}
                    className={`hover:bg-muted/30 transition-colors ${!isLast ? 'border-b border-border' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {fmtDate(tx.value_date, dateFormat)}
                    </td>
                    <td className="px-4 py-2.5 max-w-[160px]">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-xs">
                          {tx.counterpart_name ?? '—'}
                        </span>
                        {isTransfer && (
                          <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            Umbuchung
                          </span>
                        )}
                      </span>
                      {tx.counterpart_iban && (
                        <span className="text-xs text-muted-foreground font-mono truncate block">
                          {tx.counterpart_iban}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {tx.description ?? tx.raw_description ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <CategoryCell
                        tx={tx}
                        current={current}
                        categories={categories}
                        onUpdateCategory={onUpdateCategory}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className={`flex items-center justify-end gap-1 font-medium ${
                        isTransfer
                          ? 'text-muted-foreground'
                          : isCredit ? 'text-success' : 'text-danger'
                      }`}>
                        {isTransfer
                          ? <ArrowLeftRight className="size-3.5 shrink-0" />
                          : isCredit
                            ? <TrendingUp  className="size-3.5 shrink-0" />
                            : <TrendingDown className="size-3.5 shrink-0" />
                        }
                        {isCredit ? '+' : ''}{fmtEur(tx.amount)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {rest > 0 ? (
          <button
            type="button"
            onClick={() => setVisible(v => v + PAGE)}
            className="h-8 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            Weitere {Math.min(rest, PAGE)} laden
          </button>
        ) : <span />}
        <p className="text-xs text-muted-foreground">
          {rest > 0
            ? `${shown.length} von ${transactions.length} Transaktionen`
            : `${transactions.length} Transaktionen`}
        </p>
      </div>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
function FilterBar({
  search, setSearch,
  categoryId, setCategoryId,
  categories,
}: {
  search: string; setSearch: (v: string) => void
  categoryId: string; setCategoryId: (v: string) => void
  categories: FinanceCategory[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {categories.length > 0 && (
        <Select value={categoryId || '__all__'} onValueChange={v => setCategoryId(v === '__all__' ? '' : v)}>
          <SelectTrigger size="sm" aria-label="Nach Kategorie filtern" className="h-8 text-sm">
            <SelectValue placeholder="Alle Kategorien" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Alle Kategorien</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color ?? '#94a3b8' }}
                  />
                  {categoryLabel(c)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
