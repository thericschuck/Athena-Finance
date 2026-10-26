'use client'

import { useEffect, useRef, useState } from 'react'
import { groupCategoriesByParent } from '@/lib/finance/category-groups'
import { cn } from '@/lib/utils'
import {
  ARTEN, ART_LABEL, OHNE_KATEGORIE, SORTIERUNGEN, SORT_LABEL, TYPEN, TYP_LABEL,
  type Art, type Sortierung, type Typ,
} from '@/lib/transaktionen/filter'
import { parseBetragFilter } from '@/lib/transaktionen/import'

export interface KontoOption { id: string; name: string }
export interface KategorieOption { id: string; name: string; parent_id: string | null }

/** Die Auswahlfilter (alles außer Suche und Zeitraum) als Texte; leer = nicht gesetzt. */
export interface AuswahlWerte {
  type: string
  art: string
  account: string
  category: string
  /** Rohe Eingabe oder URL-Wert (Punkt) — je nach Verwendung. */
  min: string
  max: string
  sort: string
}
export type AuswahlKey = keyof AuswahlWerte

/** Schlüssel, die in „Filter (n)“ zählen. Sortierung ist eine Ansichtseinstellung und zählt nicht. */
export const AUSWAHL_FILTER_KEYS = ['type', 'art', 'account', 'category', 'min', 'max'] as const

export const STANDARD_SORT: Sortierung = 'date-desc'

/**
 * Native <select>/<input> mit `bg-background`: das Options-Popup erbt die Hintergrundfarbe des Feldes, mit
 * `bg-transparent` stünde im Dark-Mode heller Text auf weißem System-Popup (siehe AthenaSettingsForm).
 * `text-base sm:text-sm` verhindert den iOS-Zoom beim Fokussieren. 40 px mobil, 32 px ab md.
 */
export const feldKlasse =
  'h-10 md:h-8 min-w-0 rounded-md border border-input bg-background px-2.5 text-base text-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:text-sm'

export function datumDe(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/** URL-Wert (`12.5`) → Anzeige (`12,5`). */
export const betragAnzeige = (v: string) => v.replace('.', ',')

export function istTyp(v: string | null): v is Typ { return !!v && (TYPEN as readonly string[]).includes(v) }
export function istArt(v: string | null): v is Art { return !!v && (ARTEN as readonly string[]).includes(v) }
export function istSort(v: string | null): v is Sortierung { return !!v && (SORTIERUNGEN as readonly string[]).includes(v) }

// ─── Betrag ───────────────────────────────────────────────────────────────────

/**
 * Zahlenfeld für Betrag von/bis. Deutsche Eingabe („12,50“) ist erlaubt und wird geprüft.
 * `verzoegert`: eigener Entwurf, nach einer Tippause (nur wenn gültig) an `onWert` gemeldet, normalisiert
 * (`12.5` oder `''`). Sonst kontrolliert: jede Eingabe geht roh an `onWert` (das Sheet prüft beim Anwenden).
 */
export function BetragFeld({
  wert, onWert, label, platzhalter, verzoegert = false, className,
}: {
  wert: string
  onWert: (wert: string) => void
  label: string
  platzhalter: string
  verzoegert?: boolean
  className?: string
}) {
  const [entwurf, setEntwurf] = useState(betragAnzeige(wert))
  const zuletzt = useRef(wert)
  const melden = useRef(onWert)
  useEffect(() => { melden.current = onWert })

  // Änderungen von außen (Zurücksetzen, Chip entfernt, Zurück-Knopf) ins Feld spiegeln.
  useEffect(() => {
    if (!verzoegert) return
    if (wert !== zuletzt.current) {
      zuletzt.current = wert
      setEntwurf(betragAnzeige(wert))
    }
  }, [wert, verzoegert])

  useEffect(() => {
    if (!verzoegert) return
    const n = parseBetragFilter(entwurf)
    if (n === null || n === zuletzt.current) return
    const id = setTimeout(() => {
      zuletzt.current = n
      melden.current(n)
    }, 500)
    return () => clearTimeout(id)
  }, [entwurf, verzoegert])

  const anzeige = verzoegert ? entwurf : wert
  const ungueltig = parseBetragFilter(anzeige) === null

  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={ungueltig || undefined}
        placeholder={platzhalter}
        value={anzeige}
        onChange={e => (verzoegert ? setEntwurf(e.target.value) : onWert(e.target.value))}
        className={cn(feldKlasse, 'w-full pr-6 tabular-nums', ungueltig && 'border-danger focus:ring-danger')}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
    </div>
  )
}

// ─── Auswahlfelder ────────────────────────────────────────────────────────────

/** Mit sichtbarer Beschriftung (Sheet) oder ohne (Leiste). Auf Modulebene, damit React die Felder beim Rendern nicht neu aufbaut. */
function Beschriftet({ mitLabels, label, children }: { mitLabels: boolean; label: string; children: React.ReactNode }) {
  if (!mitLabels) return <>{children}</>
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

/**
 * Typ, Art, Konto, Kategorie, Betrag von/bis und Sortierung — dieselben Felder in der Leiste (Desktop,
 * wirkt sofort) und im Sheet (Handy, Entwurf). Beim Sheet (`mitLabels`) stehen sichtbare Beschriftungen
 * über den Feldern, in der Leiste trägt die erste Option („Alle Typen“) die Bedeutung.
 */
export function AuswahlFelder({
  werte, onAendern, accounts, categories, mitLabels = false, betragVerzoegert = false, className,
}: {
  werte: AuswahlWerte
  onAendern: (key: AuswahlKey, wert: string) => void
  accounts: KontoOption[]
  categories: KategorieOption[]
  mitLabels?: boolean
  betragVerzoegert?: boolean
  className?: string
}) {
  const breit = mitLabels ? 'w-full' : 'w-auto max-w-[12rem]'

  return (
    <div className={className}>
      <Beschriftet mitLabels={mitLabels} label="Typ">
        <select aria-label="Typ" className={cn(feldKlasse, breit)} value={werte.type} onChange={e => onAendern('type', e.target.value)}>
          <option value="">Alle Typen</option>
          {TYPEN.map(t => <option key={t} value={t}>{TYP_LABEL[t]}</option>)}
        </select>
      </Beschriftet>

      <Beschriftet mitLabels={mitLabels} label="Buchungsart">
        <select aria-label="Buchungsart" className={cn(feldKlasse, breit)} value={werte.art} onChange={e => onAendern('art', e.target.value)}>
          <option value="">Alle Arten</option>
          {ARTEN.map(a => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
        </select>
      </Beschriftet>

      <Beschriftet mitLabels={mitLabels} label="Konto">
        <select aria-label="Konto" className={cn(feldKlasse, breit)} value={werte.account} onChange={e => onAendern('account', e.target.value)}>
          <option value="">Alle Konten</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Beschriftet>

      <Beschriftet mitLabels={mitLabels} label="Kategorie">
        <select aria-label="Kategorie" className={cn(feldKlasse, breit)} value={werte.category} onChange={e => onAendern('category', e.target.value)}>
          <option value="">Alle Kategorien</option>
          <option value={OHNE_KATEGORIE}>Ohne Kategorie</option>
          {/* Nach Hauptkategorie gruppiert: bei 30+ Kategorien war die Reihenfolge sonst praktisch zufällig. */}
          {groupCategoriesByParent(categories).map(({ parent, children }) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.id}>{parent.name}</option>
              {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Beschriftet>

      {mitLabels ? (
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Betrag in €
          <div className="grid grid-cols-2 gap-2">
            <BetragFeld wert={werte.min} onWert={v => onAendern('min', v)} label="Betrag von" platzhalter="von" verzoegert={betragVerzoegert} />
            <BetragFeld wert={werte.max} onWert={v => onAendern('max', v)} label="Betrag bis" platzhalter="bis" verzoegert={betragVerzoegert} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <BetragFeld wert={werte.min} onWert={v => onAendern('min', v)} label="Betrag von" platzhalter="Betrag von" verzoegert={betragVerzoegert} className="w-28" />
          <span className="text-muted-foreground" aria-hidden>–</span>
          <BetragFeld wert={werte.max} onWert={v => onAendern('max', v)} label="Betrag bis" platzhalter="bis" verzoegert={betragVerzoegert} className="w-24" />
        </div>
      )}

      <Beschriftet mitLabels={mitLabels} label="Sortierung">
        <select aria-label="Sortierung" className={cn(feldKlasse, breit)} value={werte.sort} onChange={e => onAendern('sort', e.target.value)}>
          {SORTIERUNGEN.map(s => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
        </select>
      </Beschriftet>
    </div>
  )
}
