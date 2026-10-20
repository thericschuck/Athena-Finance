import { tool } from 'ai'
import { z } from 'zod'
import { untrust, type DB, type AthenaToolOptions } from '@/lib/assistant/tools/shared'

export function buildMemoryTools(supabase: DB, userId: string, options: AthenaToolOptions) {
  return {
    // ── Kontext-Speicher ──────────────────────────────────────────────────────
    ...(options.memoryEnabled
      ? {
          remember: tool({
            description:
              'Legt einen dauerhaften Fakt über den Nutzer ab oder aktualisiert einen bestehenden. ' +
              'Nur für Dinge, die über dieses Gespräch hinaus gelten (Ziele, Vorlieben, ' +
              'Randbedingungen) — NICHT für Kontostände oder andere Zahlen, die veralten. ' +
              'Gibt es den `key` schon, wird der bestehende Eintrag überschrieben statt ein ' +
              'zweiter angelegt.',
            inputSchema: z.object({
              key: z
                .string()
                .min(2)
                .max(60)
                .regex(/^[a-z0-9-]+$/, 'nur Kleinbuchstaben, Ziffern und Bindestriche')
                .describe('Kurzer stabiler Slug, z. B. "sparziel-umzug" oder "praeferenz-etf"'),
              content: z.string().min(3).max(600).describe('Der Fakt in einem Satz'),
              category: z
                .enum(['general', 'preference', 'goal', 'fact', 'constraint'])
                .default('general'),
            }),
            execute: async ({ key, content, category }) => {
              if (!options.autoMemory) {
                return {
                  error:
                    'Automatisches Merken ist in den Einstellungen deaktiviert. Schlage dem Nutzer ' +
                    'stattdessen vor, den Eintrag unter Athena → Speicher selbst anzulegen.',
                }
              }
              const { data, error } = await supabase
                .from('ai_memories')
                .upsert(
                  {
                    user_id: userId,
                    key,
                    content,
                    category,
                    source: 'agent',
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'user_id,key' },
                )
                .select('id, key')
                .single()
              if (error) return { error: error.message }
              await options.logger({
                event: 'memory.write',
                message: key,
                meta: { key, category, content },
              })
              return { saved: true, key: data.key }
            },
          }),

          searchMemory: tool({
            description:
              'Durchsucht den Kontext-Speicher nach älteren Einträgen. Die zuletzt benutzten ' +
              'Einträge stehen bereits in deinem System-Prompt — dieses Werkzeug brauchst du nur, ' +
              'wenn du dort nichts Passendes findest und vermutest, dass es einen älteren Eintrag gibt.',
            inputSchema: z.object({ query: z.string().min(2) }),
            execute: async ({ query }) => {
              const { data, error } = await supabase.rpc('search_ai_memories', {
                q: query,
                max_results: 10,
              })
              if (error) return { error: error.message }
              return { memories: data ?? [] }
            },
          }),

          forget: tool({
            description:
              'Löscht einen Eintrag aus dem Kontext-Speicher — nutze das, wenn ein gespeicherter ' +
              'Fakt nachweislich überholt ist und nicht bloß aktualisiert werden soll.',
            inputSchema: z.object({ key: z.string().min(2).max(60) }),
            execute: async ({ key }) => {
              const { data, error } = await supabase
                .from('ai_memories')
                .delete()
                .eq('user_id', userId)
                .eq('key', key)
                .select('key')
              if (error) return { error: error.message }
              if (!data || data.length === 0) return { error: `Kein Eintrag mit key "${key}"` }
              await options.logger({ event: 'memory.delete', message: key, meta: { key } })
              return { deleted: true, key }
            },
          }),
        }
      : {}),

    // ── Wissensbasis ──────────────────────────────────────────────────────────
    searchKnowledge: tool({
      description:
        'Durchsucht die Wissensbasis (eigene Notizen, Anlageregeln, gespeicherte Recherchen) und ' +
        'liefert den Volltext der Treffer. Der Index mit allen Titeln steht in deinem System-Prompt — ' +
        'wenn ein Titel zur Frage passt, lies ihn hiermit, BEVOR du antwortest.',
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(10).default(4),
      }),
      execute: async ({ query, limit }) => {
        const { data, error } = await supabase.rpc('search_ai_knowledge', {
          q: query,
          max_results: limit,
        })
        if (error) return { error: error.message }
        // Der Inhalt stammt aus einer vom Nutzer gepflegten oder aus dem Web
        // übernommenen Quelle — gleiche Behandlung wie Bank-Freitext.
        return {
          documents: (data ?? []).map((doc) =>
            untrust(doc as unknown as Record<string, unknown>, ['content', 'title']),
          ),
        }
      },
    }),

    saveKnowledge: tool({
      description:
        'Legt einen Eintrag in der Wissensbasis an — für recherchierte Zusammenfassungen oder ' +
        'Regeln, die dauerhaft nützlich bleiben. Bei Web-Recherche immer `sourceUrl` mitgeben. ' +
        'Nicht für Kurzlebiges und nicht als Ersatz für den Kontext-Speicher (dort steht, was über ' +
        'den Nutzer gilt; hier steht Wissen über die Welt).',
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        content: z.string().min(20).max(20000),
        tags: z.array(z.string().max(40)).max(10).default([]),
        sourceUrl: z.string().url().nullish(),
      }),
      execute: async ({ title, content, tags, sourceUrl }) => {
        const { data, error } = await supabase
          .from('ai_knowledge')
          .insert({
            user_id: userId,
            title,
            content,
            tags,
            source_url: sourceUrl ?? null,
            source: 'agent',
          })
          .select('id')
          .single()
        if (error) return { error: error.message }
        await options.logger({
          event: 'knowledge.write',
          message: title,
          meta: { id: data.id, tags, sourceUrl: sourceUrl ?? null },
        })
        return { saved: true, id: data.id }
      },
    }),

  }
}
