import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'
import type { Database } from '@/types/database'
import {
  ATHENA_BUCKET,
  MODELL_BILD_TYPEN,
  MODELL_BYTE_BUDGET,
  dateiArt,
  einzeiligerName,
  erkenneTyp,
  normalisierterMediaType,
  pfadAusStorageUrl,
  pfadGehoertNutzer,
  stubNotiz,
  textBlock,
} from '@/lib/assistant/dateien'

/**
 * Macht aus den Storage-Verweisen in den Nachrichten das, was das Modell lesen kann.
 *
 * In der Datenbank steht an einer Nachricht nur `storage:<pfad>` (die Datei selbst liegt im
 * privaten Bucket, Base64 in `ai_messages` würde die Zeilen sprengen). Vor `convertToModelMessages`
 * wird hier aufgelöst:
 *  - PDF und Bild -> Datei-Teil mit Daten (Data-URL),
 *  - Text/CSV -> Textteil im Zaun (siehe `textBlock`; Inhalt ist Daten, keine Anweisung).
 *
 * Nur die NEUESTE Nutzernachricht bekommt ihre Dateien voll. In früheren Nachrichten steht statt der
 * Datei eine Notiz (`stubNotiz`), und Athena liest sie bei Bedarf mit `readAttachment` gezielt nach.
 * Der Grund ist Geld: ein Anhang würde sonst bei jedem Zug erneut mitgeschickt und (nach etwa fünf
 * Minuten, wenn der Cache kalt ist) jedes Mal voll bezahlt — ein PDF kostet pro Seite grob 1.500 bis
 * 3.000 Token. Nebenbei bleibt der Verlauf dadurch stabil und gut cachebar, und frühere Dateien
 * müssen nicht erneut aus dem Bucket geladen werden.
 *
 * Weil eine Anfrage höchstens 32 MB trägt, gilt für die neue Nachricht ein Byte-Budget
 * (`MODELL_BYTE_BUDGET`); was nicht mehr passt, wird durch eine Notiz ersetzt.
 *
 * Gibt zusätzlich die Größen der gelesenen Dateien zurück (für `ai_files`).
 */

type DB = SupabaseClient<Database>
type Teil = UIMessage['parts'][number]

export interface AufgeloesteNachrichten {
  messages: UIMessage[]
  /** Pfad -> Bytes, für alle Dateien, die tatsächlich gelesen werden konnten. */
  groessen: Map<string, number>
}

function notiz(text: string): Teil {
  return { type: 'text', text }
}

function alsBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

export async function loeseDateienAuf(
  supabase: DB,
  userId: string,
  messages: UIMessage[],
): Promise<AufgeloesteNachrichten> {
  const groessen = new Map<string, number>()
  let budget = MODELL_BYTE_BUDGET

  // Kopie mit eigenen `parts`-Arrays: die Originale gehen später als `originalMessages` in die
  // Persistenz und müssen die schlanken Storage-Verweise behalten.
  const aus: UIMessage[] = messages.map((m) => ({ ...m, parts: [...m.parts] }))

  const letzteNutzer = aus.map((m) => m.role).lastIndexOf('user')

  for (let mi = aus.length - 1; mi >= 0; mi--) {
    const nachricht = aus[mi]
    if (nachricht.role !== 'user') continue

    // Frühere Nachrichten: nur die Notiz, kein Download.
    if (mi !== letzteNutzer) {
      for (let pi = 0; pi < nachricht.parts.length; pi++) {
        const teil = nachricht.parts[pi]
        if (teil.type !== 'file' || pfadAusStorageUrl(teil.url) === null) continue
        const frueherName = teil.filename ?? teil.url.split('/').pop() ?? 'Datei'
        nachricht.parts[pi] = notiz(stubNotiz(frueherName, normalisierterMediaType(teil.mediaType, frueherName)))
      }
      continue
    }

    // Innerhalb einer Nachricht ebenfalls von hinten, damit das Budget der Reihenfolge der
    // Nachrichten folgt und nicht der Teile.
    for (let pi = nachricht.parts.length - 1; pi >= 0; pi--) {
      const teil = nachricht.parts[pi]
      if (teil.type !== 'file') continue
      const pfad = pfadAusStorageUrl(teil.url)
      if (pfad === null) continue
      const name = einzeiligerName(teil.filename ?? pfad.split('/').pop() ?? 'Datei')

      if (!pfadGehoertNutzer(pfad, userId)) {
        nachricht.parts[pi] = notiz(`[Datei „${name}“ nicht verfügbar]`)
        continue
      }

      const { data: blob, error } = await supabase.storage.from(ATHENA_BUCKET).download(pfad)
      if (error || !blob) {
        nachricht.parts[pi] = notiz(`[Datei „${name}“ konnte nicht geladen werden]`)
        continue
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      groessen.set(pfad, bytes.length)

      // Der Typ kommt aus den Bytes, nicht aus Name oder Browser: ein als .jpg benanntes PNG
      // würde sonst mit falschem Typ an die API gehen und mit 400 abgelehnt.
      const echt = erkenneTyp(bytes)
      const typ = echt ?? normalisierterMediaType(teil.mediaType, name)
      const art = dateiArt(typ, name)
      if (art === 'pdf' && echt !== 'application/pdf') {
        nachricht.parts[pi] = notiz(`[Datei „${name}“ ist kein gültiges PDF]`)
        continue
      }

      if (art === 'text') {
        nachricht.parts[pi] = notiz(textBlock(name, new TextDecoder('utf-8').decode(bytes)))
        continue
      }
      if (art === 'bild' && !(MODELL_BILD_TYPEN as readonly string[]).includes(typ)) {
        nachricht.parts[pi] = notiz(
          `[Bild „${name}“ liegt im Format ${typ} vor, das nicht gelesen werden kann — als JPEG oder PNG hochladen]`,
        )
        continue
      }
      if (art === null) {
        nachricht.parts[pi] = notiz(`[Datei „${name}“: Dateityp nicht lesbar]`)
        continue
      }
      if (bytes.length > budget) {
        nachricht.parts[pi] = notiz(
          `[Datei „${name}“ wird nicht mitgesendet: das Größenbudget dieser Anfrage ist erschöpft]`,
        )
        continue
      }
      budget -= bytes.length
      nachricht.parts[pi] = {
        type: 'file',
        mediaType: typ,
        filename: name,
        url: `data:${typ};base64,${alsBase64(bytes)}`,
      }
    }
  }

  return { messages: aus, groessen }
}

/** Die Storage-Pfade der Datei-Teile einer Nachricht (nur die eigenen, in Reihenfolge). */
export function dateiTeile(
  nachricht: UIMessage | undefined,
  userId: string,
): { pfad: string; name: string; mediaType: string }[] {
  if (!nachricht) return []
  const aus: { pfad: string; name: string; mediaType: string }[] = []
  for (const teil of nachricht.parts) {
    if (teil.type !== 'file') continue
    const pfad = pfadAusStorageUrl(teil.url)
    if (pfad === null || !pfadGehoertNutzer(pfad, userId)) continue
    const name = einzeiligerName(teil.filename ?? pfad.split('/').pop() ?? 'Datei')
    aus.push({ pfad, name, mediaType: normalisierterMediaType(teil.mediaType, name) })
  }
  return aus
}

/**
 * Was der Client schickt, wird auf das Erwartete zurechtgestutzt, BEVOR die Route damit arbeitet:
 *  - Datei-Teile ohne `storage:`-Verweis fliegen raus (fremde URLs würden sonst vom SDK geladen,
 *    `data:`-URLs mit der Nachricht in der Datenbank landen und das Größenbudget umgehen),
 *  - `providerMetadata` behält nur `athena.mentions` (sonst könnte der Client z. B.
 *    `anthropic.cacheControl` setzen und die erlaubten Cache-Haltepunkte überschreiten).
 */
export function bereinigeNachrichten(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.flatMap((teil): Teil[] => {
      if (teil.type === 'file') {
        return pfadAusStorageUrl(teil.url) === null
          ? []
          : [{ type: 'file', mediaType: teil.mediaType, filename: teil.filename, url: teil.url }]
      }
      if (teil.type === 'text') {
        const labels = mentionsAusMeta(teil.providerMetadata)
        return [
          labels.length > 0
            ? { type: 'text', text: teil.text, providerMetadata: { athena: { mentions: labels } } }
            : { type: 'text', text: teil.text },
        ]
      }
      return [teil]
    }),
  }))
}

/** Die am Textteil hängenden Bezüge (Typ, ID, Label) einer Nachricht — leer, wenn keine. */
export function mentionsAusNachricht(nachricht: UIMessage | undefined): unknown[] {
  if (!nachricht) return []
  return nachricht.parts.flatMap((p) => (p.type === 'text' ? mentionsAusMeta(p.providerMetadata) : []))
}

function mentionsAusMeta(meta: unknown): { typ: string; id: string; label: string }[] {
  if (!meta || typeof meta !== 'object') return []
  const athena = (meta as Record<string, unknown>).athena
  const liste = athena && typeof athena === 'object' ? (athena as Record<string, unknown>).mentions : undefined
  if (!Array.isArray(liste)) return []
  return liste.flatMap((e) => {
    if (!e || typeof e !== 'object') return []
    const { typ, id, label } = e as Record<string, unknown>
    return typeof typ === 'string' && typeof id === 'string' && typeof label === 'string'
      ? [{ typ, id, label: label.slice(0, 80) }]
      : []
  })
}
