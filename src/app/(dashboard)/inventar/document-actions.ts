'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { parseInput, issueMessage } from '@/lib/api/validate'
import { uuid } from '@/lib/api/schemas'

// Die Tabelle `valuable_documents` steht noch nicht in den generierten Typen
// (src/types/database.ts wird nicht von Hand geaendert). Deshalb lokale Zeilentypen und
// `as never` bei Schreibzugriffen -- dasselbe Muster wie in inventar/actions.ts.

// In einer 'use server'-Datei duerfen nur async-Funktionen exportiert werden (Typen sind ok),
// darum bleibt die Werteliste hier privat; die Komponente fuehrt ihre eigene Anzeigeliste.
const DOKUMENT_ARTEN = ['beleg', 'zertifikat', 'rechnung', 'police', 'sonstiges'] as const
export type DokumentArt = (typeof DOKUMENT_ARTEN)[number]

export interface ValuableDocument {
  id: string
  name: string
  art: DokumentArt
  groesse: number | null
  created_at: string
  /** Signierte Download-URL; null, wenn die Signatur fehlgeschlagen ist. */
  url: string | null
}

interface DokumentZeile {
  id: string
  pfad: string
  name: string
  art: DokumentArt
  groesse: number | null
  created_at: string
}

const BUCKET = 'valuable-documents'
const URL_TTL_SEKUNDEN = 60 * 60

/**
 * Verbucht ein bereits hochgeladenes Dokument. Die Datei geht direkt aus dem Browser in den
 * Bucket (Server Actions nehmen nur 1 MB Body); hier kommt nur der Pfad an.
 */
export async function registerDocument(
  valuableId: string,
  pfad: string,
  name: string,
  art: DokumentArt,
  groesse: number,
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({
      valuableId: uuid,
      pfad: z.string().min(1).max(500),
      name: z.string().trim().min(1).max(200),
      art: z.enum(DOKUMENT_ARTEN),
      groesse: z.number().int().min(0).max(100 * 1024 * 1024),
    }),
    { valuableId, pfad, name, art, groesse },
  )
  if (!args.ok) return { error: issueMessage(args) }
  if (!pfad.startsWith(`${user.id}/`) || pfad.includes('..')) return { error: 'Ungültiger Pfad' }

  const { error } = await supabase.from('valuable_documents' as never).insert({
    user_id: user.id,
    valuable_id: valuableId,
    pfad,
    name: name.trim(),
    art,
    groesse,
  } as never)
  if (error) return { error: error.message }

  revalidatePath('/inventar')
  return {}
}

/** Entfernt ein Dokument samt Datei. */
export async function deleteDocument(dokumentId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, dokumentId)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data: row } = await supabase
    .from('valuable_documents' as never)
    .select('pfad')
    .eq('id', dokumentId)
    .eq('user_id', user.id)
    .maybeSingle()
  const dok = row as { pfad: string } | null
  if (!dok) return { error: 'Dokument nicht gefunden' }

  const { error } = await supabase
    .from('valuable_documents' as never)
    .delete()
    .eq('id', dokumentId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  await supabase.storage.from(BUCKET).remove([dok.pfad])
  revalidatePath('/inventar')
  return {}
}

/** Dokumente eines Gegenstands, neueste zuerst, mit signierten URLs. */
export async function listDocuments(
  valuableId: string,
): Promise<{ error?: string; documents: ValuableDocument[] }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt', documents: [] }
  const idP = parseInput(uuid, valuableId)
  if (!idP.ok) return { error: issueMessage(idP), documents: [] }

  const { data, error } = await supabase
    .from('valuable_documents' as never)
    .select('id, pfad, name, art, groesse, created_at')
    .eq('valuable_id', valuableId) // Haushaltssicht: RLS (Signed URLs fremder Dateien scheitern an den Storage-Policies)
    .order('created_at', { ascending: false })
  if (error) return { error: error.message, documents: [] }

  const zeilen = (data ?? []) as unknown as DokumentZeile[]
  const urls = new Map<string, string>()
  if (zeilen.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(zeilen.map(z => z.pfad), URL_TTL_SEKUNDEN)
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
    }
  }

  return {
    documents: zeilen.map(z => ({
      id: z.id,
      name: z.name,
      art: z.art,
      groesse: z.groesse,
      created_at: z.created_at,
      url: urls.get(z.pfad) ?? null,
    })),
  }
}
