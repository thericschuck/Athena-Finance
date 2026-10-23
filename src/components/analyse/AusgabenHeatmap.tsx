'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AnalyseMode, HeatmapDay } from '@/lib/analyseData'
import { useClampedPosition } from '@/lib/hooks/use-clamped-position'
import { useOptionalUrlFilters } from '@/components/providers/url-filters'
import { baueRaster, hatBetrag, zellenIndex, type HeatmapZelle } from '@/lib/analyse/heatmap'
import { ModeSwitch, ANALYSE_MODE_OPTIONS } from './ModeSwitch'

interface Props {
  data: HeatmapDay[]
  initialMode?: Mode
  /**
   * Heutiges Datum (YYYY-MM-DD, deutsche Zeit) vom Server. Ohne: Uhr des Geraets. Mit der Uhr
   * rechneten Server (UTC) und Browser nachts zwischen 0 und 2 Uhr mit verschiedenen Tagen —
   * ein Hydration-Fehler. Die Landingpage-Demo kommt ohne aus.
   */
  heute?: string
}

// Der Typ liegt jetzt bei den geteilten Analyse-Typen, weil Heatmap UND
// Verteilungs-Karte auf denselben drei Sichten umschalten. Das Alias bleibt,
// damit `type Mode as HeatmapMode` in analyse/page.tsx weiter funktioniert.
export type Mode = AnalyseMode

const MONTH_LABELS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const DAY_LABELS   = ['Mo', '', 'Mi', '', 'Fr', '', '']

// Stufen als color-mix() von --muted (neutral) zur Theme-Farbe --chart-expense
// / --chart-income (siehe globals.css) statt fester Gold-/Oliv-Hex-Werte —
// jedes Theme-Preset bekommt so seine eigene Heatmap-Skala statt überall
// Aurums Gold/Oliv zu zeigen. 0 = keine Aktivität, 5 = sehr hoch.
function mixScale(color: string, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) =>
    `color-mix(in srgb, ${color} ${Math.round((i / (steps - 1)) * 100)}%, var(--muted) ${Math.round((1 - i / (steps - 1)) * 100)}%)`,
  )
}
const EXP_COLORS = mixScale('var(--chart-expense)', 6)
const INC_COLORS = mixScale('var(--chart-income)', 6)
// GuV-Skala: -5 (hohe Ausgaben) → 0 (neutral) → +5 (hohe Einnahmen), jeweils
// zur Theme-Farbe hin abgestuft statt fester Terrakotta-/Oliv-Werte.
const GUV_COLORS = [
  ...mixScale('var(--chart-expense)', 6).slice(1).reverse(), // -5 .. -1
  'var(--muted)',                                            //  0: neutral
  ...mixScale('var(--chart-income)', 6).slice(1),             // +1 .. +5
]

const SCALE: Record<Mode, string[]> = { ausgaben: EXP_COLORS, einnahmen: INC_COLORS, guv: GUV_COLORS }

const eur = (n: number) => `${n.toLocaleString('de-DE')} €`

/** Heutiges Datum aus den LOKALEN Teilen — `toISOString()` liefert nach Mitternacht den Vortag. */
function heuteLokal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function langesDatum(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

/** Beträge eines Tages je Ansicht, in der Reihenfolge Ausgaben, Einnahmen, Netto. */
function TagesZeilen({ zelle, mode }: { zelle: HeatmapZelle; mode: Mode }) {
  const netto = zelle.income - zelle.amount
  return (
    <>
      {(mode === 'ausgaben' || mode === 'guv') && zelle.amount > 0 && (
        <p className="font-semibold text-(--chart-expense) tabular-nums">Ausgaben: {eur(zelle.amount)}</p>
      )}
      {(mode === 'einnahmen' || mode === 'guv') && zelle.income > 0 && (
        <p className="font-semibold text-(--chart-income) tabular-nums">Einnahmen: {eur(zelle.income)}</p>
      )}
      {mode === 'guv' && hatBetrag(zelle, 'guv') && (
        <p className={`font-bold mt-0.5 tabular-nums ${netto >= 0 ? 'text-(--chart-income)' : 'text-(--chart-expense)'}`}>
          Netto: {netto >= 0 ? '+' : ''}{eur(netto)}
        </p>
      )}
    </>
  )
}

interface TipState { zelle: HeatmapZelle; x: number; y: number }

export function AusgabenHeatmap({ data, initialMode = 'ausgaben', heute }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tip, setTip]   = useState<TipState | null>(null)
  const { ref: tipRef, style: tipStyle } = useClampedPosition(tip ? { x: tip.x, y: tip.y } : null)
  // Optional: dieselbe Heatmap laeuft als Demo auf der Landingpage, ohne Provider — dort ist sie nicht anklickbar.
  const filters = useOptionalUrlFilters()
  const gewaehlterTag = filters?.get('tag') ?? null

  const scrollRef = useRef<HTMLDivElement>(null)
  const [linksMehr, setLinksMehr] = useState(false)

  const { wochen, monatsMarken } = useMemo(() => baueRaster(data, heute ?? heuteLokal()), [data, heute])
  const nachTag = useMemo(() => {
    const m = new Map<string, HeatmapZelle>()
    for (const w of wochen) for (const z of w) if (z) m.set(z.date, z)
    return m
  }, [wochen])
  const gewaehlteZelle = gewaehlterTag ? nachTag.get(gewaehlterTag) ?? null : null

  // Start am rechten Ende: dort liegen die aktuellen Wochen. Auf dem Desktop passt alles in
  // die Karte, dann ist scrollWidth == clientWidth und nichts passiert.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    setLinksMehr(el.scrollLeft > 4)
  }, [])

  const farben = SCALE[mode]
  const modeLabel = mode === 'ausgaben' ? 'Ausgaben' : mode === 'einnahmen' ? 'Einnahmen' : 'GuV'

  function waehleTag(z: HeatmapZelle) {
    if (gewaehlterTag === z.date) {
      filters?.set('tag', null)
      return
    }
    filters?.set('tag', z.date)
    // Die Buchungen stehen am Seitenende — ohne Sprung merkt man auf dem Handy nicht, dass
    // der Tipp etwas bewirkt hat. Beim Aufheben bleibt die Ansicht stehen.
    document.getElementById('buchungen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium text-foreground">{modeLabel}-Heatmap</h2>
        <ModeSwitch value={mode} options={ANALYSE_MODE_OPTIONS} onChange={setMode} />
      </div>

      {/* Grid. Relativ, damit der Verlaufshinweis am linken Rand über dem Scroll-Container liegt. */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={e => setLinksMehr(e.currentTarget.scrollLeft > 4)}
          className="overflow-x-auto pb-1 overscroll-x-contain"
        >
          <div className="flex gap-0.75 w-max">
            {/* Tageskürzel bleiben beim Scrollen stehen (sticky), sonst weiß man nach dem
                Wischen nicht mehr, welche Zeile Montag ist. */}
            <div className="sticky left-0 z-10 flex flex-col gap-0.75 pr-1.5 shrink-0 bg-card">
              <div className="h-5" />
              {DAY_LABELS.map((lbl, i) => (
                <div key={i} className="h-3.5 sm:h-3 w-6 flex items-center text-[11px] font-medium text-muted-foreground">{lbl}</div>
              ))}
            </div>

            {wochen.map((woche, wi) => (
              <div key={wi} className="flex flex-col gap-0.75 shrink-0">
                <div className="h-5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap leading-5">
                  {monatsMarken.has(wi) ? MONTH_LABELS[monatsMarken.get(wi)!] : ''}
                </div>
                {woche.map((zelle, di) => {
                  if (!zelle) return <div key={di} className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                  const aktiv = zelle.date === gewaehlterTag
                  return (
                    <button
                      key={di}
                      type="button"
                      // Ein Tab-Stopp je Zelle wären 364 — die Heatmap ist eine Zeigerfläche, die
                      // Tastatur-Variante ist der Kalender darunter.
                      tabIndex={-1}
                      aria-label={`${langesDatum(zelle.date)}: ${hatBetrag(zelle, mode) ? 'Buchungen anzeigen' : 'keine Umsätze'}`}
                      aria-pressed={aktiv}
                      className={`block w-3.5 h-3.5 sm:w-3 sm:h-3 rounded-[2px] p-0 cursor-pointer transition-opacity ${
                        aktiv ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card relative z-[1]' : ''
                      }`}
                      // Mit Auswahl treten alle anderen Tage zurück, statt zu verschwinden.
                      style={{
                        background: farben[zellenIndex(zelle, mode)],
                        opacity: gewaehlterTag && !aktiv ? 0.4 : 1,
                      }}
                      onClick={() => waehleTag(zelle)}
                      // Hover-Karte nur mit der Maus: auf Touch feuert pointerenter beim Tippen,
                      // und die Karte bliebe dann hängen. Dort zeigt die Detailzeile den Tag.
                      onPointerEnter={e => {
                        if (e.pointerType !== 'mouse') return
                        setTip({ zelle, x: e.clientX, y: e.clientY })
                      }}
                      onPointerLeave={() => setTip(null)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        {/* Weicher Rand + Pfeil: es gibt links noch ältere Wochen. Verschwindet am linken Anschlag. */}
        {linksMehr && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-6 w-8 bg-linear-to-r from-card to-transparent sm:hidden"
          />
        )}
      </div>

      {/* Detailzeile: der angetippte Tag (auf dem Handy der Ersatz für den Hover). */}
      <div className="mt-3 min-h-10 text-xs" aria-live="polite">
        {gewaehlteZelle ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground mb-0.5">{langesDatum(gewaehlteZelle.date)}</p>
              {hatBetrag(gewaehlteZelle, mode)
                ? <TagesZeilen zelle={gewaehlteZelle} mode={mode} />
                : <p className="text-muted-foreground">Kein Umsatz in dieser Ansicht</p>}
            </div>
            <button
              type="button"
              onClick={() => filters?.set('tag', null)}
              className="shrink-0 rounded px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Auswahl aufheben
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/80">
            Tag antippen, um seine Buchungen unten zu sehen.
            {linksMehr && <span className="sm:hidden"> Nach rechts wischen für neuere, nach links für ältere Wochen.</span>}
          </p>
        )}
      </div>

      {/* Legende */}
      <div className="flex items-center justify-end gap-3 mt-2">
        {mode !== 'guv' ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">wenig</span>
            {farben.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[11px] text-muted-foreground">viel</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-(--chart-expense)">Ausgaben</span>
            {farben.map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[11px] text-(--chart-income)">Einnahmen</span>
          </div>
        )}
      </div>

      {/* Tooltip (nur Maus) */}
      {tip && (
        <div
          ref={tipRef}
          className="fixed z-50 pointer-events-none rounded-lg border border-border bg-popover p-2.5 shadow-xl text-xs"
          style={tipStyle}
        >
          <p className="text-muted-foreground mb-1">{langesDatum(tip.zelle.date)}</p>
          <TagesZeilen zelle={tip.zelle} mode={mode} />
        </div>
      )}
    </div>
  )
}
