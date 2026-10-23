'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts'
import type { SankeyArt, SankeyData } from '@/lib/analyseData'
import { normalisiereSankey, zuFlussListe } from '@/lib/analyse/geldfluss'
import { GeldflussListe } from './GeldflussListe'
import { useSettings } from '@/components/providers/settings-context'
import { farbeFuer, fmtAnteil, fmtEuro, FARBE_EINNAHMEN } from './GeldflussFarben'

interface Props {
  data: SankeyData
  /** Setzt den Kategorie-Filter (`null` hebt ihn auf). Fehlt er, sind Posten nicht klickbar (Landingpage). */
  onKategorie?: (id: string | null) => void
  /** Aktuell gefilterte Kategorie — alle anderen Posten werden abgeblendet. */
  aktiveKategorie?: string | null
}

/**
 * Ab dieser Kartenbreite (px) gilt das Sankey. Darunter die Fluss-Liste (siehe GeldflussListe).
 *
 * Gemessen wird die KARTE, nicht der Bildschirm: in einem zweispaltigen Raster ist auch ein
 * 1100-px-Fenster nur ~500 px pro Karte breit, und dort wäre das Sankey genauso unlesbar wie
 * auf dem Handy. Bei 600 px bleiben nach 2 × ~140 px Beschriftung ~320 px für die Bänder.
 */
const SANKEY_AB = 600
const MARGIN_LINKS = 130
const MARGIN_RECHTS = 150
/** Zeichen, die in die Beschriftungsspalte passen (11-px-Schrift ≈ 6 px je Zeichen). */
const LABEL_ZEICHEN = 22

const kuerze = (s: string, max = LABEL_ZEICHEN) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** Die von recharts an `node`/`link` durchgereichten Knotendaten — nur die hier gelesenen Felder. */
interface KnotenPayload {
  name?: string
  depth?: number
  art?: SankeyArt
  rang?: number
  kategorieId?: string
  betrag?: number
  value?: number
  enthalten?: { name: string; betrag: number }[]
}

interface SankeyNodeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: KnotenPayload
  onKategorie?: (id: string | null) => void
  aktiveKategorie?: string | null
}

function SankeyNode(props: SankeyNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload, onKategorie, aktiveKategorie } = props
  const name = payload?.name ?? ''
  const art = payload?.art
  const farbe = farbeFuer(art, payload?.rang)
  const kat = payload?.kategorieId
  const klickbar = !!onKategorie && !!kat
  const aktiv = !!kat && kat === aktiveKategorie
  const gedimmt = !!aktiveKategorie && !aktiv && !!kat

  // Tiefe 0 = linke Spalte (Quellen, Fehlbetrag, Anlage-Rückflüsse): Label links, sonst rechts.
  const links = payload?.depth === 0
  const h = Math.max(height, 4)
  const aktion = () => onKategorie?.(aktiv ? null : (kat ?? null))

  return (
    <g
      opacity={gedimmt ? 0.35 : 1}
      style={klickbar ? { cursor: 'pointer' } : undefined}
      role={klickbar ? 'button' : undefined}
      tabIndex={klickbar ? 0 : undefined}
      aria-label={klickbar ? `${name}: Buchungen filtern` : undefined}
      onClick={klickbar ? aktion : undefined}
      onKeyDown={klickbar ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aktion() } } : undefined}
    >
      <title>{name}</title>
      <rect
        x={x} y={y} width={width} height={h} rx={3} fill={farbe} fillOpacity={0.9}
        stroke={aktiv ? 'var(--foreground)' : 'none'} strokeWidth={aktiv ? 1.5 : 0}
      />
      {/* Größere, unsichtbare Trefferfläche: ein 4-px-Balken ist mit der Maus kaum zu treffen. */}
      {klickbar && <rect x={x - 4} y={y - 4} width={width + 8} height={h + 8} fill="transparent" />}
      <text
        x={links ? x - 10 : x + width + 10}
        y={y + h / 2}
        textAnchor={links ? 'end' : 'start'}
        fill="var(--foreground)"
        fontSize={11}
        fontWeight={aktiv ? 600 : 400}
        fontFamily="inherit"
        dominantBaseline="middle"
      >
        {kuerze(name)}
      </text>
    </g>
  )
}

/**
 * Bänder als Farbverlauf (wie CardSankey in der Landing-Sektion): vom äußeren Endpunkt zu
 * „Einnahmen" in der Mitte. Das `<defs>` steckt bewusst im selben Fragment wie der `<path>`,
 * statt einmalig außerhalb — SVG referenziert Gradient-IDs dokumentweit, und ein separates
 * `<defs>` müsste recharts' Link-Rendering an einer dafür nicht vorgesehenen Stelle durchbrechen.
 * Die ID trägt ein `useId`-Präfix, damit zwei Charts auf einer Seite sich nicht überschreiben.
 */
interface SankeyLinkProps {
  sourceX?: number
  sourceY?: number
  sourceControlX?: number
  targetX?: number
  targetY?: number
  targetControlX?: number
  linkWidth?: number
  index?: number
  payload?: { source?: KnotenPayload; target?: KnotenPayload }
  idPrefix?: string
  aktiveKategorie?: string | null
}

function SankeyLink(props: SankeyLinkProps) {
  const { sourceX = 0, sourceY = 0, sourceControlX = 0, targetX = 0, targetY = 0, targetControlX = 0, linkWidth = 0, index = 0, payload, idPrefix = 'gf', aktiveKategorie } = props
  const quelle = payload?.source
  const ziel = payload?.target
  const intoEinnahmen = ziel?.art === 'einnahmen'
  const aussen = intoEinnahmen ? quelle : ziel
  const edgeColor = farbeFuer(aussen?.art, aussen?.rang)
  const gradId = `${idPrefix}-link-${index}`
  const kat = aussen?.kategorieId
  const gedimmt = !!aktiveKategorie && !!kat && kat !== aktiveKategorie
  const f = gedimmt ? 0.35 : 1

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          {intoEinnahmen ? (
            <>
              <stop offset="0%" stopColor={edgeColor} stopOpacity={0.5 * f} />
              <stop offset="100%" stopColor={FARBE_EINNAHMEN} stopOpacity={0.32 * f} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={FARBE_EINNAHMEN} stopOpacity={0.32 * f} />
              <stop offset="100%" stopColor={edgeColor} stopOpacity={0.5 * f} />
            </>
          )}
        </linearGradient>
      </defs>
      <path
        d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={linkWidth}
      />
    </>
  )
}

interface SankeyTooltipItem extends KnotenPayload {
  realValue?: number
  source?: KnotenPayload
  target?: KnotenPayload
}

/**
 * Hover-Karte: Name, Betrag, Anteil. Der Anteil bezieht sich auf die echten Einnahmen (`basis`),
 * nicht auf die Layout-Breite — die kann bei Defizit größer sein als die Einnahmen.
 */
function SankeyTooltip({ active, payload, basis }: {
  active?: boolean
  payload?: { payload?: SankeyTooltipItem }[]
  basis: number
}) {
  const { locale } = useSettings()
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null

  const istBand = item.source !== undefined
  const betrag = istBand ? (item.realValue ?? item.value ?? 0) : (item.betrag ?? item.value ?? 0)
  const art = istBand ? (item.target?.art === 'einnahmen' ? item.source?.art : item.target?.art) : item.art
  const rang = istBand ? (item.target?.art === 'einnahmen' ? item.source?.rang : item.target?.rang) : item.rang
  const titel = istBand ? `${item.source?.name} → ${item.target?.name}` : item.name
  const zeigeAnteil = basis > 0 && art !== 'einnahmen' && art !== 'defizit'

  return (
    <div className="max-w-60 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 size-2.5 shrink-0 rounded-sm" style={{ background: farbeFuer(art, rang) }} />
        <p className="min-w-0 break-words font-medium">{titel}</p>
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums">{fmtEuro(betrag, locale)}</p>
      {zeigeAnteil && (
        <p className="tabular-nums text-muted-foreground">{fmtAnteil(betrag / basis)} der Einnahmen</p>
      )}
      {!istBand && item.enthalten && item.enthalten.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5 text-muted-foreground">
          {item.enthalten.slice(0, 5).map(e => (
            <li key={e.name} className="flex justify-between gap-3">
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 tabular-nums">{fmtEuro(e.betrag, locale)}</span>
            </li>
          ))}
          {item.enthalten.length > 5 && <li>+ {item.enthalten.length - 5} weitere</li>}
        </ul>
      )}
    </div>
  )
}

/**
 * Legende in DERSELBEN Reihenfolge wie die Balken im Diagramm (größter Posten zuerst), mit den
 * Beträgen — dadurch sind auch abgeschnittene Labels nachlesbar. Klickbar wie die Balken.
 */
function Legende({ data, onKategorie, aktiveKategorie }: Props) {
  const { locale } = useSettings()
  const liste = zuFlussListe(data)
  const gruppen = [
    { titel: 'Einnahmen', zeilen: liste.einnahmen, bezug: liste.summeEinnahmen },
    { titel: 'Ausgaben', zeilen: liste.ausgaben, bezug: liste.summeEinnahmen > 0 ? liste.summeEinnahmen : liste.summeAusgaben },
  ].filter(g => g.zeilen.length > 0)

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {gruppen.map(g => (
        <div key={g.titel} className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="w-16 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.titel}</span>
          {g.zeilen.map(z => {
            const klickbar = !!onKategorie && !!z.kategorieId
            const aktiv = !!z.kategorieId && z.kategorieId === aktiveKategorie
            const inhalt = (
              <>
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: farbeFuer(z.art, z.rang) }} />
                <span className="max-w-40 truncate">{z.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmtAnteil(g.bezug > 0 ? z.betrag / g.bezug : 0)}</span>
              </>
            )
            const cls = `inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs ${aktiv ? 'bg-accent font-medium' : ''}`
            return klickbar ? (
              <button
                key={z.index} type="button" title={`${z.name}: ${fmtEuro(z.betrag, locale)}`}
                onClick={() => onKategorie?.(aktiv ? null : (z.kategorieId ?? null))}
                className={`${cls} transition-colors hover:bg-accent`}
              >{inhalt}</button>
            ) : (
              <span key={z.index} title={`${z.name}: ${fmtEuro(z.betrag, locale)}`} className={cls}>{inhalt}</span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function GeldflussChart({ data: roh, onKategorie, aktiveKategorie }: Props) {
  const data = useMemo(() => normalisiereSankey(roh), [roh])
  const idPrefix = useId().replace(/:/g, '')
  const messRef = useRef<HTMLDivElement>(null)
  // null = noch nicht gemessen. Bis dahin wird nichts gezeichnet, damit weder das Sankey auf dem
  // Handy aufblitzt noch die Liste am Desktop.
  const [breite, setBreite] = useState<number | null>(null)

  useEffect(() => {
    const el = messRef.current
    if (!el) return
    setBreite(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setBreite(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [data.nodes.length])

  const basis = useMemo(() => zuFlussListe(data).summeEinnahmen, [data])
  // Höhe nach der vollsten Spalte: ~34 px je Balken inkl. Abstand, damit Labels sich nicht berühren.
  const zeilen = useMemo(() => {
    const mitte = data.nodes.findIndex(n => n.art === 'einnahmen')
    const links = data.nodes.filter((_, i) => i < mitte).length
    const rechts = data.nodes.length - mitte - 1
    return Math.max(links, rechts, 3)
  }, [data.nodes])

  if (!data.nodes.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Keine Transaktionsdaten</p>
      </div>
    )
  }

  const schmal = breite !== null && breite < SANKEY_AB

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-medium text-foreground">Geldfluss</h2>
      <div ref={messRef}>
        {breite === null ? (
          // Gleiche Hoehe wie das Skeleton (388) und das Sankey: sonst springt die Karte erst auf 240,
          // dann auf die Messung.
          <div style={{ height: 388 }} aria-hidden />
        ) : schmal ? (
          <GeldflussListe data={data} onKategorie={onKategorie} aktiveKategorie={aktiveKategorie} />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.min(520, Math.max(300, zeilen * 36 + 40))}>
              <Sankey
                data={data}
                nodePadding={22}
                nodeWidth={14}
                margin={{ top: 12, right: MARGIN_RECHTS, bottom: 12, left: MARGIN_LINKS }}
                node={<SankeyNode onKategorie={onKategorie} aktiveKategorie={aktiveKategorie} />}
                link={<SankeyLink idPrefix={idPrefix} aktiveKategorie={aktiveKategorie} />}
              >
                <Tooltip content={<SankeyTooltip basis={basis} />} />
              </Sankey>
            </ResponsiveContainer>
            <Legende data={data} onKategorie={onKategorie} aktiveKategorie={aktiveKategorie} />
          </>
        )}
      </div>
    </div>
  )
}
