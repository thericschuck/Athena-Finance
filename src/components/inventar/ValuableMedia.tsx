'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Wand2, Loader2, X, Star, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  registerValuableImage, setHauptbild, deleteValuableImage,
} from '@/app/(dashboard)/inventar/actions'
import { ValuableIcon } from './ValuableIcon'
import {
  wertstufe, HINWEIS_MAX, MAX_VORLAGEN,
  type ValuableImage, type ValuableWithImage,
} from '@/lib/valuables'

/** „Nur Beschreibung" als Auswahlwert — Radix-Select verträgt keinen leeren String. */
const OHNE_VORLAGE = '__ohne__'

/** Alle Fotos zusammen als Vorlage — der Normalfall, sobald es mehr als eins gibt. */
const ALLE_FOTOS = '__alle_fotos__'

/** Längste Kante nach dem Verkleinern. 1024 ist genau die Größe, in der generiert wird. */
const MAX_KANTE = 1600
const JPEG_QUALITAET = 0.9

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

/**
 * Bild vor dem Upload verkleinern und nach JPEG wandeln.
 *
 * Ein aktuelles Handyfoto hat 4–12 MB; als Vorlage für ein 1024er-Bild ist davon nichts
 * nötig. Nebeneffekt: alles landet als JPEG im Bucket, unabhängig davon, was die Kamera
 * geliefert hat.
 *
 * Kann der Browser die Datei nicht decodieren — HEIC etwa kann außerhalb von Safari
 * niemand —, wird das Original hochgeladen statt den Upload scheitern zu lassen. Lieber
 * eine Datei, die man später konvertiert, als eine verlorene.
 */
async function verkleinern(datei: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(datei)
    const faktor = Math.min(1, MAX_KANTE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * faktor)
    const h = Math.round(bitmap.height * faktor)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return datei
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>(res =>
      canvas.toBlob(res, 'image/jpeg', JPEG_QUALITAET),
    )
    if (!blob) return datei
    return new File([blob], datei.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return datei
  }
}

export function ValuableMedia({ item }: { item: ValuableWithImage }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [ladeStand, setLadeStand] = useState<{ fertig: number; gesamt: number } | null>(null)
  const [generiert, setGeneriert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  // Was die Route tatsächlich benutzt hat. Ohne diese Rückmeldung ist von außen nicht zu
  // unterscheiden, ob das Foto als Vorlage diente oder ob frei nach Beschreibung gezeichnet
  // wurde — und genau daran hing zuletzt eine halbe Stunde Fehlersuche.
  const [letzterWeg, setLetzterWeg] = useState<'foto' | 'artwork' | 'text' | null>(null)
  const [busyBild, setBusyBild] = useState<string | null>(null)
  // Der Änderungswunsch für die nächste Runde. Bleibt nach dem Lauf stehen: meist braucht
  // es zwei, drei Anläufe an derselben Stelle, und das Feld jedes Mal neu zu tippen wäre
  // die häufigste Handbewegung überhaupt.
  const [hinweis, setHinweis] = useState('')

  const fotos = useMemo(() => item.bilder.filter(b => b.art === 'foto'), [item.bilder])
  const artworks = useMemo(() => item.bilder.filter(b => b.art === 'artwork'), [item.bilder])

  // Die Auswahl wird NICHT beim ersten Rendern festgenagelt: wer das Panel öffnet, bevor es
  // Fotos gibt, und dann eins hochlädt, hätte sonst weiterhin „keine Vorlage" ausgewählt —
  // und das Artwork entstünde ohne sein Foto, obwohl eins da ist. `null` heißt „noch nicht
  // entschieden" und folgt dem ersten verfügbaren Foto; eine bewusste Wahl bleibt bestehen,
  // solange das gewählte Bild existiert.
  const [wahl, setWahl] = useState<string | null>(null)
  const vorgabe =
    fotos.length > 1 ? ALLE_FOTOS : fotos[0]?.id ?? OHNE_VORLAGE
  const vorlage =
    wahl === OHNE_VORLAGE || wahl === ALLE_FOTOS ? wahl
    : wahl && item.bilder.some(b => b.id === wahl) ? wahl
    : vorgabe

  /** Aus der einen Auswahl werden die Bild-IDs, die tatsächlich mitgehen. */
  const vorlageIds =
    vorlage === OHNE_VORLAGE ? []
    : vorlage === ALLE_FOTOS ? fotos.slice(0, MAX_VORLAGEN).map(f => f.id)
    : [vorlage]

  const gewaehltesBild = item.bilder.find(b => b.id === vorlage) ?? null
  const istVerfeinerung = gewaehltesBild?.art === 'artwork'

  /** Das Artwork, dessen Herkunft unter den Knöpfen steht — das gerade angezeigte. */
  const gezeigtesArtwork =
    artworks.find(a => a.ist_hauptbild) ?? artworks[0] ?? null

  const stufe = wertstufe(item.aktueller_wert)
  const beschaeftigt = ladeStand !== null || generiert || busyBild !== null

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function onDateien(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = Array.from(e.target.files ?? [])
    if (dateien.length === 0) return
    setFehler(null)
    setLadeStand({ fertig: 0, gesamt: dateien.length })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setFehler('Nicht eingeloggt')
      setLadeStand(null)
      return
    }

    for (let i = 0; i < dateien.length; i++) {
      const klein = await verkleinern(dateien[i])
      const endung = klein.type === 'image/jpeg' ? 'jpg' : (klein.name.split('.').pop() ?? 'jpg')
      // Pfad MUSS mit der User-ID beginnen — genau darauf prüft die Storage-Policy.
      const pfad = `${user.id}/${item.id}-foto-${Date.now()}-${i}.${endung}`

      const { error } = await supabase.storage
        .from('valuables')
        .upload(pfad, klein, { contentType: klein.type, upsert: false })

      if (error) {
        setFehler(`${dateien[i].name}: ${error.message}`)
        break
      }
      const res = await registerValuableImage(item.id, pfad, 'foto')
      if (res.error) {
        // Zeile nicht angelegt → Datei wieder wegräumen, sonst liegt sie verwaist im Bucket.
        await supabase.storage.from('valuables').remove([pfad])
        setFehler(res.error)
        break
      }
      setLadeStand({ fertig: i + 1, gesamt: dateien.length })
    }

    if (fileRef.current) fileRef.current.value = ''
    setLadeStand(null)
    router.refresh()
  }

  // ── Artwork ─────────────────────────────────────────────────────────────────
  async function generieren() {
    setGeneriert(true)
    setFehler(null)
    try {
      const res = await fetch('/api/inventar/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          basisBildIds: vorlageIds,
          hinweis: hinweis.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFehler(data.error ?? `Fehler ${res.status}`)
        return
      }
      setLetzterWeg(data.basis ?? 'text')
      // Nach einem geglückten Lauf soll die nächste Runde auf DEM Ergebnis aufsetzen, nicht
      // wieder bei den Fotos anfangen — sonst wirft „nochmal, aber dunkler" alles weg, was
      // schon stimmte.
      if (typeof data.bildId === 'string') setWahl(data.bildId)
      router.refresh()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setGeneriert(false)
    }
  }

  async function hauptbild(bildId: string) {
    setBusyBild(bildId)
    const res = await setHauptbild(bildId, item.id)
    setBusyBild(null)
    if (res.error) setFehler(res.error)
    else router.refresh()
  }

  async function loeschen(bildId: string) {
    setBusyBild(bildId)
    const res = await deleteValuableImage(bildId)
    setBusyBild(null)
    if (res.error) setFehler(res.error)
    else router.refresh()
  }

  /** Beschriftung eines Bildes im Auswahlfeld. */
  function vorlageLabel(bild: ValuableImage): string {
    if (bild.art === 'artwork') {
      return `Artwork verfeinern · ${ZEIT.format(new Date(bild.created_at))}`
    }
    return `Foto ${fotos.indexOf(bild) + 1}`
  }

  return (
    <div className="space-y-3">
      {/* ── Hauptbild ─────────────────────────────────────────────────────── */}
      <div
        className="relative aspect-square overflow-hidden rounded-xl border"
        style={{
          borderColor: stufe.border,
          background: `radial-gradient(120% 80% at 50% 100%, ${stufe.glow}, transparent 70%)`,
        }}
      >
        {item.anzeige_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.anzeige_url}
            alt={item.name}
            className={`absolute inset-0 size-full object-contain p-4 transition-all duration-500 ${
              generiert ? 'scale-95 opacity-30 blur-sm' : ''
            }`}
          />
        ) : (
          <ValuableIcon
            kategorie={item.kategorie}
            className={`absolute inset-0 m-auto size-2/5 text-muted-foreground/50 transition-all duration-500 ${
              generiert ? 'opacity-20' : ''
            }`}
          />
        )}

        {/* Generierungszustand. Ein Fortschrittsbalken wäre gelogen — die API meldet keinen
            Fortschritt, und ein Balken, der bei 90 % stehen bleibt, ist schlimmer als
            keiner. Stattdessen ein durchlaufender Schimmer: er sagt „es passiert etwas",
            ohne eine Restzeit zu behaupten. */}
        {generiert && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/40 backdrop-blur-[2px]">
            <span className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-foreground/15 to-transparent motion-safe:animate-[inventar-sheen_1.6s_ease-in-out_infinite]" />
            <Sparkles className="size-6 animate-pulse" style={{ color: 'var(--chart-accent)' }} />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {istVerfeinerung ? 'Artwork wird überarbeitet…' : 'Artwork wird gezeichnet…'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {vorlageIds.length === 0
                  ? 'aus der Beschreibung'
                  : vorlageIds.length === 1
                    ? istVerfeinerung ? 'nach dem bisherigen Bild' : 'nach deinem Foto'
                    : `nach ${vorlageIds.length} Fotos`}
                {' · dauert meist 15–30 Sekunden'}
              </p>
            </div>
          </div>
        )}

        {ladeStand && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-[2px]">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">
              Lade {ladeStand.fertig + 1} von {ladeStand.gesamt}…
            </p>
          </div>
        )}

        <span className="absolute left-3 top-3 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
          {stufe.label}
        </span>
      </div>

      {/* ── Galerie ───────────────────────────────────────────────────────── */}
      {item.bilder.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.bilder.map(b => (
            <div key={b.id} className="group/thumb relative">
              <button
                type="button"
                onClick={() => hauptbild(b.id)}
                disabled={beschaeftigt}
                title={b.ist_hauptbild ? 'Wird angezeigt' : 'Als Hauptbild zeigen'}
                className={`relative block size-16 overflow-hidden rounded-lg border transition-colors ${
                  b.ist_hauptbild ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                {b.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                    ?
                  </span>
                )}
                {busyBild === b.id && (
                  <span className="absolute inset-0 grid place-items-center bg-background/60">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                )}
                {b.ist_hauptbild && (
                  <span className="absolute bottom-0.5 right-0.5 rounded-full bg-primary p-0.5 text-primary-foreground">
                    <Star className="size-2.5 fill-current" />
                  </span>
                )}
                {b.art === 'artwork' && (
                  <span
                    className="absolute left-0.5 top-0.5 rounded-full p-0.5"
                    style={{ background: 'var(--chart-accent)' }}
                    title="Generiert"
                  >
                    <Wand2 className="size-2.5 text-background" />
                  </span>
                )}
              </button>

              {/* Welche Bilder in den nächsten Lauf gehen. Ein Ring statt eines Häkchens:
                  die Miniatur ist schon ein Knopf (Hauptbild setzen), ein zweiter
                  Klickbereich darauf wäre eine Falle. */}
              {vorlageIds.includes(b.id) && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-[var(--chart-accent)]"
                />
              )}

              <button
                type="button"
                onClick={() => loeschen(b.id)}
                disabled={beschaeftigt}
                aria-label="Bild entfernen"
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Bedienung ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline" size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={beschaeftigt}
        >
          <Upload className="size-3.5" />
          Fotos
        </Button>
        <input
          ref={fileRef} type="file" accept="image/*" multiple
          className="hidden" onChange={onDateien}
        />

        {/* Die Vorlage ist eine echte Entscheidung: bei einer Uhr sieht das Ergebnis völlig
            anders aus, je nachdem ob Zifferblatt oder Gehäuseboden abgebildet ist — und ob
            überhaupt neu gezeichnet oder das bestehende Artwork nur überarbeitet wird. */}
        {item.bilder.length > 0 && (
          <Select value={vorlage} onValueChange={setWahl} disabled={beschaeftigt}>
            <SelectTrigger size="sm" className="h-8 w-auto min-w-[11rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fotos.length > 1 && (
                <SelectItem value={ALLE_FOTOS}>
                  Alle Fotos ({Math.min(fotos.length, MAX_VORLAGEN)})
                </SelectItem>
              )}
              {fotos.map(f => (
                <SelectItem key={f.id} value={f.id}>{vorlageLabel(f)}</SelectItem>
              ))}
              {artworks.map(a => (
                <SelectItem key={a.id} value={a.id}>{vorlageLabel(a)}</SelectItem>
              ))}
              <SelectItem value={OHNE_VORLAGE}>Nur Beschreibung</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" onClick={generieren} disabled={beschaeftigt}>
          {generiert ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          {istVerfeinerung ? 'Überarbeiten' : 'Artwork erzeugen'}
        </Button>
      </div>

      {/* Der Änderungswunsch — der eine Satz, der diese Runde von der letzten unterscheidet.
          Er geht ans Ende des Prompts und schlägt dort den Stilblock, wo beide sich
          widersprechen (siehe baueArtworkPrompt). */}
      <Input
        value={hinweis}
        onChange={e => setHinweis(e.target.value.slice(0, HINWEIS_MAX))}
        disabled={beschaeftigt}
        placeholder={
          istVerfeinerung
            ? 'Was soll anders werden? „dunklerer Hintergrund", „mehr Patina"'
            : 'Änderungswunsch (optional) — z. B. „von vorn", „wärmeres Licht"'
        }
        className="h-8 text-xs"
      />

      {letzterWeg && !generiert && (
        <p className="text-[11px]" style={{ color: 'var(--chart-accent)' }}>
          {letzterWeg === 'foto' && 'Zuletzt aus deinen Fotos gezeichnet.'}
          {letzterWeg === 'artwork' && 'Zuletzt das bestehende Artwork überarbeitet.'}
          {letzterWeg === 'text' && 'Zuletzt frei nach der Beschreibung gezeichnet — ohne Vorlagenbild.'}
        </p>
      )}

      {/* Womit das gezeigte Bild entstanden ist. Ohne diese Zeile ist nach zwei Tagen nicht
          mehr rekonstruierbar, was man beim letzten Mal eigentlich verlangt hat — und man
          verlangt es beim nächsten Anlauf entweder doppelt oder gar nicht. */}
      {gezeigtesArtwork?.hinweis && !generiert && (
        <p className="text-[11px] text-muted-foreground">
          Zuletzt verlangt: „{gezeigtesArtwork.hinweis}“
          {' '}
          <button
            type="button"
            onClick={() => setHinweis(gezeigtesArtwork.hinweis ?? '')}
            className="underline underline-offset-2 hover:text-foreground"
          >
            übernehmen
          </button>
        </p>
      )}

      {gezeigtesArtwork?.prompt && (
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">
            Prompt des gezeigten Artworks
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words border-l border-border pl-2 font-mono leading-relaxed">
            {gezeigtesArtwork.prompt}
          </p>
        </details>
      )}

      <p className="text-[11px] text-muted-foreground">
        {fotos.length > 0
          ? 'Fotos bleiben erhalten — jedes Artwork kommt als zusätzliches Bild dazu. Miniatur anklicken macht es zum Hauptbild.'
          : 'Ohne Foto entsteht das Artwork allein aus Marke, Modell, Referenz, Zustand und Notizen.'}
      </p>

      {fehler && <p className="text-sm text-danger">{fehler}</p>}
    </div>
  )
}
