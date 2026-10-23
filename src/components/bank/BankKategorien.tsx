'use client'

import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ListFilter, Minus } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { fmtCurrency } from '@/lib/format'
import {
  baueKategorien, vorperiodenFlows,
  type KategorieZeile, type KategorienModus,
} from '@/lib/bank/kategorien'
import type { BankAbschnittProps } from '@/lib/bank/typen'

/**
 * Einnahmen/Ausgaben nach Hauptkategorie: Kopfzahl, ein gestapelter Anteilsbalken und darunter
 * dieselben Kategorien als Liste (gleiche Reihenfolge wie der Balken, wie in chart-reihenfolge.ts
 * gefordert: das Auge soll nicht zwischen Bild und Legende springen). Bewusst kein Recharts: ein
 * einzelner Anteilsbalken aus Flex-Segmenten ist schaerfer, barrierefreier und braucht kein
 * Messen der Breite.
 *
 * Klick auf eine Zeile klappt die Unterkategorien auf; der Button „Buchungen" setzt den
 * URL-Filter `kat`, den die Buchungsliste auswertet. „Ohne Kategorie" setzt direkt `kat=offen`.
 */

/** Farbe fuer Kategorien ohne eigene Farbe: Theme-Palette der Reihe nach, 6 Stueck. */
const palette = (i: number) => `var(--chart-cat-${(i % 6) + 1})`
const FARBE_OHNE = 'var(--danger)'
const FARBE_WEITERE = 'var(--chart-muted-2)'

const WEITERE_KEY = '__weitere__'

function prozent(anteil: number, locale: string): string {
  const p = anteil * 100
  return `${p.toLocaleString(locale, { maximumFractionDigits: p < 10 ? 1 : 0, minimumFractionDigits: 0 })} %`
}

/**
 * Veraenderung zur Vorperiode. Bei Ausgaben ist ein Anstieg schlecht (rot), bei Einnahmen gut
 * (gruen); unter 1 % gilt als unveraendert. Farbe ist nie das einzige Signal: Pfeil + Zahl.
 */
function Delta({
  pct, modus, locale, neu,
}: { pct: number | null; modus: KategorienModus; locale: string; neu?: boolean }) {
  if (pct === null) {
    return neu
      ? <span className="text-[11px] text-muted-foreground">neu</span>
      : <span className="text-[11px] text-muted-foreground" aria-label="kein Vergleich">–</span>
  }
  if (Math.abs(pct) < 0.01) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
        <Minus className="size-3" aria-hidden /> 0 %
      </span>
    )
  }
  const steigt = pct > 0
  const gut = modus === 'einnahmen' ? steigt : !steigt
  const Icon = steigt ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${gut ? 'text-success' : 'text-danger'}`}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{steigt ? 'plus' : 'minus'}</span>
      {Math.abs(pct * 100).toLocaleString(locale, { maximumFractionDigits: 0 })} %
    </span>
  )
}

/**
 * Erklaerung beim Ueberfahren statt des nackten Browser-Tooltips: Titel, ein paar Zahlen und
 * ein Satz, was die Zahl ist. Rein ueber CSS (`group-hover` und `group-focus-within`), damit sie
 * auch per Tastatur erreichbar ist (der Inhalt ist fokussierbar).
 */
function HoverInfo({
  titel, zeilen, text, children,
}: { titel: string; zeilen: [string, string][]; text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-baseline" tabIndex={0}>
      <span className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">{children}</span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-popover p-3 text-xs font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="block font-medium">{titel}</span>
        {zeilen.map(([k, v]) => (
          <span key={k} className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold tabular-nums">{v}</span>
          </span>
        ))}
        <span className="mt-2 block leading-snug text-muted-foreground">{text}</span>
      </span>
    </span>
  )
}

export function BankKategorien({ daten, scope }: BankAbschnittProps) {
  const [modus, setModus] = useState<KategorienModus>('ausgaben')
  const [offen, setOffen] = useState<string | null>(null)
  const [weitereOffen, setWeitereOffen] = useState(false)
  // Segment oder Zeile unter dem Zeiger: markiert beides gemeinsam (Balken <-> Liste).
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const filters = useUrlFilters()
  const aktiveKat = filters.get('kat')
  const { locale } = daten

  const vorRows = useMemo(() => vorperiodenFlows(daten, scope), [daten, scope])
  const ansicht = useMemo(
    () => baueKategorien(scope.flows, vorRows, daten.include, modus),
    [scope.flows, vorRows, daten.include, modus],
  )

  const farbeVon = useMemo(() => {
    const byId = new Map(daten.categories.map(c => [c.id, c]))
    const map = new Map<string, string>()
    let i = 0
    for (const z of [...ansicht.zeilen, ...ansicht.weitere]) {
      if (z.ohneKategorie) { map.set(z.schluessel, FARBE_OHNE); continue }
      map.set(z.schluessel, (z.id && byId.get(z.id)?.color) || palette(i))
      i++
    }
    return map
  }, [ansicht, daten.categories])
  const symbolVon = (z: KategorieZeile) => (z.id ? daten.categories.find(c => c.id === z.id)?.icon ?? null : null)

  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const hatVergleich = ansicht.vorTotal !== null
  const maxAnteil = Math.max(...ansicht.zeilen.map(z => z.anteil), ansicht.weitereBetrag / (ansicht.total || 1), 0.0001)

  const setzeKat = (id: string | null) => {
    const wert = id ?? 'offen'
    filters.set('kat', aktiveKat === wert ? null : wert)
  }

  const umschalter = (
    <div role="group" aria-label="Art der Kategorien" className="inline-flex rounded-md bg-muted p-0.5">
      {(['ausgaben', 'einnahmen'] as const).map(m => (
        <button
          key={m}
          type="button"
          aria-pressed={modus === m}
          onClick={() => { setModus(m); setOffen(null); setWeitereOffen(false) }}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            modus === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {m === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'}
        </button>
      ))}
    </div>
  )

  const kopf = (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {modus === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} nach Kategorie
        </p>
        {ansicht.anzahl > 0 && (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <HoverInfo
              titel={`${modus === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} gesamt`}
              zeilen={[
                ['Summe', euro(ansicht.total, 2)],
                ['Kategorien', String(ansicht.anzahl)],
              ]}
              text={`Summe aller ${modus === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'} der Hauptkategorien im gewählten Zeitraum${
                daten.konto ? ' und Konto' : ''}${daten.monat ? ' (ein Monat)' : ''}. ${
                daten.include.anlage || daten.include.forderung
                  ? 'Anlagen und Forderungen zählen mit, solange der Schalter an ist.'
                  : 'Anlagen und Forderungen sind ausgeblendet.'}`}
            >
              <span className="text-2xl font-semibold tabular-nums">{euro(ansicht.total)}</span>
            </HoverInfo>
            <span className="text-xs text-muted-foreground">
              {ansicht.anzahl} {ansicht.anzahl === 1 ? 'Kategorie' : 'Kategorien'}
            </span>
            {hatVergleich && (
              <HoverInfo
                titel="Vergleich mit der Vorperiode"
                zeilen={[
                  ['Jetzt', euro(ansicht.total, 2)],
                  ['Vorperiode', euro(ansicht.vorTotal ?? 0, 2)],
                  ['Differenz', `${ansicht.total - (ansicht.vorTotal ?? 0) >= 0 ? '+' : '−'}${euro(Math.abs(ansicht.total - (ansicht.vorTotal ?? 0)), 2)}`],
                ]}
                text="Die Vorperiode ist gleich lang und liegt direkt davor (auf Monatsebene). Der laufende Monat ist noch nicht voll, der Vergleich fällt dann zu niedrig aus."
              >
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Delta pct={ansicht.deltaPct} modus={modus} locale={locale} />
                  zur Vorperiode ({euro(ansicht.vorTotal ?? 0)})
                </span>
              </HoverInfo>
            )}
          </div>
        )}
      </div>
      {umschalter}
    </div>
  )

  if (ansicht.anzahl === 0) {
    return (
      <section aria-label="Kategorien" className="rounded-lg border border-border bg-card p-4 sm:p-5">
        {kopf}
        <p className="py-8 text-center text-sm text-muted-foreground">
          {modus === 'ausgaben' ? 'Keine Ausgaben im aktuellen Filter.' : 'Keine Einnahmen im aktuellen Filter.'}
        </p>
      </section>
    )
  }

  // Segmente des Balkens: dieselbe Reihenfolge wie die Liste, „Weitere" am Ende.
  const segmente = [
    ...ansicht.zeilen.map(z => ({
      key: z.schluessel, name: z.name, anteil: z.anteil, farbe: farbeVon.get(z.schluessel)!,
      betrag: z.betrag, deltaPct: z.deltaPct, vorBetrag: z.vorBetrag,
      unter: z.kinder.filter(k => !k.direkt).length, namen: [] as string[],
    })),
    ...(ansicht.weitere.length > 0
      ? [{
          key: WEITERE_KEY, name: `Weitere (${ansicht.weitere.length})`, anteil: ansicht.weitereBetrag / ansicht.total,
          farbe: FARBE_WEITERE, betrag: ansicht.weitereBetrag, deltaPct: ansicht.weitereDeltaPct, vorBetrag: null as number | null,
          unter: 0, namen: ansicht.weitere.map(w => w.name),
        }]
      : []),
  ]
  // Mittelpunkt jedes Segments in Prozent der Balkenbreite, fuer die Position der Hover-Karte.
  let summeVorher = 0
  const mitte = new Map(segmente.map(s => {
    const m = (summeVorher + s.anteil / 2) * 100
    summeVorher += s.anteil
    return [s.key, Math.min(88, Math.max(12, m))] as const
  }))
  const hoverSegment = segmente.find(s => s.key === hoverKey) ?? null

  const buchungenKnopf = (z: { id: string | null; name: string }) => {
    const wert = z.id ?? 'offen'
    const aktiv = aktiveKat === wert
    return (
      <button
        type="button"
        aria-pressed={aktiv}
        aria-label={`Buchungen zu ${z.name} ${aktiv ? 'nicht mehr filtern' : 'anzeigen'}`}
        title={aktiv ? 'Filter aufheben' : 'Buchungen dieser Kategorie anzeigen'}
        onClick={() => setzeKat(z.id)}
        className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors ${
          aktiv ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <ListFilter className="size-3" aria-hidden />
        <span className="hidden sm:inline">Buchungen</span>
      </button>
    )
  }

  const zeile = (z: KategorieZeile, klein = false) => {
    const farbe = farbeVon.get(z.schluessel) ?? palette(0)
    const symbol = symbolVon(z)
    const echteKinder = z.kinder.filter(k => !k.direkt).length > 0
    const aufklappbar = !z.ohneKategorie && (echteKinder || z.kinder.length > 1)
    const istOffen = offen === z.schluessel
    const panelId = `bank-kat-${z.schluessel}`

    const inhalt = (
      <>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: farbe }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {symbol && <span aria-hidden>{symbol}</span>}
            <span className={`truncate text-sm ${z.ohneKategorie ? 'font-semibold' : 'font-medium'}`}>{z.name}</span>
            {z.ohneKategorie && (
              <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                zuordnen
              </span>
            )}
          </span>
          {!klein && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max((z.anteil / maxAnteil) * 100, 1.5)}%`, background: farbe }}
              />
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">{euro(z.betrag)}</span>
          <span className="block text-[11px] tabular-nums text-muted-foreground">{prozent(z.anteil, locale)}</span>
        </span>
        {hatVergleich && (
          <span className="hidden w-14 shrink-0 text-right sm:block">
            <Delta pct={z.deltaPct} modus={modus} locale={locale} neu={z.vorBetrag === 0 && z.betrag > 0} />
          </span>
        )}
        {aufklappbar && (
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${istOffen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        )}
      </>
    )

    const rahmen = z.ohneKategorie ? 'bg-danger/5 ring-1 ring-danger/30' : ''
    return (
      <li
        key={z.schluessel}
        className={`rounded-md transition-colors ${rahmen} ${hoverKey === z.schluessel ? 'bg-accent/40' : ''}`}
        onMouseEnter={() => !klein && setHoverKey(z.schluessel)}
        onMouseLeave={() => setHoverKey(null)}
      >
        <div className="flex items-center gap-1">
          {aufklappbar ? (
            <button
              type="button"
              aria-expanded={istOffen}
              aria-controls={panelId}
              onClick={() => setOffen(istOffen ? null : z.schluessel)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              {inhalt}
            </button>
          ) : (
            <div
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 ${
                z.ohneKategorie ? 'cursor-pointer hover:bg-danger/10' : ''
              }`}
              {...(z.ohneKategorie
                ? { role: 'button', tabIndex: 0, onClick: () => setzeKat(null), onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setzeKat(null) }
                  } }
                : {})}
            >
              {inhalt}
            </div>
          )}
          {buchungenKnopf(z)}
        </div>
        {aufklappbar && istOffen && (
          <ul id={panelId} className="mb-2 ml-7 mr-2 space-y-0.5 border-l border-border pl-3">
            {z.kinder.map(k => (
              <li key={k.id ?? 'ohne'} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  {k.direkt ? 'Ohne Unterkategorie' : k.name}
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums">{euro(k.betrag)}</span>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {prozent(k.anteil, locale)}
                </span>
                {buchungenKnopf({ id: k.id, name: k.direkt ? z.name : k.name })}
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <section aria-label="Kategorien" className="rounded-lg border border-border bg-card p-4 sm:p-5">
      {kopf}

      {/* Aussen `relative`, innen `overflow-hidden`: die Hover-Karte ragt ueber den Balken hinaus
          und wuerde im abgerundeten Balken selbst abgeschnitten. */}
      <div className="relative">
        {hoverSegment && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-30 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-xs shadow-lg"
            style={{ left: `${mitte.get(hoverSegment.key)}%` }}
          >
            <p className="flex items-center gap-2 font-medium text-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: hoverSegment.farbe }} aria-hidden />
              <span className="truncate">{hoverSegment.name}</span>
            </p>
            <p className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{modus === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'}</span>
              <span className="font-semibold tabular-nums">{euro(hoverSegment.betrag, 2)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Anteil am Gesamten</span>
              <span className="font-semibold tabular-nums">{prozent(hoverSegment.anteil, locale)}</span>
            </p>
            {hatVergleich && (
              <p className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Vorperiode</span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  {hoverSegment.vorBetrag !== null && <span>{euro(hoverSegment.vorBetrag, 0)}</span>}
                  <Delta pct={hoverSegment.deltaPct} modus={modus} locale={locale} />
                </span>
              </p>
            )}
            {hoverSegment.unter > 0 && (
              <p className="mt-1 text-muted-foreground">
                {hoverSegment.unter} {hoverSegment.unter === 1 ? 'Unterkategorie' : 'Unterkategorien'}
              </p>
            )}
            {hoverSegment.namen.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {hoverSegment.namen.slice(0, 5).join(', ')}{hoverSegment.namen.length > 5 ? ' …' : ''}
              </p>
            )}
          </div>
        )}
        <div
          role="img"
          aria-label={`Anteile: ${segmente.map(s => `${s.name} ${prozent(s.anteil, locale)}`).join(', ')}`}
          className="flex h-7 gap-0.5 overflow-hidden rounded-md"
          onMouseLeave={() => setHoverKey(null)}
        >
          {segmente.map(s => (
            <div
              key={s.key}
              onMouseEnter={() => setHoverKey(s.key)}
              className={`flex min-w-[3px] items-center justify-center overflow-hidden text-[10px] font-semibold text-white transition-opacity ${
                hoverKey && hoverKey !== s.key ? 'opacity-40' : ''
              }`}
              style={{ width: `${s.anteil * 100}%`, background: s.farbe }}
            >
              {s.anteil >= 0.08 && <span className="drop-shadow-sm">{prozent(s.anteil, locale)}</span>}
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-border/50">
        {ansicht.zeilen.map(z => zeile(z))}
        {ansicht.weitere.length > 0 && (
          <li>
            <button
              type="button"
              aria-expanded={weitereOffen}
              aria-controls="bank-kat-weitere"
              onClick={() => setWeitereOffen(o => !o)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: FARBE_WEITERE }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                Weitere ({ansicht.weitere.length})
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{euro(ansicht.weitereBetrag)}</span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {prozent(ansicht.weitereBetrag / ansicht.total, locale)}
                </span>
              </span>
              {hatVergleich && (
                <span className="hidden w-14 shrink-0 text-right sm:block">
                  <Delta pct={ansicht.weitereDeltaPct} modus={modus} locale={locale} />
                </span>
              )}
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${weitereOffen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {weitereOffen && (
              <ul id="bank-kat-weitere" className="mb-2 ml-4 border-l border-border pl-2">
                {ansicht.weitere.map(z => zeile(z, true))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </section>
  )
}
