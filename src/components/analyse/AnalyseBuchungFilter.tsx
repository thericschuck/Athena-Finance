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
import { ART_LABEL, type ArtFilter, type SortFeld, type Sortierung, type TypFilter } from '@/lib/analyse/buchungen'

/** Rohwerte der Eingabefelder (Betraege als Text, damit `12,` beim Tippen stehen bleibt). */
export interface FilterFormular {
  q: string
  typ: TypFilter
  art: ArtFilter
  minText: string
  maxText: string
  konto: string
}

export const LEERES_FORMULAR: FilterFormular = { q: '', typ: 'alle', art: 'alle', minText: '', maxText: '', konto: '' }

const TYPEN: { wert: TypFilter; label: string }[] = [
  { wert: 'alle', label: 'Alle' },
  { wert: 'einnahmen', label: 'Einnahmen' },
  { wert: 'ausgaben', label: 'Ausgaben' },
]

const ARTEN: { wert: ArtFilter; label: string }[] = [
  { wert: 'alle', label: 'Alle Arten' },
  { wert: 'echt', label: ART_LABEL.echt },
  { wert: 'anlage', label: ART_LABEL.anlage },
  { wert: 'forderung', label: ART_LABEL.forderung },
]

const SORT_LABEL: Record<SortFeld, string> = { datum: 'Datum', betrag: 'Betrag', partei: 'Gegenpartei' }
const ALLE = '__alle__'

/** Segmentschalter; auf dem Handy 40 px hoch (Tap-Ziel), ab sm kompakter. */
function Segment<T extends string>({
  wert, optionen, onChange, label,
}: { wert: T; optionen: { wert: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border border-border">
      {optionen.map(o => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={wert === o.wert}
          onClick={() => onChange(o.wert)}
          className={`h-10 px-3 text-xs font-medium transition-colors sm:h-8 sm:px-2.5 ${
            wert === o.wert ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AnalyseBuchungFilter({
  form, onChange, sortierung, onSort, konten, zeigeArt, aktiv, onReset, exportHref,
}: {
  form: FilterFormular
  onChange: (patch: Partial<FilterFormular>) => void
  sortierung: Sortierung
  onSort: (s: Sortierung) => void
  konten: { id: string; name: string }[]
  /** Art-Schalter nur zeigen, wenn die Liste ueberhaupt Anlagen/Forderungen enthaelt. */
  zeigeArt: boolean
  /** Irgendein lokaler Filter gesetzt? */
  aktiv: boolean
  onReset: () => void
  exportHref: string
}) {
  const [erweitert, setErweitert] = useState(() => !!(form.minText || form.maxText || form.konto))
  const zeigeKonto = konten.length > 1

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buchungen durchsuchen"
            placeholder="Gegenpartei, Zweck, Betrag…"
            value={form.q}
            onChange={e => onChange({ q: e.target.value })}
            // 16 px auf dem Handy: kleinere Schrift laesst iOS beim Fokussieren hineinzoomen.
            className="h-10 pl-8 text-base sm:h-8 sm:text-sm"
          />
        </div>

        <div className="flex items-center gap-1">
          <Select value={sortierung.feld} onValueChange={v => onSort({ ...sortierung, feld: v as SortFeld })}>
            <SelectTrigger size="sm" aria-label="Sortieren nach" className="h-10 text-sm sm:h-8">
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
            className="flex size-10 items-center justify-center rounded-md border border-border bg-card hover:bg-muted sm:size-8"
          >
            {sortierung.richtung === 'ab' ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segment wert={form.typ} optionen={TYPEN} onChange={typ => onChange({ typ })} label="Typ" />
        {zeigeArt && (
          <Select value={form.art} onValueChange={v => onChange({ art: v as ArtFilter })}>
            <SelectTrigger size="sm" aria-label="Nach Buchungsart filtern" className="h-10 text-sm sm:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ARTEN.map(a => <SelectItem key={a.wert} value={a.wert}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <button
          type="button"
          aria-expanded={erweitert}
          onClick={() => setErweitert(v => !v)}
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted sm:h-8 sm:px-2.5"
        >
          <SlidersHorizontal className="size-3.5" />
          {zeigeKonto ? 'Betrag und Konto' : 'Betrag'}
        </button>

        {aktiv && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground sm:h-8"
          >
            <X className="size-3.5" />
            Filter zurücksetzen
          </button>
        )}

        <a
          href={exportHref}
          download
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted sm:h-8 sm:px-2.5"
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
              className="h-10 text-base sm:h-8 sm:text-sm"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Betrag bis (€)
            <Input
              inputMode="decimal"
              value={form.maxText}
              onChange={e => onChange({ maxText: e.target.value })}
              placeholder="unbegrenzt"
              className="h-10 text-base sm:h-8 sm:text-sm"
            />
          </label>
          {zeigeKonto && (
            <div className="col-span-2 space-y-1 text-xs text-muted-foreground">
              <span>Konto</span>
              <Select value={form.konto || ALLE} onValueChange={v => onChange({ konto: v === ALLE ? '' : v })}>
                <SelectTrigger size="sm" aria-label="Nach Konto filtern" className="h-10 w-full text-sm sm:h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLE}>Alle Konten</SelectItem>
                  {konten.map(k => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
