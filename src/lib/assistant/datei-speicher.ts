import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ATHENA_BUCKET, pfadGehoertNutzer } from '@/lib/assistant/dateien'

/**
 * Bucket-Zugriffe rund um Athena-Dateien (Server). Die Tabelle `ai_files` verschwindet per Cascade
 * mit Chat oder Projekt, der Bucket kennt keine Fremdschlüssel — deshalb räumt der App-Code die
 * Objekte VOR dem Löschen der Zeilen ab (die Pfade stehen dann noch in `ai_files`).
 */

type DB = SupabaseClient<Database>

/** Supabase nimmt je Aufruf eine Liste; in Blöcken, damit riesige Projekte nicht an einer Grenze hängen. */
const BLOCK = 100

export async function entferneObjekte(supabase: DB, userId: string, pfade: string[]): Promise<void> {
  const eigene = pfade.filter((p) => pfadGehoertNutzer(p, userId))
  for (let i = 0; i < eigene.length; i += BLOCK) {
    await supabase.storage.from(ATHENA_BUCKET).remove(eigene.slice(i, i + BLOCK))
  }
}

export async function entferneChatDateien(
  supabase: DB,
  userId: string,
  conversationId: string,
): Promise<void> {
  const { data } = await supabase
    .from('ai_files')
    .select('pfad')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
  await entferneObjekte(supabase, userId, (data ?? []).map((d) => d.pfad))
}

export async function entferneProjektDateien(
  supabase: DB,
  userId: string,
  projectId: string,
): Promise<void> {
  const { data } = await supabase
    .from('ai_files')
    .select('pfad')
    .eq('user_id', userId)
    .eq('project_id', projectId)
  await entferneObjekte(supabase, userId, (data ?? []).map((d) => d.pfad))
}

/** Signierte Lese-URLs (für Vorschau und Öffnen). Fehlgeschlagene Pfade fehlen im Ergebnis. */
export async function signiereUrls(
  supabase: DB,
  userId: string,
  pfade: string[],
  ttlSekunden = 60 * 60,
): Promise<Record<string, string>> {
  const eigene = Array.from(new Set(pfade.filter((p) => pfadGehoertNutzer(p, userId))))
  if (eigene.length === 0) return {}
  const { data } = await supabase.storage.from(ATHENA_BUCKET).createSignedUrls(eigene, ttlSekunden)
  const aus: Record<string, string> = {}
  for (const eintrag of data ?? []) {
    if (eintrag.path && eintrag.signedUrl) aus[eintrag.path] = eintrag.signedUrl
  }
  return aus
}
