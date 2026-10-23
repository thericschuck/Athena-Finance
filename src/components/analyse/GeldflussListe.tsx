'use client'

import { useState } from 'react'
import { ArrowDown, ChevronDown } from 'lucide-react'
import type { SankeyData } from '@/lib/analyseData'
import { zuFlussListe, type FlussZeile } from '@/lib/analyse/geldfluss'
import { useSettings } from '@/components/providers/settings-context'
import { farbeFuer, fmtAnteil, fmtEuro, fmtEuroGenau, FARBE_EINNAHMEN, FARBE_ANLAGE } from './GeldflussFarben'

/**
 * Geldfluss als „Fluss-Liste" für schmale Bildschirme (< 600 px Kartenbreite).
 *
 * WARUM KEIN GEDREHTES SANKEY: Ein Sankey braucht Platz für Beschriftungen NEBEN den Balken. Auf
 * 296 px nutzbarer Breite (360 px Handy minus Seitenrand und Kartenrand) bleiben bei zwei
 * Label-Spalten von je 100 px keine 100 px für die Bänder — und dreht man das Diagramm, liegen
 * bis zu acht Labels übereinander, die bei 11 px Schrift jeweils ~16 px Höhe brauchen, während
 * die Ausgaben-Bänder kleiner Posten nur 2–4 px dick sind. Das ist unlesbar.
 *
 * Die Liste erzählt dieselbe Geschichte von oben nach unten: Quellen → Summenband „Einnahmen" →
 * Ausgaben → Überschuss/Defizit. Jede Zeile hat Name und Betrag IN Textgröße (≥ 12 px), darunter
 * einen Balken auf gemeinsamer Skala (Einnahmen- und Ausgabenbalken sind vergleichbar). Namen
 * werden gekürzt, der Betrag nie.
 *
 * TIPPEN statt Hover: Tippen klappt eine Zeile auf (voller Name, genauer Betrag, Anteil; bei
 * „Weitere" die enthaltenen Posten). Erst der ausdrückliche Knopf „Buchungen anzeigen" setzt den
 * `kat`-Filter — ein versehentliches Tippen beim Scrollen soll nicht die ganze Seite neu laden.
 *
 * Alle Zielflächen sind mindestens 44 px hoch (Apple-/Material-Richtwert).
 */

interface Props {
  data: SankeyData
  onKategorie?: (id: string | null) => void
  aktiveKategorie?: string | null
}

export function GeldflussListe({ data, onKategorie, aktiveKategorie }: Props) {
  const { locale } = useSettings()
  const liste = zuFlussListe(data)
  const bezugText = liste.bezug === 'einnahmen' ? 'der Einnahmen' : 'der Ausgaben'
  const sparQuote = liste.summeEinnahmen > 0 ? liste.saldo / liste.summeEinnahmen : null

  return (
    <div className="space-y-3">
      {liste.einnahmen.length > 0 && (
        <Block titel="Woher das Geld kommt" summe={liste.summeEinnahmen} summeFarbe="var(--chart-income)">
          {liste.einnahmen.map(z => (
            <Zeile key={z.index} zeile={z} bezugText="der Einnahmen" onKategorie={onKategorie} aktiveKategorie={aktiveKategorie} />
          ))}
        </Block>
      )}

      {/* Summenband: der Knoten „Einnahmen" aus dem Sankey, hier als volle Breite zwischen den Blöcken. */}
      <div
        className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
        style={{
          background: `color-mix(in srgb, ${FARBE_EINNAHMEN} 14%, transparent)`,
          borderColor: `color-mix(in srgb, ${FARBE_EINNAHMEN} 40%, transparent)`,
        }}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Einnahmen
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{fmtEuro(liste.summeEinnahmen, locale)}</span>
      </div>

      {liste.ausgaben.length > 0 && (
        <Block titel="Wohin es fließt" summe={liste.summeAusgaben} summeFarbe="var(--chart-expense)">
          {liste.ausgaben.map(z => (
            <Zeile key={z.index} zeile={z} bezugText={bezugText} onKategorie={onKategorie} aktiveKategorie={aktiveKategorie} />
          ))}
        </Block>
      )}

      <Saldo saldo={liste.saldo} quote={sparQuote} />
    </div>
  )
}

function Block({ titel, summe, summeFarbe, children }: {
  titel: string; summe: number; summeFarbe: string; children: React.ReactNode
}) {
  const { locale } = useSettings()
  return (
    <section aria-label={titel}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titel}</h3>
        <span className="text-xs font-medium tabular-nums" style={{ color: summeFarbe }}>{fmtEuro(summe, locale)}</span>
      </div>
      <ul className="divide-y divide-border/60">{children}</ul>
    </section>
  )
}

function Zeile({ zeile, bezugText, onKategorie, aktiveKategorie }: {
  zeile: FlussZeile
  bezugText: string
  onKategorie?: (id: string | null) => void
  aktiveKategorie?: string | null
}) {
  const { locale } = useSettings()
  const [offen, setOffen] = useState(false)
  const farbe = farbeFuer(zeile.art, zeile.rang)
  const aktiv = !!zeile.kategorieId && zeile.kategorieId === aktiveKategorie
  const gedimmt = !!aktiveKategorie && !aktiv && !!zeile.kategorieId
  const anlage = zeile.art === 'anlage'
  const kannFiltern = !!onKategorie && !!zeile.kategorieId

  return (
    <li className={gedimmt ? 'opacity-45' : undefined}>
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="block min-h-11 w-full py-2 text-left"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            <span className="truncate">{zeile.name}</span>
            {aktiv && <span className="shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground">Filter</span>}
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="text-sm font-medium tabular-nums text-foreground">{fmtEuro(zeile.betrag, locale)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmtAnteil(zeile.anteil)}</span>
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-1.5">
          <span className="block h-2 min-w-0 flex-1 rounded-full bg-muted">
            <span
              className="block h-2 rounded-full"
              style={{
                width: `${Math.max(zeile.breite * 100, 1.5)}%`,
                // Anlagen zusätzlich gestreift: erkennbar auch ohne Farbwahrnehmung.
                background: anlage
                  ? `repeating-linear-gradient(45deg, ${FARBE_ANLAGE} 0 4px, color-mix(in srgb, ${FARBE_ANLAGE} 45%, transparent) 4px 8px)`
                  : farbe,
              }}
            />
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${offen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      {offen && (
        <div className="mb-2 space-y-2 rounded-lg bg-muted/40 p-2.5 text-xs">
          <p className="break-words font-medium text-foreground">{zeile.name}</p>
          <p className="tabular-nums text-muted-foreground">
            {fmtEuroGenau(zeile.betrag, locale)} · {fmtAnteil(zeile.anteil)} {bezugText}
          </p>
          {zeile.enthalten && zeile.enthalten.length > 0 && (
            <ul className="space-y-1">
              {zeile.enthalten.slice(0, 8).map(e => (
                <li key={e.name} className="flex justify-between gap-2 text-muted-foreground">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="shrink-0 tabular-nums">{fmtEuro(e.betrag, locale)}</span>
                </li>
              ))}
              {zeile.enthalten.length > 8 && (
                <li className="text-muted-foreground">+ {zeile.enthalten.length - 8} weitere</li>
              )}
            </ul>
          )}
          {kannFiltern && (
            <button
              type="button"
              onClick={() => onKategorie?.(aktiv ? null : (zeile.kategorieId ?? null))}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              {aktiv ? 'Filter aufheben' : 'Buchungen anzeigen'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Saldo({ saldo, quote }: { saldo: number; quote: number | null }) {
  const { locale } = useSettings()
  // Unter 1 € ist es Rundungsstaub, keine Aussage wert.
  if (Math.abs(saldo) < 1) return null
  const plus = saldo > 0
  const farbe = plus ? 'var(--chart-income)' : 'var(--chart-expense)'
  return (
    <div
      className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
      style={{
        background: `color-mix(in srgb, ${farbe} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${farbe} 40%, transparent)`,
      }}
    >
      <span className="min-w-0 text-sm font-medium text-foreground">
        {plus ? 'Überschuss' : 'Defizit'}
        {quote !== null && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {plus ? `${fmtAnteil(quote)} der Einnahmen` : 'mehr aus- als eingenommen'}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: farbe }}>
        {plus ? '+' : '−'}{fmtEuro(Math.abs(saldo), locale)}
      </span>
    </div>
  )
}
