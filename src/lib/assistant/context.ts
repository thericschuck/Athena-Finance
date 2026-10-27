import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ScopeContext } from '@/lib/haushalt/scope'
import { scopeHaushaltsweit, scopeKontenTabelle } from '@/lib/assistant/tools/scope'

type DB = SupabaseClient<Database>

export type MemoryEntry = {
  key: string
  content: string
  category: string
  source: string
}

export type KnowledgeIndexEntry = {
  id: string
  title: string
  tags: string[]
}

/**
 * Wie viele Speicher-Einträge höchstens in den System-Prompt wandern.
 *
 * Der Kontext-Speicher wird VOLLSTÄNDIG mitgeschickt, nicht gesucht — ein Fakt
 * wie „bevorzugt ETF über Einzelaktien" ist nur dann nützlich, wenn Athena ihn
 * kennt, ohne vorher danach zu suchen (sie weiß ja nicht, dass es ihn gibt).
 * Das geht nur, solange die Menge klein bleibt; darum die Obergrenze und das
 * separate `searchMemory`-Werkzeug für alles darüber hinaus.
 */
const MEMORY_CONTEXT_LIMIT = 60

/** Analog für die Wissensbasis — hier reicht ein INDEX (Titel + Tags), weil die
    Inhalte lang sind und gezielt per searchKnowledge geholt werden. */
const KNOWLEDGE_INDEX_LIMIT = 40

export async function loadMemories(supabase: DB, userId: string): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('key, content, category, source')
    // Von Hand angelegte Einträge zuerst: sie sind ausdrückliche Vorgaben der
    // Nutzerin/des Nutzers und sollen beim Abschneiden nie als erstes wegfallen.
    .eq('user_id', userId)
    .order('source', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(MEMORY_CONTEXT_LIMIT)
  if (error) return []
  return data ?? []
}

export async function loadKnowledgeIndex(supabase: DB, userId: string): Promise<KnowledgeIndexEntry[]> {
  const { data, error } = await supabase
    .from('ai_knowledge')
    .select('id, title, tags')
    .eq('user_id', userId)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(KNOWLEDGE_INDEX_LIMIT)
  if (error) return []
  return data ?? []
}

/**
 * Kontostruktur des Nutzers — Name, Typ, ID. Kommt in den System-Prompt, weil
 * fast jede Frage ("wie viel liegt auf dem Tagesgeld") sonst mit einem
 * getAccounts-Aufruf beginnt, dessen Ergebnis sich zwischen zwei Nachrichten
 * praktisch nie ändert. Ein Schritt gespart, bei sehr geringen Kosten.
 */
export async function loadAccountContext(supabase: DB, ctx: ScopeContext) {
  const [accounts, categories] = await Promise.all([
    // Konten des aktiven Scopes; Kategorien: ein Baum pro Haushalt.
    scopeKontenTabelle(supabase.from('accounts').select('id, name, type, currency'), ctx)
      .eq('is_active', true)
      .order('sort_order'),
    scopeHaushaltsweit(supabase.from('categories').select('id, name, type, parent_id'), ctx)
      .order('sort_order'),
  ])
  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
  }
}

export type AthenaContext = {
  /** Aktiver Haushalts-Scope (vom Server aufgelöst, nie vom Modell). */
  scope: ScopeContext
  memories: MemoryEntry[]
  knowledge: KnowledgeIndexEntry[]
  accounts: Awaited<ReturnType<typeof loadAccountContext>>['accounts']
  categories: Awaited<ReturnType<typeof loadAccountContext>>['categories']
}

export async function loadAthenaContext(
  supabase: DB,
  scope: ScopeContext,
  options: { memoryEnabled: boolean },
): Promise<AthenaContext> {
  const [memories, knowledge, structure] = await Promise.all([
    // Gedächtnis und Wissensbasis sind persönlich (ai_*): immer der angemeldete Nutzer.
    options.memoryEnabled ? loadMemories(supabase, scope.userId) : Promise.resolve([]),
    loadKnowledgeIndex(supabase, scope.userId),
    loadAccountContext(supabase, scope),
  ])
  return { scope, memories, knowledge, ...structure }
}
