'use client'

import { LeerZustand } from '@/components/leer/LeerZustand'
import { ZuletztGeaendert } from '@/components/aenderungen/ZuletztGeaendert'
import type { ZuletztGeaendertInfo } from '@/lib/data/aenderungen'
import { useMemo, useState } from 'react'
import {
  Gem, Plus, ShieldCheck, Package, FileText, MapPin, ChevronLeft, ChevronRight,
  Search, LayoutGrid, List, Clock, X, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { fmtCurrency } from '@/lib/format'
import { ValuableIcon } from './ValuableIcon'
import { ValuableForm } from './ValuableForm'
import { ValuableActions } from './ValuableActions'
import { ValuableMedia } from './ValuableMedia'
import { ValuablePlinth } from './ValuablePlinth'
import { ValuableList } from './ValuableList'
import dynamic from 'next/dynamic'
import { ValuableDocuments } from './ValuableDocuments'
import {
  KATEGORIEN, kategorieLabel, wertstufe, zustandLabel, haltedauerLabel,
  vollstaendigkeit, wertAlterMonate, WERT_VERALTET_MONATE,
  type ValuableWithImage,
} from '@/lib/valuables'

// Recharts wiegt mehr als der Rest der Seite zusammen und wird erst im Detail-Panel
// gebraucht — also nachladen, statt es jedem Seitenaufruf mitzugeben.
const ValuableHistory = dynamic(
  () => import('./ValuableHistory').then(m => m.ValuableHistory),
  { ssr: false, loading: () => <div className="h-28 animate-pulse rounded-lg bg-muted/40" /> },
)

interface Props {
  items: ValuableWithImage[]
  locale: string
  canShare?: boolean
  /** Letzte Änderung je Stück (nur bei Haushalt mit Partner befüllt). */
  zuletzt?: Record<string, ZuletztGeaendertInfo>
}

type Sortierung = 'manuell' | 'wert' | 'rendite' | 'gekauft' | 'name' | 'neu'

const SORTIERUNGEN: { key: Sortierung; label: string }[] = [
  { key: 'manuell', label: 'Reihenfolge' },
  { key: 'wert',    label: 'Wert' },
  { key: 'rendite', label: 'Entwicklung' },
  { key: 'gekauft', label: 'Kaufdatum' },
  { key: 'name',    label: 'Name' },
  { key: 'neu',     label: 'Zuletzt geändert' },
]

/** Fehlende Zahlen und Daten wandern ans Ende, egal in welche Richtung sortiert wird. */
function vergleiche(a: ValuableWithImage, b: ValuableWithImage, s: Sortierung): number {
  const zahl = (x: number | null, y: number | null) =>
    x == null ? (y == null ? 0 : 1) : y == null ? -1 : y - x
  switch (s) {
    case 'wert':    return zahl(a.aktueller_wert, b.aktueller_wert)
    case 'rendite': return zahl(a.rendite_prozent, b.rendite_prozent)
    case 'gekauft': return zahl(
      a.gekauft_am ? Date.parse(a.gekauft_am) : null,
      b.gekauft_am ? Date.parse(b.gekauft_am) : null,
    )
    case 'name':    return a.name.localeCompare(b.name, 'de')
    case 'neu':     return Date.parse(b.updated_at) - Date.parse(a.updated_at)
    default:        return a.sort_order - b.sort_order
  }
}

export function InventoryClient({ items, locale, canShare = false, zuletzt }: Props) {
  const [kategorie, setKategorie] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [sortierung, setSortierung] = useState<Sortierung>('manuell')
  const [ansicht, setAnsicht] = useState<'kacheln' | 'liste'>('kacheln')
  // Nur die ID merken, nicht das Objekt.
  //
  // Vorher lag hier eine KOPIE des Gegenstands. Nach einem `router.refresh()` — also nach
  // jedem Upload, jedem Artwork, jedem Hauptbildwechsel — kam die frische Liste zwar an,
  // das Panel zeigte aber weiter den Stand von vor dem Öffnen: kein neues Foto, kein neues
  // Artwork. Schlimmer noch, ValuableMedia sah dadurch weiterhin null Fotos, blendete die
  // Vorlagen-Auswahl nicht ein und generierte ohne Vorlagenbild.
  const [offenId, setOffenId] = useState<string | null>(null)
  const offen = useMemo(
    () => items.find(i => i.id === offenId) ?? null,
    [items, offenId],
  )

  const eur = (n: number, digits = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: digits })

  // Nur Kategorien anbieten, in denen wirklich etwas liegt — eine Filterleiste mit zwölf
  // Chips, von denen zehn leere Ergebnisse liefern, ist keine Hilfe.
  const belegt = useMemo(() => {
    const anzahl = new Map<string, number>()
    for (const i of items) anzahl.set(i.kategorie, (anzahl.get(i.kategorie) ?? 0) + 1)
    return KATEGORIEN.filter(k => anzahl.has(k.key)).map(k => ({ ...k, n: anzahl.get(k.key)! }))
  }, [items])

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const treffer = items.filter(i => {
      if (kategorie && i.kategorie !== kategorie) return false
      if (!q) return true
      return [i.name, i.marke, i.modell, i.referenz, i.seriennummer, i.lagerort]
        .some(f => f?.toLowerCase().includes(q))
    })
    // `sort` ist stabil — gleiche Werte behalten ihre Reihenfolge aus der DB.
    return [...treffer].sort((a, b) => vergleiche(a, b, sortierung))
  }, [items, kategorie, suche, sortierung])

  return (
    <div className="space-y-4">
      {/* Werkzeugleiste */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {belegt.length > 1 && (
            <>
              <Chip aktiv={kategorie === null} onClick={() => setKategorie(null)}>
                Alle <span className="opacity-60">{items.length}</span>
              </Chip>
              {belegt.map(k => (
                <Chip
                  key={k.key}
                  aktiv={kategorie === k.key}
                  onClick={() => setKategorie(kategorie === k.key ? null : k.key)}
                >
                  {k.label} <span className="opacity-60">{k.n}</span>
                </Chip>
              ))}
            </>
          )}
        </div>
        <ValuableForm
          canShare={canShare}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Gegenstand anlegen
            </Button>
          }
        />
      </div>

      {/* Suche, Sortierung, Ansicht. Erst ab zwei Stücken: bei einem einzigen wäre die
          Leiste Dekoration. */}
      {items.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={suche}
              onChange={e => setSuche(e.target.value)}
              placeholder="Name, Marke, Seriennummer …"
              aria-label="Inventar durchsuchen"
              className="h-8 w-full rounded-md border border-border bg-transparent pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
            />
            {suche && (
              <button
                type="button"
                onClick={() => setSuche('')}
                aria-label="Suche leeren"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <select
            value={sortierung}
            onChange={e => setSortierung(e.target.value as Sortierung)}
            aria-label="Sortieren nach"
            className="h-8 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORTIERUNGEN.map(o => (
              <option key={o.key} value={o.key} className="bg-background text-foreground">
                {o.key === 'manuell' ? o.label : `Nach ${o.label}`}
              </option>
            ))}
          </select>
          <div className="ml-auto flex rounded-md border border-border p-0.5" role="group" aria-label="Ansicht">
            {([['kacheln', LayoutGrid, 'Kacheln'], ['liste', List, 'Liste']] as const).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setAnsicht(k)}
                aria-pressed={ansicht === k}
                aria-label={label}
                className={`rounded p-1.5 transition-colors ${
                  ansicht === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vitrine */}
      {sichtbar.length === 0 ? (
        <LeereVitrine hatObjekte={items.length > 0} canShare={canShare} />
      ) : ansicht === 'liste' ? (
        <ValuableList items={sichtbar} eur={eur} onOpen={setOffenId} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {sichtbar.map(item => (
            <Karte key={item.id} item={item} eur={eur} onOpen={() => setOffenId(item.id)} />
          ))}
        </div>
      )}

      {/* Detail */}
      <Sheet open={offen !== null} onOpenChange={o => { if (!o) setOffenId(null) }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {offen && <Detail item={offen} eur={eur} locale={locale} zuletzt={zuletzt?.[offen.id]} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Karte ─────────────────────────────────────────────────────────────────────

/**
 * Ein Slot in der Vitrine.
 *
 * Das Spielgefühl kommt aus Rahmen, Sockelschimmer und dem Sheen beim Überfahren — nicht
 * aus Farbe. Alles Farbige stammt aus Theme-Tokens (siehe WERTSTUFEN in lib/valuables.ts),
 * damit die Karte unter allen acht Presets funktioniert.
 *
 * Die Kachel ist in zwei Hälften gebaut, wie eine echte Vitrinenposition: oben das Podest
 * mit dem Objekt, unten der Sockel mit der Beschriftung (siehe ValuablePlinth). Vorher war
 * die untere Hälfte nackte Kartenfläche mit zwei Textzeilen darauf — Ausstellung oben,
 * Tabelle unten.
 */
function Karte({
  item, eur, onOpen,
}: {
  item: ValuableWithImage
  eur: (n: number, digits?: number) => string
  onOpen: () => void
}) {
  const stufe = wertstufe(item.aktueller_wert)
  // Erst ab „Wertvoll" trägt die Kachel die Stufenfarbe — darunter ist der Rahmen eine
  // Haarlinie, damit die Auszeichnung etwas bedeutet.
  const ausgezeichnet = stufe.key === 'wertvoll' || stufe.key === 'sammlerstueck'
  const prunk = stufe.key === 'sammlerstueck'
  const reg = vollstaendigkeit(item)
  const alter = wertAlterMonate(item)
  const veraltet = alter !== null && alter >= WERT_VERALTET_MONATE

  // Das Bild fuellt die Flaeche bis an die Kartenkante. Variante „Bild als aufgelegte Karte
  // mit Rand" wurde im Vergleich verworfen: die sichtbare Bildkante liess es in der Kachel
  // haengen. Der Zuschnitt (`object-cover`) kappt dafuer bei ungeschickten Formaten den Rand.
  const bildKlasse =
    'absolute inset-0 size-full object-cover will-change-[opacity,transform] motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]'

  // Blättern direkt in der Vitrine, ohne das Detail zu öffnen. Nur Bilder mit URL — eine
  // abgelaufene Signatur wäre sonst eine leere Position im Karussell.
  const bilder = useMemo(() => item.bilder.filter(b => b.url), [item.bilder])
  const [index, setIndex] = useState(0)
  // Nach dem Löschen eines Bildes kann der Index ins Leere zeigen.
  const sicher = bilder.length > 0 ? Math.min(index, bilder.length - 1) : 0
  const aktuell = bilder[sicher]?.url ?? item.anzeige_url
  const mehrere = bilder.length > 1

  // Die Karte ist ein <div> mit einer flächigen Schaltfläche darunter, kein <button> um
  // alles. Ein Button in einem Button ist ungültiges HTML, und die Pfeile zum Blättern
  // müssen anklickbar sein, ohne das Detail-Panel zu öffnen.
  const blaettern = (richtung: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation()
    setIndex(i => {
      const n = bilder.length
      return n === 0 ? 0 : (((i + richtung) % n) + n) % n
    })
  }

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border bg-card text-left transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_14px_32px_-14px_var(--tier)] focus-within:ring-2 focus-within:ring-ring"
      style={{
        borderColor: ausgezeichnet ? stufe.border : 'var(--border)',
        // Schattenfarbe beim Anheben: Stufenfarbe, sonst ein neutrales Grau.
        '--tier': ausgezeichnet ? stufe.border : 'color-mix(in srgb, var(--foreground) 30%, transparent)',
      } as React.CSSProperties}
      onPointerMove={e => {
        // Das Licht folgt dem Zeiger. Direkt als CSS-Variable gesetzt, nicht als State: ein
        // Re-Render pro Mausbewegung waere fuer einen Schimmer zu teuer.
        const r = e.currentTarget.getBoundingClientRect()
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${item.name} öffnen`}
        className="absolute inset-0 z-0 cursor-pointer focus:outline-none"
      />

      {/* Sockel. `pointer-events-none`, damit Klicks auf die Fläche darunter durchgehen —
          die Blätter-Pfeile holen sich ihre Klickbarkeit einzeln zurück. */}
      <div
        className="pointer-events-none relative aspect-[4/5] overflow-hidden"
        style={{
          // Randlos bis an die Kartenkante: das Bild stand vorher als Kasten im Kasten.
          // Hintergrund = Vitrinenrueckwand: oben ein Strahler, unten die Stufenfarbe als
          // Schimmer, darunter die Kartenflaeche.
          background: [
            'radial-gradient(70% 55% at 50% 22%, color-mix(in srgb, var(--foreground) 9%, transparent), transparent 75%)',
            `radial-gradient(90% 45% at 50% 108%, ${prunk || ausgezeichnet ? stufe.glow : 'color-mix(in srgb, var(--foreground) 5%, transparent)'}, transparent 70%)`,
            'color-mix(in srgb, var(--muted) 45%, var(--card))',
          ].join(','),
        }}
      >
        {/* Die Hover-Vergrösserung sitzt auf dem Rahmen, nicht auf dem Bild: die Bilder
            tragen ihre eigene Transformation für den Wechsel, und zwei `transform` auf
            demselben Element würden sich gegenseitig überschreiben. */}
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:scale-[1.05]">
          {bilder.length > 0 ? (
            // Alle Bilder liegen übereinander und werden über Deckkraft und Versatz
            // ein- und ausgeblendet. Sie erst beim Blättern zu laden hiesse, bei jedem
            // Klick ein Aufblitzen zu sehen — bei WebP von rund 150 KB kostet das
            // Vorhalten weniger als der Ruckler kosten würde.
            bilder.map((b, i) => {
              const abstand = i - sicher
              return (
                // Bewusst <img> statt next/image: die URL ist eine signierte Storage-URL
                // mit Ablaufdatum. Sie durch den Optimizer zu schicken hiesse, jede
                // Signatur zu cachen — der Eintrag überlebt die Signatur und liefert
                // danach 400.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={b.id}
                  src={b.url!}
                  alt={i === sicher ? item.name : ''}
                  aria-hidden={i !== sicher}
                  loading={i === 0 ? undefined : 'lazy'}
                  decoding="async"
                  className={bildKlasse}
                  style={{
                    // Nachbarn warten seitlich in Blätterrichtung und leicht verkleinert —
                    // das macht aus dem Überblenden eine erkennbare Bewegung, ohne dass
                    // etwas über den Rahmen hinausschiebt.
                    opacity: abstand === 0 ? 1 : 0,
                    transform:
                      abstand === 0
                        ? 'translateX(0) scale(1)'
                        : `translateX(${abstand * 14}%) scale(0.94)`,
                    pointerEvents: 'none',
                  }}
                />
              )
            })
          ) : aktuell ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={aktuell}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className={bildKlasse}
            />
          ) : (
            <ValuableIcon
              kategorie={item.kategorie}
              className="absolute inset-0 m-auto size-1/3 text-muted-foreground/40"
            />
          )}
        </div>

        {mehrere && (
          <>
            <button
              type="button"
              onClick={blaettern(-1)}
              aria-label="Vorheriges Bild"
              className="pointer-events-auto absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={blaettern(1)}
              aria-label="Nächstes Bild"
              className="pointer-events-auto absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <ChevronRight className="size-3.5" />
            </button>

            {/* Punkte immer sichtbar, nicht erst beim Überfahren: sie sind der Hinweis
                darauf, dass es überhaupt mehr als ein Bild gibt. */}
            <div className="absolute inset-x-0 bottom-1.5 z-10 flex justify-center gap-1">
              {bilder.map((b, i) => (
                <span
                  key={b.id}
                  className={`size-1.5 rounded-full transition-colors ${
                    i === sicher ? 'bg-foreground/70' : 'bg-foreground/25'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Zeigerlicht — ein weicher Lichtkegel, der dem Mauszeiger folgt. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(200px circle at var(--mx, 50%) var(--my, 30%), color-mix(in srgb, var(--foreground) 11%, transparent), transparent 70%)',
          }}
        />

        {/* Stufe als Plakette im Bild, nicht als Zeile im Text. */}
        {ausgezeichnet && (
          <span
            className="absolute left-3 top-3 z-10 rounded-full border bg-background/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-foreground/90 backdrop-blur-sm"
            style={{ borderColor: stufe.border }}
          >
            {stufe.label}
          </span>
        )}
      </div>

      {/* Sockel mit Beschriftung. Er lässt Klicks durch (siehe ValuablePlinth) — sie
          gehören der flächigen Schaltfläche darunter, die die Kachel öffnet. */}
      <ValuablePlinth id={`fries-${item.id}`} akzent={stufe.border} prunk={prunk}>
        <div className="space-y-0.5">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.marke ?? kategorieLabel(item.kategorie)}
          </p>
        </div>

        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold leading-none tabular-nums tracking-tight">
            {item.aktueller_wert != null ? eur(item.aktueller_wert) : '—'}
          </span>
          {/* Null Prozent wird nicht angezeigt: frisch angelegt ist der aktuelle Wert der
              Kaufpreis, und ein „+0 %" an jeder neuen Karte sieht aus wie ein Fehler statt
              wie „noch keine Wertentwicklung". */}
          {item.rendite_prozent != null && item.rendite_prozent !== 0 && (
            <span
              className={`text-[11px] font-medium tabular-nums ${
                item.rendite_prozent > 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {item.rendite_prozent > 0 ? '+' : ''}{item.rendite_prozent} %
            </span>
          )}
        </div>

        {/* Statusmarken. Nur was zutrifft — leere Plätze wären nur Rauschen. */}
        <div className="mt-2 flex items-center gap-1.5">
          {item.versichert && (
            <span title="Versichert" className="text-muted-foreground">
              <ShieldCheck className="size-3.5" />
            </span>
          )}
          <span
            title={
              item.dokument_anzahl > 0
                ? `${item.dokument_anzahl} ${item.dokument_anzahl === 1 ? 'Beleg' : 'Belege'} hinterlegt`
                : 'Noch kein Beleg — im Detail hochladen'
            }
            className={`flex items-center gap-0.5 text-[10px] tabular-nums ${
              item.dokument_anzahl > 0 ? 'text-muted-foreground' : 'text-muted-foreground/40'
            }`}
          >
            <Paperclip className="size-3.5" />
            {item.dokument_anzahl > 0 && item.dokument_anzahl}
          </span>
          {veraltet && (
            <span title={`Wert seit ${alter} Monaten nicht aktualisiert`} className="text-muted-foreground">
              <Clock className="size-3.5" />
            </span>
          )}
          {!item.im_vermoegen && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              nicht in Summe
            </span>
          )}
          {/* Register-Vollständigkeit: ein Strich, sichtbar erst, wenn etwas fehlt. */}
          {reg.fehlt.length > 0 && (
            <span
              title={`Fehlt: ${reg.fehlt.join(', ')}`}
              className="ml-auto flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
            >
              <span className="h-1 w-8 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground/40" style={{ width: `${reg.prozent}%` }} />
              </span>
              {reg.prozent} %
            </span>
          )}
        </div>
      </ValuablePlinth>
    </div>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────────

function Detail({
  item, eur, locale, zuletzt,
}: {
  item: ValuableWithImage
  zuletzt?: ZuletztGeaendertInfo
  eur: (n: number, digits?: number) => string
  locale: string
}) {
  const datum = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }) : null

  const delta =
    item.kaufpreis != null && item.aktueller_wert != null
      ? item.aktueller_wert - item.kaufpreis
      : null

  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.name}</SheetTitle>
        <SheetDescription>
          {[item.marke, item.modell, item.referenz].filter(Boolean).join(' · ') ||
            kategorieLabel(item.kategorie)}
        </SheetDescription>
        <ZuletztGeaendert info={zuletzt} className="px-0" />
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6">
        {/* Bilder — Hauptbild, Galerie, Upload und Artwork */}
        <ValuableMedia item={item} />

        {/* Statblock */}
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          <Zeile label="Aktueller Wert" value={item.aktueller_wert != null ? eur(item.aktueller_wert, 2) : '—'} stark />
          <Zeile label="Kaufpreis" value={item.kaufpreis != null ? eur(item.kaufpreis, 2) : '—'} />
          {delta !== null && (
            <Zeile
              label="Differenz"
              value={`${delta >= 0 ? '+' : ''}${eur(delta, 2)}${
                item.rendite_prozent != null ? `  (${item.rendite_prozent >= 0 ? '+' : ''}${item.rendite_prozent} %)` : ''
              }`}
              className={delta >= 0 ? 'text-success' : 'text-danger'}
            />
          )}
          <Zeile label="Gekauft" value={datum(item.gekauft_am) ?? '—'} />
          <Zeile label="Im Besitz" value={haltedauerLabel(item.gekauft_am) ?? '—'} />
          <Zeile label="Zustand" value={zustandLabel(item.zustand) ?? '—'} />
          <Zeile label="Kategorie" value={kategorieLabel(item.kategorie)} />
          {item.wert_stand && (
            <Zeile
              label="Wert vom"
              value={`${datum(item.wert_stand)}${item.wert_quelle ? ` · ${item.wert_quelle}` : ''}`}
            />
          )}
        </div>

        {/* Ausstattung — die Frage, die beim Wiederverkauf als Erstes kommt. */}
        <div className="flex flex-wrap gap-2">
          <Marke an={item.box_vorhanden} icon={<Package className="size-3.5" />} label="Box" />
          <Marke an={item.papiere_vorhanden} icon={<FileText className="size-3.5" />} label="Papiere" />
          <Marke an={item.versichert} icon={<ShieldCheck className="size-3.5" />} label="Versichert" />
        </div>

        {/* Belege direkt unter Box und Papiere — wer „Papiere fehlen" liest, soll sie hier
            gleich hochladen können. */}
        <ValuableDocuments valuableId={item.id} />

        <ValuableHistory
          valuableId={item.id}
          kaufpreis={item.kaufpreis}
          gekauftAm={item.gekauft_am}
          locale={locale}
          refreshKey={`${item.aktueller_wert}-${item.wert_stand}`}
        />

        {/* Register — der eigentliche Zweck der Seite. */}
        {(item.seriennummer || item.lagerort || item.kaufquelle || item.versicherungsnummer) && (
          <div className="rounded-lg border border-border divide-y divide-border text-sm">
            {item.seriennummer && <Zeile label="Seriennummer" value={item.seriennummer} mono />}
            {item.lagerort && (
              <Zeile
                label="Lagerort"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {item.lagerort}
                  </span>
                }
              />
            )}
            {item.kaufquelle && <Zeile label="Gekauft bei" value={item.kaufquelle} />}
            {item.versicherungsnummer && <Zeile label="Police" value={item.versicherungsnummer} mono />}
          </div>
        )}

        {item.notizen && (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notizen</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.notizen}</p>
          </div>
        )}

        {!item.im_vermoegen && (
          <p className="text-xs text-muted-foreground">
            Zählt nicht in den Sammlungswert oben.
          </p>
        )}

        <ValuableActions item={item} />
      </div>
    </>
  )
}

// ── Bausteine ─────────────────────────────────────────────────────────────────

function Zeile({
  label, value, stark, mono, className = '',
}: {
  label: string
  value: React.ReactNode
  stark?: boolean
  mono?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-right tabular-nums ${stark ? 'text-base font-semibold' : 'text-sm'} ${
          mono ? 'font-mono text-xs' : ''
        } ${className}`}
      >
        {value}
      </span>
    </div>
  )
}

function Marke({ an, icon, label }: { an: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        an
          ? 'border-border bg-muted/40 text-foreground'
          : 'border-dashed border-border/60 text-muted-foreground/60'
      }`}
    >
      {icon}
      {label}
      {!an && <span className="text-[10px]">fehlt</span>}
    </span>
  )
}

function Chip({
  aktiv, onClick, children,
}: {
  aktiv: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        aktiv
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

function LeereVitrine({ hatObjekte, canShare }: { hatObjekte: boolean; canShare: boolean }) {
  if (!hatObjekte) {
    return (
      <LeerZustand
        icon={Gem}
        titel="Die Vitrine ist leer"
        text="Das Inventar ist dein Register für Uhren, Schmuck und andere Wertstücke: Seriennummer, Kaufbeleg, Versicherung und geschätzter Wert an einem Ort. Leg den ersten Gegenstand an; später ist das schwerer zusammenzusuchen als heute."
        aktionNode={
          <ValuableForm
            canShare={canShare}
            trigger={
              <Button>
                <Plus className="size-4" />
                Gegenstand anlegen
              </Button>
            }
          />
        }
      />
    )
  }
  return (
    <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
      <Gem className="mx-auto size-8 text-muted-foreground/40" />
      <p className="mt-3 text-sm font-medium text-foreground">Nichts in dieser Kategorie</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Wähle oben eine andere Kategorie.</p>
    </div>
  )
}
