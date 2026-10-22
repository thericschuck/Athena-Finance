'use client'

import { Fragment, useMemo, useState } from 'react'
import { Wand2, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { lernSchluessel } from '@/lib/fints/categorize'
import type { CategorySuggestion, FinanceCategory, SuggestCategoriesResponse } from '@/types/bank'

interface Props {
  categories: FinanceCategory[]
  /** Apply one accepted suggestion — pass useBankData's updateCategory (already optimistic). */
  onAccept: (id: string, categoryId: string) => Promise<void>
}

/** `neu` = bisher ohne Kategorie. `aenderung` = es steht schon eine drin. */
type GroupKind = 'neu' | 'aenderung'

interface Group {
  key: string
  label: string
  items: CategorySuggestion[]
  kind: GroupKind
}

function categoryLabel(c: { icon: string | null; name: string }): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

// Groups by the same normalized-counterparty key the learned-category map uses — "Rewe Markt"
// showing up 15 times is the same recurring expense, not 15 separate decisions. A suggestion
// without a counterparty name (rare) just gets its own single-item group.
//
// `kind` steckt im Schlüssel, weil derselbe Empfänger in beiden Listen auftauchen kann (eine
// alte Buchung kategorisiert, eine neue nicht) — ohne Präfix träfen sich beide im `chosen`-
// State und würden sich gegenseitig überschreiben.
function groupSuggestions(suggestions: CategorySuggestion[], kind: GroupKind): Group[] {
  const groups = new Map<string, Group>()
  for (const s of suggestions) {
    // Händler aus dem Verwendungszweck bei PayPal/Karte (siehe merchant-key.ts), sonst die Gegenpartei.
    const base = lernSchluessel(s.counterpart_name, s.description) ?? `__single__${s.id}`
    const key = `${kind}:${base}`
    const existing = groups.get(key)
    const haendler = base.startsWith('h:') ? base.slice(2) : null
    const label = haendler
      ? (s.counterpart_name ? `${s.counterpart_name} · ${haendler}` : haendler)
      : (s.counterpart_name ?? s.description ?? '—')
    if (existing) existing.items.push(s)
    else groups.set(key, { key, label, items: [s], kind })
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length)
}

/**
 * Trennt Erstkategorisierung von Umkategorisierung.
 *
 * Die API liefert beides in einer Liste: Buchungen ohne Kategorie UND solche, bei denen der
 * Vorschlag von der gesetzten Kategorie abweicht. Letzteres entsteht dadurch, dass
 * `buildLearnedCategoryMap` pro Empfänger die HÄUFIGSTE Kategorie gewinnen lässt — wer
 * PayPal-Buchungen bewusst mal auf „Shopping" und mal auf „Freizeit" legt, bekommt für die
 * Minderheit dauerhaft einen Änderungsvorschlag.
 *
 * Vermischt in einer Liste mit einem „Alle übernehmen"-Knopf ist das gefährlich: ein Klick
 * hätte hier 64 bereits richtig zugeordnete Buchungen per Mehrheitsentscheid umgeschrieben.
 * Deshalb zwei Abschnitte, und der Sammelknopf fasst nur die unkategorisierten an.
 */
function buildGroups(list: CategorySuggestion[]): { neue: Group[]; aenderungen: Group[] } {
  const ohne: CategorySuggestion[] = []
  const mit: CategorySuggestion[] = []
  for (const s of list) (s.current_category ? mit : ohne).push(s)
  return {
    neue: groupSuggestions(ohne, 'neu'),
    aenderungen: groupSuggestions(mit, 'aenderung'),
  }
}

/** Die Kategorien, die in dieser Gruppe überschrieben würden — für die Anzeige „bisher: …". */
function bisherLabels(g: Group): string {
  const namen = [...new Set(g.items.map(i => i.current_category?.name).filter(Boolean))] as string[]
  return namen.join(', ')
}

export function CategorySuggestions({ categories, onAccept }: Props) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([])
  // Per-GROUP override, defaults to that group's suggested category — one decision covers
  // every transaction from that counterparty instead of confirming the same category repeatedly.
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [isApplyingAll, setIsApplyingAll] = useState(false)

  const { neue, aenderungen } = useMemo(() => buildGroups(suggestions), [suggestions])
  const neueCount = useMemo(() => neue.reduce((n, g) => n + g.items.length, 0), [neue])

  const loadSuggestions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bank/transactions/suggest-categories')
      const data: SuggestCategoriesResponse = await res.json()
      if (data.error) throw new Error(data.error)
      const list = data.suggestions ?? []
      setSuggestions(list)
      const { neue: n, aenderungen: a } = buildGroups(list)
      setChosen(Object.fromEntries(
        [...n, ...a].map(g => [g.key, g.items[0].suggested_category.id]),
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschläge konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) loadSuggestions()
  }

  const resolvedCategoryId = (g: Group) => chosen[g.key] ?? g.items[0].suggested_category.id

  const accept = async (g: Group) => {
    setBusyKey(g.key)
    try {
      const categoryId = resolvedCategoryId(g)
      await Promise.all(g.items.map(item => onAccept(item.id, categoryId)))
      const ids = new Set(g.items.map(i => i.id))
      setSuggestions(prev => prev.filter(s => !ids.has(s.id)))
    } finally {
      setBusyKey(null)
    }
  }

  const dismiss = (g: Group) => {
    const ids = new Set(g.items.map(i => i.id))
    setSuggestions(prev => prev.filter(s => !ids.has(s.id)))
  }

  // Bewusst NUR die unkategorisierten. Die Änderungsvorschläge bleiben stehen und müssen
  // einzeln bestätigt werden — siehe buildGroups.
  const acceptAllNew = async () => {
    setIsApplyingAll(true)
    try {
      await Promise.all(
        neue.flatMap(g => {
          const categoryId = resolvedCategoryId(g)
          return g.items.map(item => onAccept(item.id, categoryId))
        }),
      )
      const ids = new Set(neue.flatMap(g => g.items.map(i => i.id)))
      setSuggestions(prev => prev.filter(s => !ids.has(s.id)))
    } finally {
      setIsApplyingAll(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Wand2 className="size-4" />
        Kategorien vorschlagen
      </Button>

      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kategorie-Vorschläge</SheetTitle>
          <SheetDescription>
            Nach Empfänger gruppiert — eine Kategorie pro Gruppe übernehmen, statt jede
            einzelne Buchung zu bestätigen. Oben die Buchungen ohne Kategorie, darunter
            Vorschläge, die eine bereits gesetzte Kategorie ersetzen würden.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">Lade Vorschläge…</p>
          )}

          {!isLoading && error && (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          )}

          {!isLoading && !error && neue.length === 0 && aenderungen.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Keine offenen Vorschläge — alles ist bereits passend kategorisiert.
            </p>
          )}

          {neue.length > 0 && (
            <p className="pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Ohne Kategorie · {neueCount} {neueCount === 1 ? 'Buchung' : 'Buchungen'}
            </p>
          )}

          {/* Eine Liste statt zweier Schleifen — die Zwischenüberschrift wird an der
              Bruchstelle eingeschoben. Zwei getrennte `.map()` hätten die komplette
              Gruppenkarte dupliziert. */}
          {[...neue, ...aenderungen].map((g, i) => (
            <Fragment key={g.key}>
              {i === neue.length && aenderungen.length > 0 && (
                <p className="pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Änderungsvorschläge · einzeln prüfen
                </p>
              )}
            <div
              className={`rounded-lg border p-3 space-y-2 ${
                g.kind === 'aenderung' ? 'border-dashed border-border/70' : 'border-border'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate flex-1 min-w-0">{g.label}</p>
                {g.items.length > 1 && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {g.items.length}×
                  </span>
                )}
              </div>
              {g.kind === 'aenderung' && (
                // Ohne diese Zeile sieht ein Änderungsvorschlag genauso aus wie eine noch
                // gar nicht kategorisierte Buchung — man übernimmt ihn dann versehentlich.
                <p className="text-[11px] text-muted-foreground">
                  bisher: <span className="text-foreground">{bisherLabels(g)}</span>
                </p>
              )}
              <Select
                value={resolvedCategoryId(g)}
                onValueChange={v => setChosen(prev => ({ ...prev, [g.key]: v }))}
              >
                <SelectTrigger size="sm" className="h-6 w-full rounded-full border-none px-2.5 text-xs shadow-none bg-primary/10 text-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#94a3b8' }} />
                        {categoryLabel(c)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => dismiss(g)}
                  disabled={busyKey === g.key}
                >
                  <X className="size-3.5" />
                  Verwerfen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => accept(g)}
                  disabled={busyKey === g.key}
                >
                  {busyKey === g.key
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Check className="size-3.5" />}
                  {g.items.length > 1 ? `Alle ${g.items.length} übernehmen` : 'Übernehmen'}
                </Button>
              </div>
            </div>
            </Fragment>
          ))}
        </div>

        {neueCount > 0 && (
          <SheetFooter>
            {/* Fasst ausschliesslich die unkategorisierten an. Die Änderungsvorschläge
                bleiben nach dem Klick stehen — sie sollen eine bewusste Entscheidung
                bleiben, keine Beifang eines Sammelknopfs. */}
            <Button onClick={acceptAllNew} disabled={isApplyingAll}>
              {isApplyingAll
                ? <Loader2 className="size-4 animate-spin" />
                : <Check className="size-4" />}
              Alle {neueCount} ohne Kategorie übernehmen ({neue.length} Gruppen)
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
