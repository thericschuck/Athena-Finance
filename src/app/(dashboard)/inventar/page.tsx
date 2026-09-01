import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { fmtCurrency } from '@/lib/format'
import { InventoryClient } from '@/components/inventar/InventoryClient'
import { gesamtwert, type Valuable, type ValuableImage, type ValuableWithImage } from '@/lib/valuables'
import { Gem } from 'lucide-react'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: rows }, { data: bildRows }, settings] = await Promise.all([
    supabase
      .from('valuables_current')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('valuable_images')
      .select('id, valuable_id, pfad, art, ist_hauptbild, created_at, hinweis, prompt, basis_bild_id')
      .eq('user_id', user.id)
      // Hauptbild zuerst, danach das Neueste — dieselbe Reihenfolge wie in der View, damit
      // Galerie und angezeigtes Hauptbild nicht auseinanderlaufen.
      .order('ist_hauptbild', { ascending: false })
      .order('created_at', { ascending: false }),
    getSettings(user.id),
  ])

  const locale = (settings.number_format as string) ?? 'de-DE'
  const items = (rows ?? []) as Valuable[]

  type BildRow = {
    id: string; valuable_id: string; pfad: string
    art: string; ist_hauptbild: boolean; created_at: string
    hinweis: string | null; prompt: string | null; basis_bild_id: string | null
  }
  const bilder = (bildRows ?? []) as BildRow[]

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
  }))

  const summe = gesamtwert(items, true)
  const eingekauft = items.reduce((s, v) => s + (v.kaufpreis ?? 0), 0)
  // Nur über die Stücke, bei denen beide Zahlen bekannt sind — sonst vergleicht man eine
  // Summe aus zehn Werten mit einer aus sechs Kaufpreisen und nennt die Differenz Rendite.
  const bewertbar = items.filter(v => v.kaufpreis != null && v.kaufpreis > 0 && v.aktueller_wert != null)
  const bwWert = bewertbar.reduce((s, v) => s + (v.aktueller_wert ?? 0), 0)
  const bwKauf = bewertbar.reduce((s, v) => s + (v.kaufpreis ?? 0), 0)
  const rendite = bwKauf > 0 ? ((bwWert - bwKauf) / bwKauf) * 100 : null

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

      <InventoryClient items={itemsMitBild} locale={locale} />
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
