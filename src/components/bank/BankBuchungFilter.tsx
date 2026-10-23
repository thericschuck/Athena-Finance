'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BuchungsTyp, SortFeld, Sortierung } from '@/lib/bank/buchungen'
import { KategorieAuswahl, type KategorieOption } from './BankBuchungKategorie'

/** Rohwerte der Eingabefelder (Betraege als Text, damit `12,` beim Tippen stehen bleibt). */
export interface FilterFormular {
  q: string
  kategorie: string
  minText: string
  maxText: string
  von: string
  bis: string
  typ: BuchungsTyp
}

export const LEERES_FORMULAR: FilterFormular = {
  q: '', kategorie: '', minText: '', maxText: '', von: '', bis: '', typ: 'alle',
}

const TYPEN: { wert: BuchungsTyp; label: string }[] = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'eingang', label: 'Eingang' },
  { wert: 'ausgang', label: 'Ausgang' },
  { wert: 'umbuchung', label: 'Umbuchung' },
]

const SORT_LABEL: Record<SortFeld, string> = { datum: 'Datum', betrag: 'Betrag', partei: 'Gegenpartei' }
const ALLE = '__alle__'

export function BankBuchungFilter({
  form, onChange, sortierung, onSort, optionen, aktiv, onReset, exportHref,
}: {
  form: FilterFormular
  onChange: (patch: Partial<FilterFormular>) => void
  sortierung: Sortierung
  onSort: (s: Sortierung) => void
  optionen: KategorieOption[]
  /** Irgendein lokaler Filter gesetzt? */
  aktiv: boolean
  onReset: () => void
  exportHref: string
}) {
  const [erweitert, setErweitert] = useState(
    () => !!(form.minText || form.maxText || form.von || form.bis),
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buchungen durchsuchen"
            placeholder="Zweck, Gegenpartei, Betrag…"
            value={form.q}
            onChange={e => onChange({ q: e.target.value })}
            className="h-8 pl-8 text-sm"
          />
        </div>

        <KategorieAuswahl
          wert={form.kategorie || ALLE}
          onChange={v => onChange({ kategorie: v === ALLE ? '' : v })}
          optionen={optionen}
          platzhalter="Alle Kategorien"
          ariaLabel="Nach Kategorie filtern"
          extra={[{ value: ALLE, label: 'Alle Kategorien' }, { value: 'offen', label: 'Ohne Kategorie' }]}
        />

        <div className="flex items-center gap-1">
          <Select value={sortierung.feld} onValueChange={v => onSort({ ...sortierung, feld: v as SortFeld })}>
            <SelectTrigger size="sm" aria-label="Sortieren nach" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortFeld[]).map(f => (
                <SelectItem key={f} value={f}>{SORT_LABEL[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => onSort({ ...sortierung, richtung: sortierung.richtung === 'ab' ? 'auf' : 'ab' })}
            aria-label={sortierung.richtung === 'ab' ? 'Absteigend sortiert, umschalten' : 'Aufsteigend sortiert, umschalten'}
            className="flex size-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
          >
            {sortierung.richtung === 'ab' ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Typ" className="flex overflow-hidden rounded-md border border-border">
          {TYPEN.map(t => (
            <button
              key={t.wert}
              type="button"
              aria-pressed={form.typ === t.wert}
              onClick={() => onChange({ typ: t.wert })}
              className={`h-8 px-2.5 text-xs font-medium transition-colors ${
                form.typ === t.wert ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={erweitert}
          onClick={() => setErweitert(v => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
        >
          <SlidersHorizontal className="size-3.5" />
          Betrag und Datum
        </button>

        {aktiv && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Filter zurücksetzen
          </button>
        )}

        <a
          href={exportHref}
          download
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
        >
          <Download className="size-3.5" />
          Exportieren
        </a>
      </div>

      {erweitert && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="space-y-1 text-xs text-muted-foreground">
            Betrag ab (€)
            <Input
              inputMode="decimal"
              value={form.minText}
              onChange={e => onChange({ minText: e.target.value })}
              placeholder="0"
              className="h-8 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Betrag bis (€)
            <Input
              inputMode="decimal"
              value={form.maxText}
              onChange={e => onChange({ maxText: e.target.value })}
              placeholder="unbegrenzt"
              className="h-8 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Von
            <Input
              type="date"
              value={form.von}
              max={form.bis || undefined}
              onChange={e => onChange({ von: e.target.value })}
              className="h-8 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Bis
            <Input
              type="date"
              value={form.bis}
              min={form.von || undefined}
              onChange={e => onChange({ bis: e.target.value })}
              className="h-8 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  )
}
