'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileUIPart } from 'ai'
import { createClient } from '@/lib/supabase/client'
import {
  ATHENA_BUCKET,
  dateiArt,
  normalisierterMediaType,
  pruefeDatei,
  storageUrl,
  uploadPfad,
  type DateiArt,
} from '@/lib/assistant/dateien'
import {
  API_MAX_BILD_BYTES,
  JPEG_STUFEN,
  MAX_KANTE_PX,
  bildErfuelltApiGrenzen,
  istHeic,
  mitEndung,
  pruefeAnzahl,
  pruefeBudget,
  sollBildVerkleinern,
  summeBytes,
  zielGroesse,
} from '@/lib/assistant/anhaenge'

export interface Anhang {
  key: string
  name: string
  mediaType: string
  art: DateiArt
  /** Endgröße (nach dem Verkleinern), bis dahin die Originalgröße. */
  size: number
  status: 'laedt' | 'fertig' | 'fehler'
  pfad?: string
  fehler?: string
}

const HEIC_MELDUNG = 'HEIC wird in diesem Browser nicht gelesen – als JPEG hochladen.'

/**
 * Bild für den Upload vorbereiten (siehe `verkleinern` in ValuableMedia.tsx, hier mit
 * den Grenzen der Anthropic-API: je Bild 5 MB und 8000 px). Wirft einen Fehler mit anzeigbarem
 * Text, wenn das Bild nicht brauchbar zu bekommen ist.
 */
async function bildVorbereiten(datei: File, mediaType: string): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(datei)
  } catch {
    if (istHeic(mediaType, datei.name)) throw new Error(HEIC_MELDUNG)
    // Dekodieren scheitert, Typ aber bekannt: Original nur, wenn es die API-Grenze sicher einhält.
    if (mediaType !== 'image/gif' && datei.size > API_MAX_BILD_BYTES) {
      throw new Error(`„${datei.name}“ kann nicht gelesen und verkleinert werden.`)
    }
    if (mediaType === 'image/gif' && datei.size > API_MAX_BILD_BYTES) {
      throw new Error(`„${datei.name}“ ist als GIF zu groß (max. 5 MB).`)
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
      throw new Error(`„${datei.name}“ kann nicht gelesen werden.`)
    }
    return datei
  }

  try {
    const verkleinern = sollBildVerkleinern({
      mediaType,
      size: datei.size,
      width: bitmap.width,
      height: bitmap.height,
    })
    if (!verkleinern) {
      if (!bildErfuelltApiGrenzen({ size: datei.size, width: bitmap.width, height: bitmap.height })) {
        throw new Error(`„${datei.name}“ ist für die Bildanalyse zu groß (max. 5 MB, 8000 px).`)
      }
      return datei
    }

    // Erst auf 2000 px und gute Qualität; liegt das Ergebnis noch über 5 MB, Qualität
    // senken, danach die Kante um ein Viertel kürzen.
    let kante = MAX_KANTE_PX
    for (let runde = 0; runde < 3; runde++) {
      const { breite, hoehe } = zielGroesse(bitmap.width, bitmap.height, kante)
      const canvas = document.createElement('canvas')
      canvas.width = breite
      canvas.height = hoehe
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error(`„${datei.name}“ kann in diesem Browser nicht verkleinert werden.`)
      // JPEG kennt keine Transparenz: weißer Grund, sonst wird sie schwarz.
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, breite, hoehe)
      ctx.drawImage(bitmap, 0, 0, breite, hoehe)
      for (const qualitaet of JPEG_STUFEN) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, 'image/jpeg', qualitaet),
        )
        if (!blob) throw new Error(`„${datei.name}“ kann in diesem Browser nicht verkleinert werden.`)
        if (bildErfuelltApiGrenzen({ size: blob.size, width: breite, height: hoehe })) {
          return new File([blob], mitEndung(datei.name, 'jpg'), { type: 'image/jpeg' })
        }
      }
      kante = Math.round(kante * 0.75)
    }
    throw new Error(`„${datei.name}“ lässt sich nicht klein genug machen (max. 5 MB).`)
  } finally {
    bitmap.close()
  }
}

/**
 * Anhänge des Eingabefelds: prüfen, bei Bildern verkleinern, direkt vom Browser in den Bucket
 * laden (Server Actions nehmen nur wenige MB Body). Jeder Upload läuft für sich — ein Fehler
 * blockiert die anderen nicht.
 *
 * `chatId` ist die ID der Chat-Instanz; sie ist zugleich die Konversations-ID, unter der die
 * Route die Zeile anlegt.
 */
export function useAnhaenge(chatId: string) {
  const [anhaenge, setAnhaenge] = useState<Anhang[]>([])
  const [hinweis, setHinweis] = useState<string | null>(null)
  // Spiegel des States für Prüfungen innerhalb von async-Läufen (der State der Closure ist dort alt).
  const ref = useRef<Anhang[]>([])
  const entfernt = useRef(new Set<string>())
  const userId = useRef<Promise<string | null> | null>(null)
  const aktiv = useRef(true)

  useEffect(() => {
    aktiv.current = true
    return () => {
      aktiv.current = false
    }
  }, [])

  const setze = useCallback((naechste: Anhang[]) => {
    ref.current = naechste
    if (aktiv.current) setAnhaenge(naechste)
  }, [])

  const aendere = useCallback(
    (key: string, teil: Partial<Anhang>) => {
      // Entfernte Chips nicht wieder einblenden, wenn ein Upload spät fertig wird.
      if (!ref.current.some((a) => a.key === key)) return
      setze(ref.current.map((a) => (a.key === key ? { ...a, ...teil } : a)))
    },
    [setze],
  )

  const holeUserId = useCallback((): Promise<string | null> => {
    userId.current ??= createClient()
      .auth.getUser()
      .then(({ data }) => data.user?.id ?? null)
      .catch(() => null)
    return userId.current
  }, [])

  const verarbeite = useCallback(
    async (key: string, datei: File, mediaType: string) => {
      const fehler = (text: string) => aendere(key, { status: 'fehler', fehler: text })
      try {
        const uid = await holeUserId()
        if (!uid) return fehler('Nicht angemeldet.')

        let hochzuladen = datei
        let typ = mediaType
        if (dateiArt(mediaType, datei.name) === 'bild') {
          hochzuladen = await bildVorbereiten(datei, mediaType)
          typ = hochzuladen.type || mediaType
        }

        // Endgröße zählt: Budget gegen alles, was schon steht (ohne diese Datei und ohne Fehler).
        // Noch ladende Bilder zählen nicht mit: ihre Originalgröße sagt nichts über die Endgröße.
        const andere = ref.current.filter(
          (a) => a.key !== key && a.status !== 'fehler' && !(a.status === 'laedt' && a.art === 'bild'),
        )
        const zuViel = pruefeBudget(summeBytes(andere.map((a) => a.size)), hochzuladen.size, datei.name)
        if (zuViel) return fehler(zuViel)
        aendere(key, { size: hochzuladen.size, mediaType: typ, name: hochzuladen.name })

        if (entfernt.current.has(key)) return
        const pfad = uploadPfad(uid, { conversationId: chatId }, crypto.randomUUID(), hochzuladen.name)
        const supabase = createClient()
        const { error } = await supabase.storage
          .from(ATHENA_BUCKET)
          .upload(pfad, hochzuladen, { contentType: typ, upsert: false })
        if (error) return fehler(`Upload fehlgeschlagen: ${error.message}`)

        // Währenddessen entfernt? Dann das Objekt wieder wegräumen.
        if (entfernt.current.has(key) || !ref.current.some((a) => a.key === key)) {
          void supabase.storage.from(ATHENA_BUCKET).remove([pfad])
          return
        }
        aendere(key, { status: 'fertig', pfad })
      } catch (e) {
        fehler(e instanceof Error ? e.message : 'Upload fehlgeschlagen.')
      }
    },
    [aendere, chatId, holeUserId],
  )

  const hinzufuegen = useCallback(
    (dateien: File[]) => {
      const meldungen: string[] = []
      const neu: Anhang[] = []
      const starten: Array<{ key: string; datei: File; mediaType: string }> = []

      for (const datei of dateien) {
        const grund = pruefeDatei(datei)
        if (grund) {
          meldungen.push(grund)
          continue
        }
        const anzahl = pruefeAnzahl(ref.current.length + neu.length, datei.name)
        if (anzahl) {
          meldungen.push(anzahl)
          break
        }
        const mediaType = normalisierterMediaType(datei.type, datei.name)
        const art = dateiArt(datei.type, datei.name)
        if (!art) continue // pruefeDatei hat das schon gemeldet
        const key = crypto.randomUUID()
        neu.push({ key, name: datei.name || 'Datei', mediaType, art, size: datei.size, status: 'laedt' })
        starten.push({ key, datei, mediaType })
      }

      setHinweis(meldungen.length ? meldungen.join(' ') : null)
      if (neu.length === 0) return
      setze([...ref.current, ...neu])
      for (const s of starten) void verarbeite(s.key, s.datei, s.mediaType)
    },
    [setze, verarbeite],
  )

  const entferne = useCallback(
    (key: string) => {
      const a = ref.current.find((x) => x.key === key)
      if (!a) return
      entfernt.current.add(key)
      setze(ref.current.filter((x) => x.key !== key))
      // Best-effort: ein Fehlschlag lässt höchstens eine Datei im eigenen Ordner liegen.
      if (a.pfad) void createClient().storage.from(ATHENA_BUCKET).remove([a.pfad])
    },
    [setze],
  )

  /** Nach dem Senden: Chips weg, Dateien bleiben im Bucket (sie gehören jetzt zur Nachricht). */
  const leere = useCallback(() => {
    setze([])
    setHinweis(null)
  }, [setze])

  const laedt = anhaenge.some((a) => a.status === 'laedt')
  const fertige = anhaenge.filter((a) => a.status === 'fertig' && a.pfad)

  /** Dateiteile für `sendMessage`; die Route liest die Bytes selbst aus dem Bucket. */
  const dateiTeile = useCallback((): FileUIPart[] => {
    return ref.current.flatMap((a) =>
      a.status === 'fertig' && a.pfad
        ? [{ type: 'file' as const, mediaType: a.mediaType, filename: a.name, url: storageUrl(a.pfad) }]
        : [],
    )
  }, [])

  return {
    anhaenge,
    hinweis,
    laedt,
    anzahlFertig: fertige.length,
    hinzufuegen,
    entferne,
    leere,
    dateiTeile,
    setHinweis,
  }
}
