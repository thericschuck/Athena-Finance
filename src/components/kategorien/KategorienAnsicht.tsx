'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Check, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddCategoryDialog } from '@/components/finance/category-form'
import { KategorieZeile, type ZeilenKontext } from '@/components/kategorien/KategorieZeile'
import { sortiereKategorien } from '@/app/(dashboard)/finance/(transaktionen)/categories/actions'
import { fmtCurrency } from '@/lib/format'
import type { CategoryRow, EuerZeileRow } from '@/lib/data/finance-transactions'
import {
  filtereBaum,
  flacheListe,
  gruppiereNachRolle,
  verschiebeInListe,
  type KategorieKnoten,
  type TypFilter,
} from '@/lib/kategorien/berechnen'

type Gruppierung = 'hierarchy' | 'tax_role'

const TYP_CHIPS: { key: TypFilter; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'expense', label: 'Ausgaben' },
  { key: 'income', label: 'Einnahmen' },
  { key: 'neutral', label: 'Neutral' },
]

const WURZEL = '__root__'

function Chip({
  aktiv, onClick, children, disabled,
}: { aktiv: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 sm:h-8 ${
        aktiv
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

export function KategorienAnsicht({
  baum, flat, euerZeilen, locale, zeitraum,
}: {
  baum: KategorieKnoten[]
  flat: CategoryRow[]
  euerZeilen: EuerZeileRow[]
  locale: string
  /** Kurzname des Zeitraums (z. B. „1J“) für die Beschriftungen. */
  zeitraum: string
}) {
  const router = useRouter()
  const [typ, setTyp] = useState<TypFilter>('alle')
  const [gruppierung, setGruppierung] = useState<Gruppierung>('hierarchy')
  const [suche, setSuche] = useState('')
  const [nurUngenutzte, setNurUngenutzte] = useState(false)
  const [zu, setZu] = useState<Set<string>>(new Set())
  const [lokal, setLokal] = useState<Record<string, string[]> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, start] = useTransition()

  const sortiermodus = lokal !== null
  const alle = useMemo(() => flacheListe(baum), [baum])
  const anzahlTyp = useMemo(() => {
    const z: Record<TypFilter, number> = { alle: alle.length, expense: 0, income: 0, neutral: 0 }
    for (const k of alle) if (k.type === 'expense' || k.type === 'income' || k.type === 'neutral') z[k.type] += 1
    return z
  }, [alle])
  const anzahlUngenutzt = useMemo(() => alle.filter((k) => k.nutzung.anzahl === 0).length, [alle])

  // Im Sortiermodus immer alles, damit die gespeicherte Reihenfolge vollständig ist.
  const sichtbar = useMemo(
    () => (sortiermodus ? baum : filtereBaum(baum, { typ, suche, nurUngenutzte })),
    [baum, typ, suche, nurUngenutzte, sortiermodus],
  )
  const rollenGruppen = useMemo(
    () => (gruppierung === 'tax_role' ? gruppiereNachRolle(sichtbar) : []),
    [gruppierung, sichtbar],
  )
  const filterAktiv = typ !== 'alle' || suche.trim() !== '' || nurUngenutzte
  const sucheAktiv = suche.trim() !== ''

  const ktxBasis = { alle: flat, euerZeilen, locale, zeitraum }
  const euro = (x: number) => fmtCurrency(x, 'EUR', locale, { fractionDigits: 0 })

  // ── Reihenfolge ──
  function ordne(liste: KategorieKnoten[], schluessel: string): KategorieKnoten[] {
    const ids = lokal?.[schluessel]
    if (!ids) return liste
    return [...liste].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  }
  function starteSortieren() {
    setFehler(null)
    setGruppierung('hierarchy')
    setTyp('alle')
    setSuche('')
    setNurUngenutzte(false)
    setLokal({
      [WURZEL]: baum.map((w) => w.id),
      ...Object.fromEntries(baum.map((w) => [w.id, w.children.map((c) => c.id)])),
    })
  }
  function bewege(schluessel: string, id: string, richtung: -1 | 1) {
    setLokal((alt) => (alt ? { ...alt, [schluessel]: verschiebeInListe(alt[schluessel] ?? [], id, richtung) } : alt))
  }
  function speichere() {
    if (!lokal) return
    const ids = [...(lokal[WURZEL] ?? []), ...(lokal[WURZEL] ?? []).flatMap((w) => lokal[w] ?? [])]
    start(async () => {
      const r = await sortiereKategorien(ids)
      if (r.error) setFehler(r.error)
      else {
        setLokal(null)
        router.refresh()
      }
    })
  }
  function sortierung(schluessel: string, id: string, liste: KategorieKnoten[]): ZeilenKontext['sortierung'] {
    if (!sortiermodus) return null
    const i = liste.findIndex((k) => k.id === id)
    return {
      hoch: () => bewege(schluessel, id, -1),
      runter: () => bewege(schluessel, id, 1),
      ersteStelle: i <= 0,
      letzteStelle: i === liste.length - 1,
    }
  }

  // ── Auf-/Zuklappen ──
  const alleZu = sichtbar.length > 0 && sichtbar.every((w) => zu.has(w.id))
  function toggle(id: string) {
    setZu((alt) => {
      const neu = new Set(alt)
      if (neu.has(id)) neu.delete(id)
      else neu.add(id)
      return neu
    })
  }
  function alleUmschalten() {
    setZu(alleZu ? new Set() : new Set(baum.filter((w) => w.children.length > 0).map((w) => w.id)))
  }

  if (flat.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center">
        <p className="text-sm font-medium text-foreground">Noch keine Kategorien</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Mit Kategorien ordnest du Buchungen zu; Auswertungen, Budget und Steuer bauen darauf auf.
        </p>
        <div className="mt-4 flex justify-center">
          <AddCategoryDialog allCategories={flat} euerZeilen={euerZeilen} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Zeile 1: Suche, Alle auf/zu, Sortieren */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Kategorie suchen"
            aria-label="Kategorien durchsuchen"
            disabled={sortiermodus}
            className="h-10 pl-9 text-base sm:h-8 sm:text-sm"
          />
        </div>
        {gruppierung === 'hierarchy' && !sortiermodus && (
          <Button
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-1.5 sm:h-8"
            onClick={alleUmschalten}
            disabled={sucheAktiv}
            aria-label={alleZu ? 'Alle aufklappen' : 'Alle zuklappen'}
          >
            {alleZu ? <ChevronsUpDown className="size-4" aria-hidden /> : <ChevronsDownUp className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{alleZu ? 'Alle auf' : 'Alle zu'}</span>
          </Button>
        )}
        {!sortiermodus ? (
          <Button variant="outline" size="sm" className="h-10 shrink-0 gap-1.5 sm:h-8" onClick={starteSortieren} aria-label="Reihenfolge ändern">
            <ArrowUpDown className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sortieren</span>
          </Button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <Button size="sm" className="h-10 gap-1.5 sm:h-8" onClick={speichere} disabled={laeuft}>
              <Check className="size-4" aria-hidden />
              {laeuft ? 'Speichert…' : 'Fertig'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-10 sm:size-8"
              onClick={() => { setLokal(null); setFehler(null) }}
              disabled={laeuft}
              aria-label="Abbrechen"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </span>
        )}
      </div>
      {fehler && <p className="text-sm text-destructive" role="alert">{fehler}</p>}
      {sortiermodus && (
        <p className="text-xs text-muted-foreground">
          Mit den Pfeilen verschiebst du Kategorien innerhalb ihrer Ebene. „Fertig“ speichert die Reihenfolge.
        </p>
      )}

      {/* Zeile 2: Chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TYP_CHIPS.map((c) => (
          <Chip key={c.key} aktiv={typ === c.key} onClick={() => setTyp(c.key)} disabled={sortiermodus}>
            {c.label}
            <span className={`tabular-nums ${typ === c.key ? 'opacity-70' : 'opacity-60'}`}>{anzahlTyp[c.key]}</span>
          </Chip>
        ))}
        <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-border sm:inline-block" />
        <Chip aktiv={gruppierung === 'hierarchy'} onClick={() => setGruppierung('hierarchy')} disabled={sortiermodus}>
          Nach Hauptkategorie
        </Chip>
        <Chip aktiv={gruppierung === 'tax_role'} onClick={() => setGruppierung('tax_role')} disabled={sortiermodus}>
          Nach Steuerrolle
        </Chip>
        {anzahlUngenutzt > 0 && (
          <Chip aktiv={nurUngenutzte} onClick={() => setNurUngenutzte((v) => !v)} disabled={sortiermodus}>
            Ungenutzte
            <span className="tabular-nums opacity-60">{anzahlUngenutzt}</span>
          </Chip>
        )}
      </div>

      {sichtbar.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Keine passenden Kategorien</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filterAktiv ? 'Mit diesen Filtern gibt es keine Treffer.' : 'Es gibt keine Kategorien.'}
          </p>
          {filterAktiv && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-10 sm:h-8"
              onClick={() => { setTyp('alle'); setSuche(''); setNurUngenutzte(false) }}
            >
              Filter zurücksetzen
            </Button>
          )}
        </div>
      ) : gruppierung === 'hierarchy' ? (
        <div className="space-y-3">
          {ordne(sichtbar, WURZEL).map((wurzel) => {
            const kinder = ordne(wurzel.children, wurzel.id)
            const geoeffnet = sucheAktiv || sortiermodus || !zu.has(wurzel.id)
            // Die Kinderzahl im Namen: im Filter die sichtbaren, sonst alle.
            return (
              <div key={wurzel.id} className="rounded-lg border border-border bg-card">
                <KategorieZeile
                  knoten={wurzel}
                  ktx={{ ...ktxBasis, sortierung: sortierung(WURZEL, wurzel.id, ordne(sichtbar, WURZEL)) }}
                  tiefe={0}
                  zeigeTyp={typ === 'alle'}
                  offen={geoeffnet}
                  onToggle={wurzel.children.length > 0 && !sucheAktiv && !sortiermodus ? () => toggle(wurzel.id) : undefined}
                  anzahlKinder={wurzel.children.length}
                />
                {geoeffnet && kinder.length > 0 && (
                  <div className="divide-y divide-border border-t border-border">
                    {kinder.map((kind) => (
                      <KategorieZeile
                        key={kind.id}
                        knoten={kind}
                        ktx={{ ...ktxBasis, sortierung: sortierung(wurzel.id, kind.id, kinder) }}
                        tiefe={1}
                        zeigeTyp={kind.type !== wurzel.type}
                      />
                    ))}
                  </div>
                )}
                {geoeffnet && wurzel.children.length === 0 && !filterAktiv && (
                  <p className="border-t border-border px-4 py-2.5 pl-12 text-xs text-muted-foreground">
                    Noch keine Unterkategorien. Mit „+“ legst du eine an.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {rollenGruppen.map((g) => (
            <div key={g.key} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-t-lg border-b border-border bg-muted/40 px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">
                  {g.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({g.items.length})</span>
                </span>
                <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  {g.ausgaben > 0 && <span className="text-danger">{euro(g.ausgaben)}</span>}
                  {g.einnahmen > 0 && <span className="text-success">{euro(g.einnahmen)}</span>}
                  <span>{g.anzahl} Buchungen</span>
                </span>
              </div>
              <div className="divide-y divide-border">
                {g.items.map((k) => {
                  const eltern = k.parent_id ? alle.find((p) => p.id === k.parent_id) : undefined
                  return (
                    <KategorieZeile
                      key={k.id}
                      knoten={k}
                      ktx={{ ...ktxBasis, sortierung: null }}
                      tiefe={k.parent_id ? 1 : 0}
                      eingerueckt={false}
                      zeigeTyp
                      elternName={eltern?.name ?? null}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
