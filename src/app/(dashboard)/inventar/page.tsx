import { getAuthUser } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency } from '@/lib/format'
import { InventoryClient } from '@/components/inventar/InventoryClient'
import {
  gesamtwert, KATEGORIEN, wertAlterMonate, WERT_VERALTET_MONATE,
  type ValuableImage, type ValuableWithImage,
} from '@/lib/valuables'
import { Gem } from 'lucide-react'
import { getActiveValuables, getDocumentCounts, getHandBewertungsstaende, getSammlungsRohdaten, getSoldValuables, getValuableImages } from '@/lib/data/inventar'
import { SammlungsChartLazy } from '@/components/inventar/SammlungsChartLazy'
import { sammlungsverlauf } from '@/lib/inventar/sammlungsverlauf'
import { SoldList } from '@/components/inventar/SoldList'
import { VerlaufSchaetzenButton } from '@/components/inventar/VerlaufSchaetzenButton'
import { signierteBildUrls } from '@/lib/inventar/bildurls'

/**
 * Inventar — die Vitrine.
 *
 * Bewusst getrennt vom Net Worth: der Wert einer Uhr ist eine Schätzung, und in den
 * Vermögensverlauf gemischt macht er aus einer harten Zahl eine weiche. Die Summe steht
 * deshalb hier und als eigene Kachel im Dashboard, aber nicht in `net_worth_snapshots`
 * (siehe Migration 20260831000002, Abschnitt „Bewusst KEIN Net-Worth-Bucket").
 */

export const metadata = { title: 'Inventar' }

export default async function InventarPage() {
  const { supabase, user } = await getAuthUser()
  if (!user) return null

  const [aktive, verkauft, dokumente, handStaende, rohdaten, bilder, settings] = await Promise.all([
    getActiveValuables(supabase, user.id),
    getSoldValuables(supabase, user.id),
    getDocumentCounts(supabase, user.id),
    getHandBewertungsstaende(supabase, user.id),
    getSammlungsRohdaten(supabase, user.id),
    getValuableImages(supabase, user.id),
    getSettings(user.id),
  ])

  const items = aktive.map(v => ({ ...v, hand_wert_stand: handStaende.get(v.id) ?? null }))
  const locale = (settings.number_format as string) ?? 'de-DE'
  // Der Bucket ist privat — ohne signierte URL liefert Storage 400. Alle Pfade in EINEM
  // Aufruf signieren (bei 30 Objekten mit je vier Bildern wären es sonst 120 Round-Trips),
  // und über `signierteBildUrls` zwischengespeichert, damit derselbe Pfad zwischen zwei
  // Seitenaufrufen dieselbe URL behält — sonst greift der Browser-Cache nie und die ganze
  // Vitrine lädt nach jedem Refresh neu herunter.
  const signedByPath = bilder.length > 0
    ? await signierteBildUrls(supabase, bilder.map(b => b.pfad))
    : new Map<string, string>()

  const bilderByItem = new Map<string, ValuableImage[]>()
  for (const b of bilder) {
    const liste = bilderByItem.get(b.valuable_id) ?? []
    liste.push({
      id: b.id,
      valuable_id: b.valuable_id,
      pfad: b.pfad,
      art: b.art === 'artwork' ? 'artwork' : 'foto',
      ist_hauptbild: b.ist_hauptbild,
      created_at: b.created_at,
      url: signedByPath.get(b.pfad) ?? null,
      hinweis: b.hinweis,
      prompt: b.prompt,
      basis_bild_id: b.basis_bild_id,
    })
    bilderByItem.set(b.valuable_id, liste)
  }

  // `hauptbild_pfad` kommt aus der View und entscheidet, was Karte und Detailkopf zeigen —
  // gesetztes Hauptbild, sonst das jüngste Artwork, sonst das jüngste Foto.
  const itemsMitBild: ValuableWithImage[] = items.map(i => ({
    ...i,
    anzeige_url: i.hauptbild_pfad ? signedByPath.get(i.hauptbild_pfad) ?? null : null,
    bilder: bilderByItem.get(i.id) ?? [],
    dokument_anzahl: dokumente.get(i.id) ?? 0,
  }))

  const summe = gesamtwert(items, true)
  const eingekauft = items.reduce((s, v) => s + (v.kaufpreis ?? 0), 0)
  // Nur über die Stücke, bei denen beide Zahlen bekannt sind — sonst vergleicht man eine
  // Summe aus zehn Werten mit einer aus sechs Kaufpreisen und nennt die Differenz Rendite.
  const bewertbar = items.filter(v => v.kaufpreis != null && v.kaufpreis > 0 && v.aktueller_wert != null)
  const bwWert = bewertbar.reduce((s, v) => s + (v.aktueller_wert ?? 0), 0)
  const bwKauf = bewertbar.reduce((s, v) => s + (v.kaufpreis ?? 0), 0)
  const rendite = bwKauf > 0 ? ((bwWert - bwKauf) / bwKauf) * 100 : null

  // Versicherung und Verteilung beziehen sich auf dieselbe Summe wie der Sammlungswert.
  const gezaehlt = items.filter(v => v.im_vermoegen)
  const gesamt = gezaehlt.reduce((s, v) => s + (v.aktueller_wert ?? 0), 0)
  const versichertWert = gezaehlt.filter(v => v.versichert).reduce((s, v) => s + (v.aktueller_wert ?? 0), 0)
  const unversichertTeuer = gezaehlt.filter(v => !v.versichert && (v.aktueller_wert ?? 0) >= 1000)
  const verteilung = KATEGORIEN
    .map(k => ({
      key: k.key,
      label: k.label,
      wert: gezaehlt.filter(v => v.kategorie === k.key).reduce((s, v) => s + (v.aktueller_wert ?? 0), 0),
    }))
    .filter(k => k.wert > 0)
    .map(k => ({ ...k, anteil: gesamt > 0 ? (k.wert / gesamt) * 100 : 0 }))
    .sort((a, b) => b.wert - a.wert)
  const mitRendite = items.filter(v => v.rendite_prozent != null && v.rendite_prozent !== 0)
  const nachRendite = [...mitRendite].sort((a, b) => (b.rendite_prozent ?? 0) - (a.rendite_prozent ?? 0))
  const gewinner = nachRendite[0] ?? null
  const verlierer = nachRendite.length > 1 ? nachRendite[nachRendite.length - 1] : null
  const veraltetAnzahl = items.filter(v => (wertAlterMonate(v) ?? 0) >= WERT_VERALTET_MONATE).length

  const verlauf = sammlungsverlauf(rohdaten.stuecke, rohdaten.bewertungen, new Date().toISOString().split('T')[0])

  const ohneWert = items.filter(v => v.aktueller_wert == null).length
  const fmtEur = (n: number) => fmtCurrency(n, 'EUR', locale, { fractionDigits: 0 })

  return (
    <div className="p-4 sm:p-8 space-y-6">
      {/* Kopf */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Gem className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Inventar</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground max-w-xl">
            Uhren, Feuerzeuge und alles andere, was zu schade für eine Schublade ohne Register
            ist. Seriennummer, Box und Papiere stehen hier — der Wert ist der Bonus, nicht
            der Zweck.
          </p>
        </div>
        {items.length > 0 && <VerlaufSchaetzenButton />}
      </div>

      {/* Kennzahlen. Der Hinweis zum Net Worth steht bewusst direkt an der Summe: sonst
          nimmt man an, die Zahl stecke im Vermögen. */}
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Sammlungswert
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight">
              {items.length === 0 ? '—' : fmtEur(summe)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              geschätzt · zählt nicht zum Vermögen
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Kennzahl label="Stücke" value={String(items.length)} />
            <Kennzahl label="Eingekauft für" value={eingekauft > 0 ? fmtEur(eingekauft) : '—'} />
            <Kennzahl
              label="Entwicklung"
              value={rendite === null ? '—' : `${rendite >= 0 ? '+' : ''}${rendite.toFixed(1)} %`}
              className={rendite === null ? '' : rendite >= 0 ? 'text-success' : 'text-danger'}
              hint={
                bewertbar.length > 0 && bewertbar.length < items.length
                  ? `${bewertbar.length} von ${items.length} vergleichbar`
                  : undefined
              }
            />
            {ohneWert > 0 && (
              <Kennzahl
                label="Ohne Wert"
                value={String(ohneWert)}
                className="text-muted-foreground"
                hint="fehlen in der Summe"
              />
            )}
          </div>
        </div>
      </div>

      {verlauf.length > 1 && <SammlungsChartLazy punkte={verlauf} locale={locale} />}

      {/* Auswertung: Versicherung, Verteilung, Gewinner und Verlierer. Erst ab zwei Stücken —
          bei einem einzigen wäre jede Verteilung 100 %. */}
      {items.length > 1 && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Versicherung</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${gesamt > 0 ? (versichertWert / gesamt) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-sm tabular-nums">
              <span className="font-semibold">{fmtEur(versichertWert)}</span>
              <span className="text-muted-foreground"> von {fmtEur(gesamt)} versichert</span>
            </p>
            {unversichertTeuer.length > 0 && (
              <p className="mt-1 text-[11px] text-danger">
                {unversichertTeuer.length} {unversichertTeuer.length === 1 ? 'Stück' : 'Stücke'} ab 1.000 € ohne Versicherung
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Verteilung</p>
            <ul className="mt-2 space-y-1.5">
              {verteilung.slice(0, 4).map(v => (
                <li key={v.key} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">{v.label}</span>
                    <span className="tabular-nums">{Math.round(v.anteil)} %</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground/40" style={{ width: `${v.anteil}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bewegung</p>
            {gewinner && verlierer ? (
              <ul className="mt-2 space-y-2 text-xs">
                {[gewinner, verlierer].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                  <li key={v.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{v.name}</span>
                    <span className={`shrink-0 font-medium tabular-nums ${(v.rendite_prozent ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                      {(v.rendite_prozent ?? 0) >= 0 ? '+' : ''}{v.rendite_prozent} %
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Noch keine Wertentwicklung.</p>
            )}
            {veraltetAnzahl > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {veraltetAnzahl} {veraltetAnzahl === 1 ? 'Wert' : 'Werte'} seit über einem Jahr nicht aktualisiert
              </p>
            )}
          </div>
        </div>
      )}

      <InventoryClient items={itemsMitBild} locale={locale} />

      <SoldList items={verkauft} locale={locale} />
    </div>
  )
}

function Kennzahl({
  label, value, className = '', hint,
}: {
  label: string
  value: string
  className?: string
  hint?: string
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${className}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
