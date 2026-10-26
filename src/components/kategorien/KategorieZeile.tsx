'use client'

import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HoverInfo } from '@/components/ui/hover-info'
import { AddCategoryDialog, EditCategoryDialog } from '@/components/finance/category-form'
import { KategorieLoeschen } from '@/components/kategorien/KategorieLoeschen'
import { fmtCurrency } from '@/lib/format'
import type { CategoryRow, EuerZeileRow } from '@/lib/data/finance-transactions'
import type { KategorieKnoten } from '@/lib/kategorien/berechnen'

const TYP_MARKE: Record<string, { label: string; klassen: string }> = {
  expense: { label: 'Ausgabe', klassen: 'bg-danger/10 text-danger' },
  income: { label: 'Einnahme', klassen: 'bg-success/10 text-success' },
  neutral: { label: 'Neutral', klassen: 'bg-muted text-muted-foreground' },
}

/** Geschäftliche Rollen teilen sich eine Farbe, „Privat“ ist neutral grau (Theme-Tokens, keine festen Farben). */
const ROLLEN_MARKE: Record<string, { label: string; klassen: string; text: string }> = {
  betriebseinnahme: { label: 'Betriebseinnahme', klassen: 'bg-primary/10 text-primary', text: 'Zählt in der Steuer als Betriebseinnahme.' },
  betriebsausgabe: { label: 'Betriebsausgabe', klassen: 'bg-primary/10 text-primary', text: 'Zählt in der Steuer als Betriebsausgabe (ggf. nur mit betrieblichem Anteil).' },
  lohn: { label: 'Lohn', klassen: 'bg-primary/10 text-primary', text: 'Lohn bzw. Gehalt, wird in der Steuer als Einkunft aus nichtselbständiger Arbeit geführt.' },
  privat: { label: 'Privat', klassen: 'bg-muted text-muted-foreground', text: 'Privat, steuerlich nicht relevant.' },
}

const MARKE = 'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium'

export function KategorieIcon({ color, icon }: { color: string | null; icon: string | null }) {
  // Die vom Nutzer gewählte Farbe ist Absicht; ohne Wahl der Theme-Grauton.
  const farbe = color ?? 'var(--muted-foreground)'
  return (
    <span
      className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm"
      style={{ backgroundColor: `color-mix(in srgb, ${farbe} 15%, transparent)` }}
      aria-hidden
    >
      {icon ? icon : <span className="size-2 rounded-full" style={{ backgroundColor: farbe }} />}
    </span>
  )
}

export function TypMarke({ type }: { type: string }) {
  const cfg = TYP_MARKE[type] ?? TYP_MARKE.neutral
  return <span className={`${MARKE} ${cfg.klassen}`}>{cfg.label}</span>
}

export interface ZeilenKontext {
  alle: CategoryRow[]
  euerZeilen: EuerZeileRow[]
  locale: string
  zeitraum: string
  /** Index der Reihenfolge-Knöpfe: wenn gesetzt, zeigt die Zeile Auf/Ab statt Bearbeiten/Löschen. */
  sortierung: null | {
    hoch: () => void
    runter: () => void
    ersteStelle: boolean
    letzteStelle: boolean
  }
}

/**
 * Eine Kategorie als Zeile (Haupt- und Unterkategorie, Gruppenansicht und Rollenansicht).
 *
 * Gitter: Spalte 1 Icon (bei Hauptkategorien mit Aufklapp-Pfeil), 2 Name und Marken, 3 Nutzung
 * (mobil rechts oben) und Aktionen (mobil rechts unten). Ab md steht alles in einer Zeile. Der Name ist
 * ein Link auf die Buchungen der Kategorie und ist über `after:` auf die ganze Zeile gedehnt; Marken
 * und Aktionen liegen darüber (`relative`) und bleiben einzeln bedienbar.
 */
export function KategorieZeile({
  knoten, ktx, tiefe, eingerueckt = tiefe === 1, zeigeTyp, elternName, offen, onToggle, anzahlKinder,
}: {
  knoten: KategorieKnoten
  ktx: ZeilenKontext
  /** 0 = Hauptkategorie, 1 = Unterkategorie (eingerückt). */
  tiefe: 0 | 1
  /** Einrückung; Standard: Unterkategorien rücken ein. In der Rollenansicht (flache Liste) aus. */
  eingerueckt?: boolean
  zeigeTyp: boolean
  /** Nur in der Rollenansicht: wo die Kategorie hängt. */
  elternName?: string | null
  /** Nur Hauptkategorien mit Aufklappen. */
  offen?: boolean
  onToggle?: () => void
  anzahlKinder?: number
}) {
  const n = knoten.nutzung
  const istAusgabe = knoten.type === 'expense'
  const istEinnahme = knoten.type === 'income'
  const summe = istAusgabe ? n.ausgaben : istEinnahme ? n.einnahmen : 0
  const rolle = knoten.rolle ? ROLLEN_MARKE[knoten.rolle] : undefined
  const geerbt = Boolean(knoten.rolle && !knoten.tax_role)
  const budget = knoten.budget_monthly !== null && knoten.budget_monthly > 0 ? knoten.budget_monthly : null
  const euro = (x: number, d = 0) => fmtCurrency(x, 'EUR', ktx.locale, { fractionDigits: d })
  const sortiert = ktx.sortierung

  return (
    <div
      className={`group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 px-3 py-2 transition-colors hover:bg-muted/30 focus-within:bg-muted/30 md:grid-cols-[auto_minmax(0,1fr)_auto_9rem_auto] md:py-2.5 ${
        eingerueckt ? 'pl-8 md:pl-12' : ''
      }`}
    >
      {/* Spalte 1: Pfeil (nur Hauptkategorie) + Icon */}
      <div className="relative z-10 row-start-1 flex items-center gap-0.5">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={offen}
            aria-label={`${knoten.name} ${offen ? 'zuklappen' : 'aufklappen'}`}
            className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted md:size-8"
          >
            <ChevronRight className={`size-4 transition-transform ${offen ? 'rotate-90' : ''}`} aria-hidden />
          </button>
        )}
        <KategorieIcon color={knoten.color} icon={knoten.icon} />
      </div>

      {/* Name: Link auf die Buchungen, über die ganze Zeile gedehnt */}
      <div className="col-start-2 row-start-1 min-w-0">
        <Link
          href={`/finance/transactions?category=${knoten.id}`}
          className="block truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
        >
          {knoten.name}
          {anzahlKinder !== undefined && anzahlKinder > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">({anzahlKinder})</span>
          )}
          {elternName && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {elternName}</span>}
        </Link>
      </div>

      {/* Nutzung */}
      <div className="pointer-events-none relative z-10 col-start-3 row-start-1 justify-self-end text-right md:col-start-4">
        <HoverInfo
          bare
          className="pointer-events-auto"
          popClassName="right-0 left-auto"
          titel={`${knoten.name}${tiefe === 0 && (anzahlKinder ?? 0) > 0 ? ' (inkl. Unterkategorien)' : ''}`}
          zeilen={[
            ['Buchungen gesamt', String(n.anzahl)],
            [`Buchungen ${ktx.zeitraum}`, String(n.anzahlZeitraum)],
            ['Ausgaben im Zeitraum', euro(n.ausgaben, 2)],
            ['Einnahmen im Zeitraum', euro(n.einnahmen, 2)],
          ]}
          text="Summen zählen nur echte Einnahmen und Ausgaben. Umbuchungen, Anfangsbestände, Anlagen und Forderungen zählen als Buchung, aber nicht in die Summe."
        >
          {n.anzahl === 0 ? (
            <span className="text-xs italic text-muted-foreground">Ungenutzt</span>
          ) : (
            <span className="flex flex-col items-end leading-tight">
              <span
                className={`text-sm font-semibold tabular-nums ${istAusgabe ? 'text-danger' : istEinnahme ? 'text-success' : 'text-muted-foreground'}`}
              >
                {istAusgabe || istEinnahme ? (summe > 0 ? euro(summe) : '–') : `${n.anzahlZeitraum} Buch.`}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {n.anzahl} {n.anzahl === 1 ? 'Buchung' : 'Buchungen'}
              </span>
            </span>
          )}
        </HoverInfo>
      </div>

      {/* Marken und Aktionen: mobil eine eigene Zeile (zweite), ab md Teil des Gitters */}
      <div className="col-span-3 row-start-2 flex items-center justify-between gap-2 md:contents">
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-1 md:col-start-3 md:row-start-1 md:flex-none md:flex-nowrap md:justify-end">
        {zeigeTyp && <TypMarke type={knoten.type} />}
        {rolle && (
          <HoverInfo
            bare
            className="pointer-events-auto max-w-full"
            titel={rolle.label}
            text={`${rolle.text}${geerbt ? ' Die Rolle kommt von der Hauptkategorie.' : ''}${
              knoten.business_share !== null && knoten.rolle === 'betriebsausgabe' ? ` Betrieblicher Anteil: ${knoten.business_share} %.` : ''
            }`}
          >
            <span className={`${MARKE} ${rolle.klassen}`}>
              <span className="truncate">{rolle.label}{geerbt ? ' ↑' : ''}</span>
            </span>
          </HoverInfo>
        )}
        {budget !== null && (
          <HoverInfo
            bare
            className="pointer-events-auto"
            titel="Monatsbudget"
            zeilen={[['Budget', `${euro(budget, 2)} / Monat`]]}
            text="Das Budget dieser Kategorie. Verbrauch und Planung siehst du auf der Budget-Seite; ein Klick führt dorthin."
          >
            <Link href="/finance/budget" className={`${MARKE} bg-muted text-muted-foreground hover:text-foreground`}>
              Budget {euro(budget)}
            </Link>
          </HoverInfo>
        )}
      </div>

      {/* Aktionen: mobil immer sichtbar, am Desktop bei Hover/Fokus */}
      <div className="relative z-10 flex shrink-0 items-center md:col-start-5 md:row-start-1 md:justify-self-end">
        {sortiert ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="outline"
              size="icon-sm"
              className="size-10 md:size-8"
              onClick={sortiert.hoch}
              disabled={sortiert.ersteStelle}
              aria-label={`${knoten.name} nach oben`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-10 md:size-8"
              onClick={sortiert.runter}
              disabled={sortiert.letzteStelle}
              aria-label={`${knoten.name} nach unten`}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex items-center opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            {tiefe === 0 && (
              <AddCategoryDialog
                allCategories={ktx.alle}
                euerZeilen={ktx.euerZeilen}
                defaultParentId={knoten.id}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-10 text-muted-foreground md:size-8"
                    aria-label={`Unterkategorie zu ${knoten.name} anlegen`}
                  >
                    <Plus className="size-4 md:size-3.5" aria-hidden />
                  </Button>
                }
              />
            )}
            <EditCategoryDialog category={knoten} allCategories={ktx.alle} euerZeilen={ktx.euerZeilen} />
            <KategorieLoeschen category={knoten} alle={ktx.alle} />
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
