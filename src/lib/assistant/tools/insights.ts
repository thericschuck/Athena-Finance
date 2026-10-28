import { tool } from 'ai'
import { z } from 'zod'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildInsightTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Hinweise (Dashboard-Karten) ──────────────────────────────────────────
    getInsights: tool({
      description:
        'Liest die Hinweis-Karten des Dashboards (Tabelle `insights`) mit Typ, Schweregrad, Titel, Text ' +
        'und ob sie schon weggeklickt wurden. Ruf das auf, BEVOR du mit createInsight einen neuen Hinweis ' +
        'vorschlägst — sonst schlägst du etwas vor, das dort längst steht.',
      inputSchema: z.object({
        includeDismissed: z.boolean().default(false)
          .describe('true = auch bereits weggeklickte Hinweise, um Wiederholungen zu erkennen'),
        limit: z.number().int().min(1).max(ROW_CAP).default(50),
      }),
      execute: async ({ includeDismissed, limit }) => {
        let query = supabase
          .from('insights')
          .select('id, type, severity, title, body, created_at, dismissed_at')
          // Owner-only: Hinweise gehören dem Nutzer, nicht dem Haushalt.
          .eq('user_id', ctx.userId)
          .order('created_at', { ascending: false })
          .limit(Math.min(limit, ROW_CAP))
        if (!includeDismissed) query = query.is('dismissed_at', null)
        const { data, error } = await query
        if (error) return { error: error.message }
        return {
          insights: (data ?? []).map(row => untrust(row, ['title', 'body'])),
          hinweis_zur_deutung:
            'dismissed_at gesetzt heißt: Der Nutzer hat den Hinweis weggeklickt. Schlag denselben Inhalt ' +
            'nicht erneut vor, ohne zu sagen, dass er ihn schon einmal verworfen hat.',
        }
      },
    }),

  }
}
