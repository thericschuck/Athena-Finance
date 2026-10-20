import { tool } from 'ai'
import { z } from 'zod'
import { fetchBalanceHistory } from '@/lib/account-history'
import { type DB } from '@/lib/assistant/tools/shared'

export function buildAccountHistoryTools(supabase: DB, userId: string) {
  return {
    // ── Saldo-Historie je Konto ──────────────────────────────────────────────
    getAccountBalanceHistory: tool({
      description:
        'Saldo-Verlauf einzelner Konten (ein Wert pro Monat), optional auf ein Konto eingegrenzt. ' +
        'getAccounts liefert nur den aktuellen Stand, getNetWorthTrend nur die Summe über alles — ' +
        'dieses Werkzeug ist für „wie hat sich DIESES Konto entwickelt".',
      inputSchema: z.object({
        accountId: z.string().uuid().optional()
          .describe('Konto-ID aus getAccounts; ohne Angabe alle Konten'),
        months: z.number().int().min(1).max(36).default(12),
      }),
      execute: async ({ accountId, months }) => {
        const seit = new Date()
        seit.setMonth(seit.getMonth() - months)

        // Über fetchBalanceHistory und nicht direkt: die Tabelle läuft schnell
        // über den 1.000-Zeilen-Deckel von PostgREST, und weil aufsteigend
        // sortiert wird, fehlt dann das JÜNGSTE Ende — ohne Fehlermeldung.
        const [rows, { data: konten }] = await Promise.all([
          fetchBalanceHistory(supabase, { accountId, from: seit.toISOString().slice(0, 10) }),
          supabase.from('accounts').select('id, name').eq('user_id', userId),
        ])
        const kontoName = new Map((konten ?? []).map(k => [k.id, k.name]))

        // Ein Wert pro Konto und Monat: der letzte des Monats gewinnt, weil
        // aufsteigend durchlaufen wird.
        const jeKontoMonat = new Map<string, { konto: string; monat: string; saldo: number; stand: string }>()
        for (const r of rows) {
          const monat = r.snapshot_date.slice(0, 7)
          jeKontoMonat.set(`${r.account_id}|${monat}`, {
            konto: kontoName.get(r.account_id) ?? '(unbekanntes Konto)',
            monat,
            saldo: r.balance,
            stand: r.snapshot_date,
          })
        }

        const verlauf = Array.from(jeKontoMonat.values()).sort(
          (a, b) => a.konto.localeCompare(b.konto) || a.monat.localeCompare(b.monat),
        )
        return { monate: months, verlauf }
      },
    }),

  }
}
