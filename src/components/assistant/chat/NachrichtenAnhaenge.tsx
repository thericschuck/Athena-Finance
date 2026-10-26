'use client'

import { memo, useEffect, useMemo, useState } from 'react'
import type { FileUIPart, UIMessage } from 'ai'
import { signAthenaFileUrls } from '@/app/(dashboard)/assistant/datei-actions'
import { dateiArt, pfadAusStorageUrl } from '@/lib/assistant/dateien'
import { kuerzeName } from '@/lib/assistant/anhaenge'
import { DateiIcon } from '@/components/assistant/chat/AnhangChips'

/**
 * Signierte URLs gelten eine Stunde; hier zwei Minuten Reserve. Der Cache liegt auf Modulebene,
 * damit ein Remount (Session-Wechsel, Sheet auf/zu) nicht erneut signiert.
 */
const GUELTIG_MS = 55 * 60 * 1000
const cache = new Map<string, { url: string; bis: number }>()
const laufend = new Map<string, Promise<void>>()

function ausCache(pfad: string): string | undefined {
  const e = cache.get(pfad)
  return e && e.bis > Date.now() ? e.url : undefined
}

async function lade(pfade: string[]): Promise<void> {
  const fehlend = pfade.filter((p) => !ausCache(p) && !laufend.has(p))
  if (fehlend.length > 0) {
    const anfrage = signAthenaFileUrls(fehlend)
      .then((urls) => {
        for (const [pfad, url] of Object.entries(urls)) cache.set(pfad, { url, bis: Date.now() + GUELTIG_MS })
      })
      .catch(() => {
        // Ohne URL bleibt der Chip ohne Link — kein Grund, den Verlauf zu stören.
      })
      .finally(() => {
        for (const p of fehlend) laufend.delete(p)
      })
    for (const p of fehlend) laufend.set(p, anfrage)
  }
  await Promise.all(pfade.map((p) => laufend.get(p)))
}

function dateiTeile(parts: UIMessage['parts']): FileUIPart[] {
  return parts.filter((p): p is FileUIPart => p.type === 'file')
}

/**
 * Dateien einer Nutzernachricht: Bilder als kleine Vorschau, PDF/Text als Chip. Je Nachricht
 * werden die URLs einmal geholt (und gemerkt), nicht bei jedem gestreamten Wort — die Komponente
 * hängt nur an den Dateiteilen DIESER Nachricht. Ohne auflösbare URL (alte Sessions, fremder
 * Pfad) bleibt es bei der Anzeige ohne Link.
 */
export const NachrichtenAnhaenge = memo(function NachrichtenAnhaenge({
  parts,
}: {
  parts: UIMessage['parts']
}) {
  const dateien = useMemo(() => dateiTeile(parts), [parts])
  const pfade = useMemo(
    () => dateien.flatMap((d) => (d.url ? [pfadAusStorageUrl(d.url)] : [])).filter((p): p is string => !!p),
    [dateien],
  )
  const schluessel = pfade.join('|')
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!schluessel) return
    let aktiv = true
    void lade(schluessel.split('|')).then(() => {
      if (aktiv) setVersion((v) => v + 1)
    })
    return () => {
      aktiv = false
    }
  }, [schluessel])

  if (dateien.length === 0) return null

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {dateien.map((d, i) => {
        const name = d.filename || 'Datei'
        const pfad = d.url ? pfadAusStorageUrl(d.url) : null
        // Direkt nutzbare URLs (z. B. frisch gewählte Daten) gelten, `storage:` braucht die Signatur.
        const url = pfad ? ausCache(pfad) : d.url?.startsWith('http') || d.url?.startsWith('blob:') ? d.url : undefined
        const art = dateiArt(d.mediaType ?? '', name)

        if (art === 'bild') {
          return url ? (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} öffnen`}
              className="block overflow-hidden rounded-lg border border-border"
            >
              {/* Signierte, wechselnde URL aus dem Bucket — next/image brächte hier nur Konfiguration. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={name} loading="lazy" className="size-20 object-cover sm:size-24" />
            </a>
          ) : (
            <div
              key={i}
              role="img"
              aria-label={name}
              className="flex size-20 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground sm:size-24"
            >
              <DateiIcon art="bild" name={name} className="size-5" />
            </div>
          )
        }

        const inhalt = (
          <>
            <DateiIcon art={art ?? 'text'} name={name} className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[10rem] truncate">{kuerzeName(name)}</span>
          </>
        )
        const klasse =
          'flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-foreground'
        return url ? (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${klasse} transition-colors hover:bg-accent`}
          >
            {inhalt}
          </a>
        ) : (
          <span key={i} className={klasse}>
            {inhalt}
          </span>
        )
      })}
    </div>
  )
})
