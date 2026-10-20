import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { erzeugeArtwork, ArtworkFehler, MAX_VORLAGEN, HINWEIS_MAX } from '@/lib/inventar/artwork'
import { z } from 'zod'
import { parseBody } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

/**
 * POST /api/inventar/artwork
 * Body: { id, basisBildIds?: string[], hinweis?: string, qualitaet?: 'auto' | 'high' }
 *
 * Erzeugt eine Illustration für einen Gegenstand und legt sie im Bucket `valuables` ab.
 * Die eigentliche Arbeit steht in `lib/inventar/artwork` — dieselbe Funktion benutzt Athena
 * über eine bestätigungspflichtige Aktion, damit beide Wege denselben Stil erzeugen.
 *
 * Drei Wege, je nach Vorlage:
 *
 *   Fotos       — DEIN Stück im Sammlungsstil, weil Zifferblatt, Armband und Patina aus dem
 *                 Bild kommen und nicht aus dem Modellgedächtnis. Mehrere Fotos zusammen
 *                 (Vorderseite, Rückseite, Detail) ergeben ein Objekt, das rundum stimmt.
 *   ein Artwork — Verfeinerungsrunde. Zusammen mit `hinweis` („dunklerer Hintergrund")
 *                 bleibt das Bild, wie es war, und ändert sich nur an der genannten Stelle.
 *   ohne        — reine Textbeschreibung. Für Stücke, von denen es noch kein Foto gibt.
 *
 * Warum die Route trotz Server Actions bestehen bleibt: eine Server Action nimmt
 * standardmäßig 1 MB Body entgegen und läuft unter deren Zeitbudget — ein Bildlauf dauert
 * 15–60 s. Als Route liegt das Zeitlimit explizit hier.
 */

// Ein Bildlauf mit Vorlage dauert regelmäßig länger als die Vercel-Voreinstellung.
export const maxDuration = 120

/** Alte Aufrufer schickten `basisBildId` (Einzahl). Beide Formen werden angenommen. */
const bodySchema = z.object({
  id: uuid,
  basisBildId: uuid.optional(),
  // Mehr als MAX_VORLAGEN werden wie bisher abgeschnitten (kein Fehler), aber nicht unbegrenzt.
  basisBildIds: z.array(uuid).max(50).optional(),
  // Zu lange Hinweise kürzt `erzeugeArtwork` selbst; hier nur eine Obergrenze gegen Missbrauch.
  hinweis: z.string().max(Math.max(HINWEIS_MAX * 10, 4000)).optional(),
  qualitaet: z.enum(['auto', 'high']).optional(),
})

export async function POST(request: Request) {
  const { supabase, user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = await parseBody(request, bodySchema)
  if (parsed.response) return parsed.response
  const body = parsed.data

  const basisBildIds = (body.basisBildIds ?? (body.basisBildId ? [body.basisBildId] : [])).slice(
    0,
    MAX_VORLAGEN,
  )

  try {
    const ergebnis = await erzeugeArtwork(supabase, user.id, {
      valuableId: body.id,
      basisBildIds,
      hinweis: body.hinweis,
      qualitaet: body.qualitaet,
    })
    return NextResponse.json({ ok: true, ...ergebnis })
  } catch (err) {
    if (err instanceof ArtworkFehler) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
