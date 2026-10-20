import { tool } from 'ai'
import { z } from 'zod'
import { type DB } from '@/lib/assistant/tools/shared'

export function buildAccountTools(supabase: DB, userId: string) {
  return {
    // ── Konten ─────────────────────────────────────────────────────────────
    getAccounts: tool({
      description:
        'Listet alle Konten des Nutzers (Giro, Tagesgeld, Bausparer, Geschäftsanteile, …) mit Typ, ' +
        'Währung, Institut und aktuellem Saldo. Für die Vermögensentwicklung über Zeit siehe getNetWorthTrend.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, type, currency, institution, is_active')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) return { error: error.message }

        // Salden bewusst aus `account_balances` und nicht selbst nachgerechnet:
        // das ist dieselbe Tabelle, aus der fn_take_snapshot summiert. Eine zweite
        // Rechnung hier hätte genau den Effekt, den wir gerade abgestellt haben —
        // Athena nennt andere Zahlen als das Dashboard.
        const ids = (data ?? []).map(a => a.id)
        const saldoMap = new Map<string, { balance: number; stand: string }>()
        if (ids.length > 0) {
          const { data: balances } = await supabase
            .from('account_balances')
            .select('account_id, balance, snapshot_date')
            .in('account_id', ids)
            .order('snapshot_date', { ascending: false })
          // Absteigend sortiert — der erste Treffer je Konto ist der jüngste Stand.
          for (const b of balances ?? []) {
            if (!saldoMap.has(b.account_id)) {
              saldoMap.set(b.account_id, { balance: Number(b.balance), stand: b.snapshot_date })
            }
          }
        }

        return {
          accounts: (data ?? []).map(a => ({
            ...a,
            balance:      saldoMap.get(a.id)?.balance ?? null,
            balance_date: saldoMap.get(a.id)?.stand   ?? null,
          })),
        }
      },
    }),
  }
}
