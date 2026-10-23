'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FinanceCategory } from '@/types/bank'

/** Select kennt keinen `null`-Wert, daher ein Platzhalter fuer „ohne Kategorie". */
export const OHNE_KATEGORIE = '__none__'

export function kategorieLabel(c: FinanceCategory): string {
  return c.icon ? `${c.icon} ${c.name}` : c.name
}

export interface KategorieOption {
  kategorie: FinanceCategory
  /** Einrueckungstiefe (0 = Hauptkategorie). */
  tiefe: number
}

/**
 * Hierarchisch geordnete Liste: Hauptkategorie, direkt darunter ihre Unterkategorien. Eine
 * Kategorie, deren Eltern fehlen, wird wie eine Hauptkategorie behandelt, damit keine
 * verloren geht.
 */
export function kategorieOptionen(categories: readonly FinanceCategory[]): KategorieOption[] {
  const ids = new Set(categories.map(c => c.id))
  const kinder = new Map<string | null, FinanceCategory[]>()
  for (const c of categories) {
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null
    kinder.set(key, [...(kinder.get(key) ?? []), c])
  }
  const aus: KategorieOption[] = []
  const gesehen = new Set<string>()
  const geh = (parent: string | null, tiefe: number) => {
    const liste = [...(kinder.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    for (const c of liste) {
      if (gesehen.has(c.id)) continue // Schutz vor Zyklen in parent_id
      gesehen.add(c.id)
      aus.push({ kategorie: c, tiefe })
      geh(c.id, tiefe + 1)
    }
  }
  geh(null, 0)
  return aus
}

function Optionen({ optionen }: { optionen: KategorieOption[] }) {
  return (
    <>
      <SelectItem value={OHNE_KATEGORIE}>Ohne Kategorie</SelectItem>
      {optionen.map(({ kategorie: c, tiefe }) => (
        <SelectItem key={c.id} value={c.id}>
          <span className="flex items-center gap-2" style={{ paddingLeft: tiefe * 12 }}>
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.color ?? '#94a3b8' }}
            />
            {kategorieLabel(c)}
          </span>
        </SelectItem>
      ))}
    </>
  )
}

/**
 * Kategorie einer Buchung: ein Button, der die Auswahl erst beim Anklicken aufbaut — wie in
 * der alten Liste (bank-transactions-view). Eine fertige Radix-Select pro Zeile waere bei
 * hunderten Buchungen viel zu schwer (Context, Portal und Fokusverwaltung je Instanz).
 */
export function KategorieZelle({
  wert, kategorien, optionen, onChange, disabled = false,
}: {
  /** Aktuelle Kategorie-ID oder null. */
  wert: string | null
  kategorien: ReadonlyMap<string, FinanceCategory>
  optionen: KategorieOption[]
  onChange: (categoryId: string | null) => void
  disabled?: boolean
}) {
  const [offen, setOffen] = useState(false)
  const aktuell = wert ? kategorien.get(wert) : undefined
  const stil = aktuell?.color
    ? { backgroundColor: `${aktuell.color}1a`, color: aktuell.color }
    : undefined

  if (!offen) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={e => { e.stopPropagation(); setOffen(true) }}
        aria-label={`Kategorie ändern, aktuell: ${aktuell ? aktuell.name : 'keine'}`}
        className={`inline-flex h-7 max-w-[170px] items-center rounded-full px-2.5 text-xs transition-colors disabled:opacity-50 ${
          aktuell ? '' : 'text-muted-foreground hover:bg-muted'
        }`}
        style={stil}
      >
        <span className="truncate">{aktuell ? kategorieLabel(aktuell) : 'Kategorisieren…'}</span>
      </button>
    )
  }

  return (
    <span onClick={e => e.stopPropagation()}>
      <Select
        defaultOpen
        value={wert ?? OHNE_KATEGORIE}
        onValueChange={v => {
          const neu = v === OHNE_KATEGORIE ? null : v
          if (neu !== wert) onChange(neu)
          setOffen(false)
        }}
        // Ohne Auswahl geschlossen: zurueck zum Button, sonst bliebe die Select gemountet.
        onOpenChange={o => { if (!o) setOffen(false) }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Kategorie ändern"
          className="h-7 max-w-[170px] rounded-full border-none px-2.5 text-xs shadow-none"
          style={stil}
        >
          <SelectValue placeholder="Kategorisieren…">
            {aktuell ? kategorieLabel(aktuell) : 'Kategorisieren…'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <Optionen optionen={optionen} />
        </SelectContent>
      </Select>
    </span>
  )
}

/** Auswahl ohne Lazy-Button, fuer Filterleiste und Sammelaktion (dort gibt es nur eine). */
export function KategorieAuswahl({
  wert, onChange, optionen, platzhalter, extra, ariaLabel,
}: {
  wert: string
  onChange: (v: string) => void
  optionen: KategorieOption[]
  platzhalter: string
  /** Zusaetzliche Eintraege vor den Kategorien (z. B. „Alle Kategorien"). */
  extra?: { value: string; label: string }[]
  ariaLabel: string
}) {
  return (
    <Select value={wert} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="h-8 text-sm">
        <SelectValue placeholder={platzhalter} />
      </SelectTrigger>
      <SelectContent>
        {extra?.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
        {optionen.map(({ kategorie: c, tiefe }) => (
          <SelectItem key={c.id} value={c.id}>
            <span className="flex items-center gap-2" style={{ paddingLeft: tiefe * 12 }}>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.color ?? '#94a3b8' }}
              />
              {kategorieLabel(c)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
