import { tool } from 'ai'
import { z } from 'zod'
import type { Json } from '@/types/database'
import { type DB } from '@/lib/assistant/tools/shared'
import { scopeKontenTabelle } from '@/lib/assistant/tools/scope'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildUserSettingsTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Einstellungen ────────────────────────────────────────────────────────
    getUserSettings: tool({
      description:
        'Erics Einstellungen, soweit sie Zahlen beeinflussen — vor allem `analyse_default_accounts`: ' +
        'der Kontenfilter, mit dem die Analyse-Seite standardmäßig rechnet. Wenn Eric eine Zahl von dort ' +
        'nennt und deine abweicht, ist das oft der Grund und keine von beiden ist falsch. Reine ' +
        'Darstellungseinstellungen (Theme, Zahlenformat, Sidebar) liefert dieses Werkzeug bewusst nicht.',
      inputSchema: z.object({}),
      execute: async () => {
        // Positivliste statt Ausschlussliste: eine neue reine UI-Einstellung
        // landet damit nicht automatisch im Prompt.
        const RELEVANT = [
          'analyse_default_accounts', 'analyse_default_period', 'analyse_default_heatmap_mode', 'flow_default_include',
          'monthly_budget', 'default_tax_rate', 'crypto_source', 'kraken_last_sync',
          'last_rebalancing', 'portfolio_allocations', 'default_asset_class', 'default_timeframe',
          'risk_per_trade_pct', 'max_open_trades',
        ]
        const [settingsRes, kontenRes] = await Promise.all([
          // user_settings ist owner-only; die Kontennamen (Auflösung der Filter-IDs) kommen aus dem Haushalt.
          supabase.from('user_settings').select('key, value, updated_at').eq('user_id', ctx.userId).in('key', RELEVANT),
          scopeKontenTabelle(supabase.from('accounts').select('id, name'), ctx),
        ])
        if (settingsRes.error) return { error: settingsRes.error.message }

        const kontoName = new Map((kontenRes.data ?? []).map(k => [k.id, k.name]))
        const settings: Record<string, Json> = {}
        for (const row of settingsRes.data ?? []) {
          if (row.value !== null) settings[row.key] = row.value
        }

        // Konten-IDs sind für dich wertlos, Namen für das Filtern von
        // getTransactions — deshalb beides.
        const filterIds = Array.isArray(settings.analyse_default_accounts)
          ? settings.analyse_default_accounts.filter((v): v is string => typeof v === 'string')
          : []

        return {
          settings,
          analyse_kontenfilter: filterIds.length > 0
            ? filterIds.map(id => ({ id, name: kontoName.get(id) ?? '(gelöschtes Konto)' }))
            : null,
          hinweis_zur_deutung: filterIds.length > 0
            ? 'Die Analyse-Seite rechnet standardmäßig NUR mit diesen Konten. Deine Werkzeuge rechnen ' +
              'über alle — eine Abweichung zwischen deiner Zahl und der Seite ist damit erklärt, nicht falsch.'
            : 'Kein Kontenfilter gesetzt: die Analyse-Seite rechnet über alle Konten, genau wie du.',
        }
      },
    }),

  }
}
