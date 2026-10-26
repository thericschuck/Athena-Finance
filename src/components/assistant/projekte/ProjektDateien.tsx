'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  loescheProjektDatei,
  projektDateiUrl,
  registerProjektDatei,
} from '@/app/(dashboard)/assistant/projekt-actions'
import {
  DATEI_ACCEPT,
  MODELL_BILD_TYPEN,
  dateiArt,
  formatGroesse,
  normalisierterMediaType,
  pruefeDatei,
  uploadPfad,
  ATHENA_BUCKET,
} from '@/lib/assistant/dateien'
import { PROJEKT_AUSZUG_BUDGET, type ProjektDatei } from '@/lib/assistant/projekte'

/** Die API nimmt höchstens 5 MB je Bild; darüber (und bei fremden Formaten) wird verkleinert. */
const BILD_VERKLEINERN_AB = 3 * 1024 * 1024
const BILD_MAX_KANTE = 2000
const BILD_QUALITAET = 0.85

type Stand = 'wartet' | 'laedt' | 'liest' | 'fehler'

interface Vorgang {
  key: string
  name: string
  stand: Stand
  fehler?: string
}

const STAND_TEXT: Record<Stand, string> = {
  wartet: 'wartet',
  laedt: 'lädt hoch…',
  liest: 'liest Text aus…',
  fehler: 'Fehler',
}

/** `null`, wenn der Browser das Bild nicht dekodieren kann (z. B. HEIC in Chrome). */
async function verkleinereBild(datei: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(datei)
    const faktor = Math.min(1, BILD_MAX_KANTE / Math.max(bitmap.width, bitmap.height))
    const breite = Math.max(1, Math.round(bitmap.width * faktor))
    const hoehe = Math.max(1, Math.round(bitmap.height * faktor))
    const canvas = document.createElement('canvas')
    canvas.width = breite
    canvas.height = hoehe
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Weißer Grund: JPEG kennt keine Transparenz, PNGs würden sonst schwarz.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, breite, hoehe)
    ctx.drawImage(bitmap, 0, 0, breite, hoehe)
    bitmap.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', BILD_QUALITAET))
    if (!blob) return null
    const name = datei.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg' })
  } catch {
    return null
  }
}

function brauchtVerkleinerung(datei: File): boolean {
  if (dateiArt(datei.type, datei.name) !== 'bild') return false
  const typ = normalisierterMediaType(datei.type, datei.name)
  return !(MODELL_BILD_TYPEN as readonly string[]).includes(typ) || datei.size > BILD_VERKLEINERN_AB
}

function ArtIcon({ datei }: { datei: ProjektDatei }) {
  const art = dateiArt(datei.mediaType, datei.name)
  const Icon = art === 'bild' ? ImageIcon : FileText
  return <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
}

const ZAHL = new Intl.NumberFormat('de-DE')

export function ProjektDateien({
  projectId,
  dateien,
  auszugGesamt,
}: {
  projectId: string
  dateien: ProjektDatei[]
  auszugGesamt: number
}) {
  const router = useRouter()
  const eingabe = useRef<HTMLInputElement>(null)
  const [vorgaenge, setVorgaenge] = useState<Vorgang[]>([])
  const [aktiv, setAktiv] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Dieselbe Reihenfolge wie `projektKontext`: was nicht mehr ins Budget passt, bleibt draußen.
  let rest = PROJEKT_AUSZUG_BUDGET
  const passtNicht = new Set<string>()
  for (const d of dateien) {
    if (d.auszugZeichen === 0) continue
    if (d.auszugZeichen > rest) passtNicht.add(d.id)
    else rest -= d.auszugZeichen
  }
  const anteil = Math.min(100, Math.round((auszugGesamt / PROJEKT_AUSZUG_BUDGET) * 100))
  const voll = passtNicht.size > 0

  function setzeStand(key: string, stand: Stand, fehlerText?: string) {
    setVorgaenge((alt) => alt.map((v) => (v.key === key ? { ...v, stand, fehler: fehlerText } : v)))
  }

  function entferneVorgang(key: string) {
    setVorgaenge((alt) => alt.filter((v) => v.key !== key))
  }

  async function ladeHoch(roh: File, key: string, userId: string) {
    const supabase = createClient()
    let datei = roh
    if (brauchtVerkleinerung(roh)) {
      const klein = await verkleinereBild(roh)
      if (klein) datei = klein
      else if (roh.size > 5 * 1024 * 1024) {
        throw new Error('Bild konnte nicht verkleinert werden und ist zu groß (max. 5 MB)')
      }
    }

    const mediaType = normalisierterMediaType(datei.type, datei.name)
    const pfad = uploadPfad(userId, { projectId }, crypto.randomUUID(), datei.name)
    setzeStand(key, 'laedt')
    const { error } = await supabase.storage
      .from(ATHENA_BUCKET)
      .upload(pfad, datei, { contentType: mediaType, upsert: false })
    if (error) throw new Error(error.message)

    setzeStand(key, 'liest')
    const res = await registerProjektDatei({
      projectId,
      pfad,
      name: datei.name,
      mediaType,
      groesse: datei.size,
    })
    if ('error' in res) {
      // Zeile nicht angelegt: Objekt wieder wegräumen, sonst liegt es verwaist im Bucket.
      await supabase.storage.from(ATHENA_BUCKET).remove([pfad])
      throw new Error(res.error)
    }
  }

  async function onDateien(e: React.ChangeEvent<HTMLInputElement>) {
    const gewaehlt = Array.from(e.target.files ?? [])
    if (eingabe.current) eingabe.current.value = ''
    if (gewaehlt.length === 0) return
    setFehler(null)

    const { data } = await createClient().auth.getUser()
    if (!data.user) {
      setFehler('Nicht eingeloggt')
      return
    }
    const userId = data.user.id

    // Vorab prüfen: abgelehnte Dateien erscheinen als Fehlerzeile, die anderen laufen weiter.
    const neue: Vorgang[] = []
    const gueltig: { datei: File; key: string }[] = []
    for (const datei of gewaehlt) {
      const key = crypto.randomUUID()
      const grund = pruefeDatei(datei)
      if (grund) neue.push({ key, name: datei.name, stand: 'fehler', fehler: grund })
      else {
        neue.push({ key, name: datei.name, stand: 'wartet' })
        gueltig.push({ datei, key })
      }
    }
    setVorgaenge((alt) => [...alt.filter((v) => v.stand === 'fehler'), ...neue])
    setAktiv(true)

    for (const { datei, key } of gueltig) {
      try {
        await ladeHoch(datei, key, userId)
        entferneVorgang(key)
        router.refresh()
      } catch (err) {
        setzeStand(key, 'fehler', err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      }
    }
    setAktiv(false)
  }

  function loeschen(id: string) {
    setFehler(null)
    startTransition(async () => {
      const res = await loescheProjektDatei(id)
      if (res && 'error' in res) setFehler(res.error)
      else router.refresh()
    })
  }

  function oeffnen(id: string) {
    setFehler(null)
    startTransition(async () => {
      const res = await projektDateiUrl(id)
      if ('error' in res) setFehler(res.error)
      else window.open(res.url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          PDF, Bilder, CSV und Text. Athena liest den Textauszug in jedem Chat des Projekts mit.
        </p>
        <input
          ref={eingabe}
          type="file"
          multiple
          accept={DATEI_ACCEPT}
          onChange={onDateien}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <Button
          variant="outline"
          className="h-10 shrink-0 sm:h-8"
          disabled={aktiv}
          onClick={() => eingabe.current?.click()}
        >
          {aktiv ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Hochladen
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Füllstand der Auszüge</span>
          <span className={cn('tabular-nums', voll && 'font-medium text-destructive')}>
            {ZAHL.format(auszugGesamt)} / {ZAHL.format(PROJEKT_AUSZUG_BUDGET)} Zeichen
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={PROJEKT_AUSZUG_BUDGET}
          aria-valuenow={Math.min(auszugGesamt, PROJEKT_AUSZUG_BUDGET)}
          aria-label="Füllstand der Dateiauszüge"
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full', voll ? 'bg-destructive' : anteil >= 85 ? 'bg-amber-500' : 'bg-foreground')}
            style={{ width: `${anteil}%` }}
          />
        </div>
        {voll && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Voll: Dateien mit dem Hinweis „passt nicht mehr“ bleiben außerhalb des Prompts. Athena
              erfährt nur ihren Namen. Kleinere oder weniger Dateien helfen.
            </span>
          </p>
        )}
      </div>

      {fehler && (
        <p role="alert" className="text-sm text-destructive">
          {fehler}
        </p>
      )}

      {vorgaenge.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {vorgaenge.map((v) => (
            <li key={v.key} className="flex min-h-12 items-center gap-2 px-3 py-2">
              {v.stand === 'fehler' ? (
                <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
              ) : (
                <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{v.name}</span>
                <span
                  className={cn(
                    'block text-xs',
                    v.stand === 'fehler' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {v.stand === 'fehler' ? (v.fehler ?? STAND_TEXT.fehler) : STAND_TEXT[v.stand]}
                </span>
              </span>
              {v.stand === 'fehler' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 shrink-0 sm:h-8"
                  onClick={() => entferneVorgang(v.key)}
                >
                  Schließen
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dateien.length === 0 && vorgaenge.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Noch keine Dateien.
        </p>
      ) : (
        dateien.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {dateien.map((d) => (
              <li key={d.id} className="flex items-center gap-2 pl-3 pr-1">
                <button
                  type="button"
                  onClick={() => oeffnen(d.id)}
                  disabled={isPending}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 text-left disabled:opacity-60"
                  aria-label={`${d.name} öffnen`}
                >
                  <ArtIcon datei={d} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{d.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatGroesse(d.groesse)} ·{' '}
                      {d.auszugZeichen > 0
                        ? `Auszug ${ZAHL.format(d.auszugZeichen)} Zeichen`
                        : 'kein Textauszug'}
                      {passtNicht.has(d.id) && (
                        <span className="font-medium text-destructive"> · passt nicht mehr</span>
                      )}
                    </span>
                    {d.auszugZeichen === 0 && (
                      <span className="block text-xs text-muted-foreground">
                        Athena kennt nur den Namen. Text lässt sich bei Scans, HEIC oder Lesefehlern
                        nicht auslesen.
                      </span>
                    )}
                  </span>
                </button>
                <ConfirmDialog
                  title="Datei löschen?"
                  description={`„${d.name}“ wird aus dem Projekt und dem Speicher entfernt. Das lässt sich nicht zurückholen.`}
                  onConfirm={() => loeschen(d.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-10 shrink-0"
                    aria-label={`${d.name} löschen`}
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </ConfirmDialog>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
