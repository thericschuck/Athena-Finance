'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  registerDocument, deleteDocument, listDocuments,
  type DokumentArt, type ValuableDocument,
} from '@/app/(dashboard)/inventar/document-actions'

const ARTEN: { value: DokumentArt; label: string }[] = [
  { value: 'beleg', label: 'Kaufbeleg' },
  { value: 'zertifikat', label: 'Zertifikat' },
  { value: 'rechnung', label: 'Rechnung' },
  { value: 'police', label: 'Police' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

/** Muss zum Bucket passen (15 MB, nur PDF/Bild) — sonst lehnt er STUMM ab. */
const MAX_BYTES = 15 * 1024 * 1024
const ERLAUBT = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]

const DATUM = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function groesseText(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Dateiname so säubern, dass er als Storage-Pfad taugt (Anzeigename bleibt original). */
function pfadName(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80)
}

export function ValuableDocuments({ valuableId }: { valuableId: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dokumente, setDokumente] = useState<ValuableDocument[]>([])
  const [laedt, setLaedt] = useState(true)
  const [art, setArt] = useState<DokumentArt>('beleg')
  const [upload, setUpload] = useState<{ fertig: number; gesamt: number } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Welches Dokument gerade auf die Löschbestätigung wartet.
  const [bestaetige, setBestaetige] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const laden = useCallback(async () => {
    const res = await listDocuments(valuableId)
    if (res.error) setFehler(res.error)
    else setDokumente(res.documents)
    setLaedt(false)
  }, [valuableId])

  useEffect(() => {
    void laden()
  }, [laden])

  async function onDateien(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = Array.from(e.target.files ?? [])
    if (dateien.length === 0) return
    setFehler(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setFehler('Nicht eingeloggt')
      return
    }

    setUpload({ fertig: 0, gesamt: dateien.length })
    for (let i = 0; i < dateien.length; i++) {
      const datei = dateien[i]
      if (!ERLAUBT.includes(datei.type)) {
        setFehler(`${datei.name}: nur PDF oder Bild (JPG, PNG, WebP, HEIC)`)
        break
      }
      if (datei.size > MAX_BYTES) {
        setFehler(`${datei.name}: größer als 15 MB`)
        break
      }

      // Pfad MUSS mit der User-ID beginnen — darauf prüft die Storage-Policy.
      const pfad = `${user.id}/${valuableId}-${Date.now()}-${i}-${pfadName(datei.name)}`
      const { error } = await supabase.storage
        .from('valuable-documents')
        .upload(pfad, datei, { contentType: datei.type, upsert: false })
      if (error) {
        setFehler(`${datei.name}: ${error.message}`)
        break
      }

      const res = await registerDocument(valuableId, pfad, datei.name, art, datei.size)
      if (res.error) {
        // Zeile nicht angelegt → Datei wieder wegräumen, sonst liegt sie verwaist im Bucket.
        await supabase.storage.from('valuable-documents').remove([pfad])
        setFehler(res.error)
        break
      }
      setUpload({ fertig: i + 1, gesamt: dateien.length })
    }

    if (fileRef.current) fileRef.current.value = ''
    setUpload(null)
    await laden()
  }

  async function loeschen(id: string) {
    setBusyId(id)
    const res = await deleteDocument(id)
    setBusyId(null)
    setBestaetige(null)
    if (res.error) setFehler(res.error)
    else await laden()
  }

  const beschaeftigt = upload !== null || busyId !== null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={art} onValueChange={v => setArt(v as DokumentArt)} disabled={beschaeftigt}>
          <SelectTrigger size="sm" className="h-8 w-auto min-w-[8rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARTEN.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline" size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={beschaeftigt}
        >
          {upload
            ? <Loader2 className="size-3.5 animate-spin" />
            : <Upload className="size-3.5" />}
          {upload ? `Lade ${upload.fertig + 1} von ${upload.gesamt}…` : 'Dokument hochladen'}
        </Button>
        <input
          ref={fileRef} type="file" multiple
          accept="application/pdf,image/*"
          className="hidden" onChange={onDateien}
        />
      </div>

      {laedt ? (
        <div role="status" aria-busy="true" className="divide-y divide-border rounded-lg border">
          <span className="sr-only">Dokumente werden geladen</span>
          {[0, 1].map(i => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <Skeleton className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : dokumente.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Noch keine Dokumente. PDF oder Foto, bis 15 MB — Kaufbeleg, Zertifikat, Rechnung, Police.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {dokumente.map(d => {
            const istPdf = /\.pdf$/i.test(d.name)
            const Icon = istPdf ? FileText : ImageIcon
            const artLabel = ARTEN.find(a => a.value === d.art)?.label ?? d.art
            return (
              <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {d.url ? (
                    <a
                      href={d.url} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-sm hover:underline"
                    >
                      {d.name}
                    </a>
                  ) : (
                    <span className="block truncate text-sm">{d.name}</span>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {artLabel} · {DATUM.format(new Date(d.created_at))}
                    {d.groesse != null && ` · ${groesseText(d.groesse)}`}
                  </p>
                </div>

                {bestaetige === d.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="destructive" size="sm" className="h-7 text-xs"
                      onClick={() => loeschen(d.id)} disabled={busyId !== null}
                    >
                      {busyId === d.id && <Loader2 className="size-3 animate-spin" />}
                      Löschen
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setBestaetige(null)} disabled={busyId !== null}
                    >
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setBestaetige(d.id)}
                    disabled={beschaeftigt}
                    aria-label={`${d.name} löschen`}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {fehler && <p className="text-sm text-danger">{fehler}</p>}
    </div>
  )
}
