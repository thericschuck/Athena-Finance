'use client'

import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ListFilter, Minus } from 'lucide-react'
import { useUrlFilters } from '@/components/providers/url-filters'
import { AnalyseKategorieSparkline } from '@/components/analyse/AnalyseKategorieSparkline'
import { fmtCurrency } from '@/lib/format'
import type { KategorieZeile, KategorienModus } from '@/lib/bank/kategorien'
import { WEITERE_KEY, type AnalyseKategorienDaten } from '@/lib/analyse/kategorien'

/**
 * Einnahmen/Ausgaben nach Hauptkategorie auf der Analyse-Seite. Gleiche Bedienung wie auf der
 * Bankdaten-Seite (BankKategorien): Umschalter, Anteilsleiste mit Hover-Karte, Liste in derselben
 * Reihenfolge wie die Leiste (chart-reihenfolge.ts), aufklappbare Unterkategorien, Top 6 + Weitere,
 * „Ohne Kategorie" hervorgehoben. Dazu: Trend je Zeile (Sparkline der letzten Monate) und der
 * Vergleich mit dem Vergleichsfenster der Seite.
 *
 * Die Daten sind vorgerechnet (lib/analyse/kategorien.ts) und schlank: nur Ansicht und Trendreihen
 * der gezeigten Kategorien, nicht die Monatszeilen der Seite.
 *
 * Layout ueber Container-Queries (`@md:`) statt Viewport-Breakpoints: der Abschnitt steht auf dem
 * Desktop in einer halben Spalte und ist dort so schmal wie ein Handy.
 *
 * Mobil: die Hover-Karte der Leiste kommt per Tippen auf ein Segment (nochmal tippen schliesst
 * sie) und steht dort ueber die volle Breite; die Delta-Spalte entfaellt zugunsten einer Zeile
 * unter dem Betrag.
 */

const WEITERE_FARBE_KEY = WEITERE_KEY

function prozent(anteil: number, locale: string): string {
  const p = anteil * 100
  return `${p.toLocaleString(locale, { maximumFractionDigits: p < 10 ? 1 : 0, minimumFractionDigits: 0 })} %`
}

/** Anstieg ist bei Ausgaben schlecht (rot), bei Einnahmen gut (gruen); Pfeil + Zahl, nie nur Farbe. */
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
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${gut ? 'text-success' : 'text-danger'}`}>
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{steigt ? 'plus' : 'minus'}</span>
      {Math.abs(pct * 100).toLocaleString(locale, { maximumFractionDigits: 0 })} %
    </span>
  )
}

/** Mini-Karte beim Ueberfahren (Tastatur: fokussierbar), wie auf der Bankseite. */
function HoverInfo({
  titel, zeilen, text, children,
}: { titel: string; zeilen: [string, string][]; text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-baseline" tabIndex={0}>
      <span className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">{children}</span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-popover p-3 text-xs font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
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

export function AnalyseKategorienAnzeige({ daten }: { daten: AnalyseKategorienDaten }) {
  const [modus, setModus] = useState<KategorienModus>('ausgaben')
  const [offen, setOffen] = useState<string | null>(null)
  const [weitereOffen, setWeitereOffen] = useState(false)
  // Segment oder Zeile unter Zeiger/Finger: markiert beides gemeinsam (Leiste <-> Liste).
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const filters = useUrlFilters()
  const aktiveKat = filters.get('kat')
  const { locale, laufenderMonat, vergleich } = daten

  const { ansicht, darstellung, trend } = daten.modi[modus]
  const euro = (n: number, d = 0) => fmtCurrency(n, 'EUR', locale, { fractionDigits: d })
  const hatVergleich = vergleich.aktiv && ansicht.vorTotal !== null
  const vergleichName = vergleich.art === 'vorjahr' ? 'Vorjahr' : 'Vorperiode'
  const wort = modus === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'
  const maxAnteil = useMemo(
    () => Math.max(...ansicht.zeilen.map(z => z.anteil), ansicht.total > 0 ? ansicht.weitereBetrag / ansicht.total : 0, 0.0001),
    [ansicht],
  )

  const monatsKurz = (monat: string) =>
    new Date(`${monat}T12:00:00`).toLocaleDateString(locale, { month: 'short' })
  const ersterMonat = daten.monate[0]
  const letzterMonat = daten.monate[daten.monate.length - 1]

  const setzeKat = (id: string | null) => {
    const wertKat = id ?? 'offen'
    const aktivieren = aktiveKat !== wertKat
    filters.set('kat', aktivieren ? wertKat : null)
    // Zur Buchungsliste springen, damit der Klick sichtbar etwas bewirkt (die Liste steht weiter unten).
    if (aktivieren && typeof document !== 'undefined') {
      const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      document.getElementById('buchungen')?.scrollIntoView({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' })
    }
  }

  const trendText = (z: { name: string }, werte: number[] | undefined) => {
    if (!werte || werte.length === 0) return `Kein Verlauf für ${z.name}`
    const schnitt = werte.reduce((s, v) => s + v, 0) / werte.length
    return `Verlauf ${z.name}, ${werte.length} Monate: zuletzt ${euro(werte[werte.length - 1])}${
      laufenderMonat.unvollstaendig ? ' (Monat noch nicht vollständig)' : ''}, Durchschnitt ${euro(schnitt)}`
  }

  const umschalter = (
    <div role="group" aria-label="Art der Kategorien" className="inline-flex rounded-md bg-muted p-0.5">
      {(['ausgaben', 'einnahmen'] as const).map(m => (
        <button
          key={m}
          type="button"
          aria-pressed={modus === m}
          onClick={() => { setModus(m); setOffen(null); setWeitereOffen(false); setHoverKey(null) }}
          className={`min-h-10 rounded px-3.5 py-1 text-xs font-medium transition-colors sm:min-h-0 ${
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
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{wort} nach Kategorie</p>
        {ansicht.anzahl > 0 && (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <HoverInfo
              titel={`${wort} gesamt`}
              zeilen={[['Summe', euro(ansicht.total, 2)], ['Kategorien', String(ansicht.anzahl)]]}
              text={`Summe aller ${wort} der Hauptkategorien im gewählten Zeitraum${daten.monat ? ' (ein Monat)' : ''}. ${
                daten.anlageMit
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
                titel={`Vergleich mit dem ${vergleichName}`}
                zeilen={[
                  ['Jetzt', euro(ansicht.total, 2)],
                  [vergleichName, euro(ansicht.vorTotal ?? 0, 2)],
                  ['Differenz', `${ansicht.total - (ansicht.vorTotal ?? 0) >= 0 ? '+' : '−'}${euro(Math.abs(ansicht.total - (ansicht.vorTotal ?? 0)), 2)}`],
                ]}
                text="Verglichen wird auf Monatsebene mit dem Vergleichsfenster der Seite. Der laufende Monat ist noch nicht voll, der Vergleich fällt dann zu niedrig aus."
              >
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Delta pct={ansicht.deltaPct} modus={modus} locale={locale} />
                  zum {vergleichName} ({euro(ansicht.vorTotal ?? 0)})
                </span>
              </HoverInfo>
            )}
          </div>
        )}
      </div>
      {umschalter}
    </div>
  )

  const rahmenKlassen = '@container rounded-lg border border-border bg-card p-4 sm:p-5'

  if (ansicht.anzahl === 0) {
    return (
      <section aria-label="Kategorien" className={rahmenKlassen}>
        {kopf}
        <p className="py-8 text-center text-sm text-muted-foreground">
          Keine {wort} im aktuellen Filter.
        </p>
      </section>
    )
  }

  // Segmente der Leiste: dieselbe Reihenfolge wie die Liste, „Weitere" am Ende.
  const segmente = [
    ...ansicht.zeilen.map(z => ({
      key: z.schluessel, name: z.name, anteil: z.anteil, farbe: darstellung[z.schluessel].farbe,
      betrag: z.betrag, deltaPct: z.deltaPct, vorBetrag: z.vorBetrag,
      unter: z.kinder.filter(k => !k.direkt).length, namen: [] as string[],
    })),
    ...(ansicht.weitere.length > 0
      ? [{
          key: WEITERE_KEY, name: `Weitere (${ansicht.weitere.length})`, anteil: ansicht.weitereBetrag / ansicht.total,
          farbe: darstellung[WEITERE_FARBE_KEY].farbe, betrag: ansicht.weitereBetrag, deltaPct: ansicht.weitereDeltaPct,
          vorBetrag: ansicht.weitereVorBetrag, unter: 0, namen: ansicht.weitere.map(w => w.name),
        }]
      : []),
  ]
  // Mittelpunkt jedes Segments in Prozent, fuer die Position der Hover-Karte (nur breit; schmal: volle Breite).
  let summeVorher = 0
  const mitte = new Map(segmente.map(s => {
    const m = (summeVorher + s.anteil / 2) * 100
    summeVorher += s.anteil
    return [s.key, Math.min(73, Math.max(27, m))] as const
  }))
  const hoverSegment = segmente.find(s => s.key === hoverKey) ?? null

  const buchungenKnopf = (z: { id: string | null; name: string }) => {
    const wertKat = z.id ?? 'offen'
    const aktiv = aktiveKat === wertKat
    return (
      <button
        type="button"
        aria-pressed={aktiv}
        aria-label={`Buchungen zu ${z.name} ${aktiv ? 'nicht mehr filtern' : 'anzeigen'}`}
        title={aktiv ? 'Filter aufheben' : 'Buchungen dieser Kategorie anzeigen'}
        onClick={() => setzeKat(z.id)}
        className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors @md:min-h-8 @md:min-w-0 ${
          aktiv ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <ListFilter className="size-3.5" aria-hidden />
        <span className="hidden @md:inline">Buchungen</span>
      </button>
    )
  }

  const zeile = (z: KategorieZeile, klein = false) => {
    const { farbe, symbol } = darstellung[z.schluessel]
    const echteKinder = z.kinder.filter(k => !k.direkt).length > 0
    const aufklappbar = !z.ohneKategorie && (echteKinder || z.kinder.length > 1)
    const istOffen = offen === z.schluessel
    const panelId = `analyse-kat-${z.schluessel}`
    const eigenerWert = z.id ?? 'offen'
    // Aktiv ist die Zeile auch, wenn der Filter auf einer ihrer Unterkategorien steht.
    const aktiv = aktiveKat === eigenerWert || (aktiveKat !== null && z.kinder.some(k => k.id === aktiveKat))
    const werte = trend[z.schluessel]
    const hatTrend = !!werte && werte.some(v => v > 0)

    const inhalt = (
      <>
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: farbe }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {symbol && <span aria-hidden>{symbol}</span>}
            <span className={`truncate text-sm ${z.ohneKategorie || aktiv ? 'font-semibold' : 'font-medium'}`}>{z.name}</span>
            {z.ohneKategorie && (
              <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">zuordnen</span>
            )}
          </span>
          {!klein && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${Math.max((z.anteil / maxAnteil) * 100, 1.5)}%`, background: farbe }} />
            </span>
          )}
        </span>
        {hatTrend && (
          <AnalyseKategorieSparkline
            werte={werte}
            farbe={farbe}
            unvollstaendig={laufenderMonat.unvollstaendig}
            beschreibung={trendText(z, werte)}
            className={klein ? 'hidden' : 'h-[17px] w-12 @md:h-[22px] @md:w-16'}
          />
        )}
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">{euro(z.betrag)}</span>
          <span className="block text-[11px] tabular-nums text-muted-foreground">{prozent(z.anteil, locale)}</span>
          {hatVergleich && (
            <span className="block @md:hidden">
              <Delta pct={z.deltaPct} modus={modus} locale={locale} neu={z.vorBetrag === 0 && z.betrag > 0} />
            </span>
          )}
        </span>
        {hatVergleich && (
          <span className="hidden w-14 shrink-0 text-right @md:block">
            <Delta pct={z.deltaPct} modus={modus} locale={locale} neu={z.vorBetrag === 0 && z.betrag > 0} />
          </span>
        )}
        {aufklappbar && (
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${istOffen ? 'rotate-180' : ''}`} aria-hidden />
        )}
      </>
    )

    const rahmen = z.ohneKategorie ? 'bg-danger/5 ring-1 ring-danger/30' : aktiv ? 'bg-accent/60 ring-1 ring-border' : ''
    const zeilenKlassen = 'flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors @md:gap-3'
    return (
      <li
        key={z.schluessel}
        className={`rounded-md transition-colors ${rahmen} ${hoverKey === z.schluessel ? 'bg-accent/40' : ''}`}
        onMouseEnter={() => !klein && setHoverKey(z.schluessel)}
        onMouseLeave={() => setHoverKey(null)}
      >
        <div className="flex items-center gap-0.5">
          {aufklappbar ? (
            <button
              type="button"
              aria-expanded={istOffen}
              aria-controls={panelId}
              onClick={() => setOffen(istOffen ? null : z.schluessel)}
              className={`${zeilenKlassen} hover:bg-accent/50`}
            >
              {inhalt}
            </button>
          ) : (
            // Ohne Unterkategorien gibt es nichts aufzuklappen: der Klick auf die Zeile filtert direkt.
            <button
              type="button"
              aria-pressed={aktiveKat === eigenerWert}
              onClick={() => setzeKat(z.id)}
              className={`${zeilenKlassen} ${z.ohneKategorie ? 'hover:bg-danger/10' : 'hover:bg-accent/50'}`}
            >
              {inhalt}
            </button>
          )}
          {buchungenKnopf(z)}
        </div>
        {aufklappbar && istOffen && (
          <ul id={panelId} className="mb-2 ml-5 mr-1 space-y-0.5 border-l border-border pl-3 @md:ml-7">
            {z.kinder.map(k => (
              <li key={k.id ?? 'ohne'} className={`flex items-center gap-2 rounded py-1 ${aktiveKat === (k.id ?? 'offen') ? 'bg-accent/60' : ''}`}>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  {k.direkt ? 'Ohne Unterkategorie' : k.name}
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular-nums">{euro(k.betrag)}</span>
                <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{prozent(k.anteil, locale)}</span>
                {buchungenKnopf({ id: k.id, name: k.direkt ? z.name : k.name })}
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  const weitereTrend = trend[WEITERE_KEY]

  return (
    <section aria-label="Kategorien" className={rahmenKlassen}>
      {kopf}

      {/* Aussen `relative`, innen `overflow-hidden`: die Karte ragt ueber die Leiste hinaus und
          wuerde in der abgerundeten Leiste selbst abgeschnitten. */}
      <div className="relative">
        {hoverSegment && (
          <div
            role="tooltip"
            // Schmal: ueber die ganze Breite (eine zentrierte Karte liefe aus dem Bild). Breit:
            // 15 rem, mittig ueber dem Segment (--mitte).
            className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 rounded-lg border border-border bg-popover p-3 text-xs shadow-lg @md:inset-x-auto @md:left-[var(--mitte)] @md:w-60 @md:-translate-x-1/2"
            style={{ ['--mitte' as string]: `${mitte.get(hoverSegment.key)}%` } as React.CSSProperties}
          >
            <p className="flex items-center gap-2 font-medium text-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: hoverSegment.farbe }} aria-hidden />
              <span className="truncate">{hoverSegment.name}</span>
            </p>
            <p className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">{wort}</span>
              <span className="font-semibold tabular-nums">{euro(hoverSegment.betrag, 2)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Anteil am Gesamten</span>
              <span className="font-semibold tabular-nums">{prozent(hoverSegment.anteil, locale)}</span>
            </p>
            {hatVergleich && (
              <p className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{vergleichName}</span>
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
          role="group"
          aria-label={`Anteile: ${segmente.map(s => `${s.name} ${prozent(s.anteil, locale)}`).join(', ')}`}
          className="flex h-10 gap-0.5 overflow-hidden rounded-md @md:h-7"
          onMouseLeave={() => setHoverKey(null)}
        >
          {segmente.map(s => (
            // Taste statt div: Antippen zeigt die Karte (Handy kennt kein Hover), nochmal Antippen schliesst sie.
            <button
              key={s.key}
              type="button"
              aria-label={`${s.name}: ${prozent(s.anteil, locale)}`}
              aria-pressed={hoverKey === s.key}
              onMouseEnter={() => setHoverKey(s.key)}
              onFocus={() => setHoverKey(s.key)}
              onBlur={() => setHoverKey(null)}
              onClick={() => setHoverKey(k => (k === s.key ? null : s.key))}
              className={`flex min-w-[3px] items-center justify-center overflow-hidden text-[10px] font-semibold text-white transition-opacity ${
                hoverKey && hoverKey !== s.key ? 'opacity-40' : ''
              }`}
              style={{ width: `${s.anteil * 100}%`, background: s.farbe }}
            >
              {s.anteil >= 0.08 && <span className="drop-shadow-sm">{prozent(s.anteil, locale)}</span>}
            </button>
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
              aria-controls="analyse-kat-weitere"
              onClick={() => setWeitereOffen(o => !o)}
              className="flex min-h-12 w-full items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/50 @md:gap-3"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: darstellung[WEITERE_FARBE_KEY].farbe }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Weitere ({ansicht.weitere.length})</span>
              {weitereTrend && weitereTrend.some(v => v > 0) && (
                <AnalyseKategorieSparkline
                  werte={weitereTrend}
                  farbe={darstellung[WEITERE_FARBE_KEY].farbe}
                  unvollstaendig={laufenderMonat.unvollstaendig}
                  beschreibung={trendText({ name: 'Weitere' }, weitereTrend)}
                  className="h-[17px] w-12 @md:h-[22px] @md:w-16"
                />
              )}
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{euro(ansicht.weitereBetrag)}</span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">{prozent(ansicht.weitereBetrag / ansicht.total, locale)}</span>
                {hatVergleich && (
                  <span className="block @md:hidden"><Delta pct={ansicht.weitereDeltaPct} modus={modus} locale={locale} /></span>
                )}
              </span>
              {hatVergleich && (
                <span className="hidden w-14 shrink-0 text-right @md:block">
                  <Delta pct={ansicht.weitereDeltaPct} modus={modus} locale={locale} />
                </span>
              )}
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${weitereOffen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {weitereOffen && (
              <ul id="analyse-kat-weitere" className="mb-2 ml-3 border-l border-border pl-1">
                {ansicht.weitere.map(z => zeile(z, true))}
              </ul>
            )}
          </li>
        )}
      </ul>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Linie: {wort} je Monat, {monatsKurz(ersterMonat)} bis {monatsKurz(letzterMonat)}, jede Kategorie mit eigener Skala.
        {laufenderMonat.unvollstaendig && (
          <> Der laufende Monat (hohler Punkt, gestrichelt) ist erst bis zum {laufenderMonat.tag}. gefüllt und daher niedriger.</>
        )}
        {!vergleich.aktiv && <> Kein Vergleich: aus, zu kurzer Zeitraum oder die Historie reicht nicht so weit zurück.</>}
      </p>
    </section>
  )
}
