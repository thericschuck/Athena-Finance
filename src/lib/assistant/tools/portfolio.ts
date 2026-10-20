import { tool } from 'ai'
import { z } from 'zod'
import { untrust, type DB } from '@/lib/assistant/tools/shared'

export function buildPortfolioTools(supabase: DB, userId: string) {
  return {
    // ── Depot ─────────────────────────────────────────────────────────────────
    getDepotHoldings: tool({
      description: 'Aktueller Depot-Bestand (per FinTS synchronisiert): Wertpapiere, Stückzahl, Kurswert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('depot_holdings')
          .select('isin, name, pieces, market_value, total_value, acquisition_price, currency, valuation_date')
          .eq('user_id', userId)
          .order('total_value', { ascending: false })
        if (error) return { error: error.message }
        return { holdings: (data ?? []).map((row) => untrust(row, ['name'])) }
      },
    }),

    // ── Crypto ────────────────────────────────────────────────────────────────
    getCryptoPortfolio: tool({
      description: 'Aktuelles Crypto-/Asset-Portfolio mit Menge, Einstandspreis und letztem bekannten Marktwert.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data: assets, error: assetsError } = await supabase
          .from('assets')
          .select('id, name, symbol, type, quantity, avg_buy_price, currency, portfolio_name')
          .eq('user_id', userId)
        if (assetsError) return { error: assetsError.message }
        if (!assets || assets.length === 0) return { assets: [] }

        const assetIds = assets.map((a) => a.id)
        const { data: valuations, error: valuationsError } = await supabase
          .from('asset_valuations')
          .select('asset_id, price_per_unit, total_value, valuation_date')
          .in('asset_id', assetIds)
          .order('valuation_date', { ascending: false })
        if (valuationsError) return { error: valuationsError.message }

        // Nur die jeweils neueste Bewertung pro Asset — valuations ist schon
        // nach valuation_date absteigend sortiert, der erste Treffer pro
        // asset_id gewinnt.
        const latestByAsset = new Map<string, { price_per_unit: number; total_value: number; valuation_date: string }>()
        for (const v of valuations ?? []) {
          if (!latestByAsset.has(v.asset_id)) latestByAsset.set(v.asset_id, v)
        }

        return {
          assets: assets.map((a) => ({
            ...a,
            latestValuation: latestByAsset.get(a.id) ?? null,
          })),
        }
      },
    }),

    // ── Vermögensverlauf (Aggregat, monatsweise verdichtet) ──────────────────
    getNetWorthTrend: tool({
      description:
        'Vermögensverlauf der letzten N Monate (Netto-Vermögen und Aufschlüsselung nach Konto/Depot/Crypto/Schulden), ' +
        'ein Wert pro Monat statt täglicher Rohdaten — geeignet für Trendfragen.',
      inputSchema: z.object({
        months: z.number().int().min(1).max(36).default(6),
      }),
      execute: async ({ months }) => {
        const since = new Date()
        since.setMonth(since.getMonth() - months)
        const sinceIso = since.toISOString().slice(0, 10)

        const { data, error } = await supabase
          .from('net_worth_snapshots')
          .select(
            'snapshot_date, net_worth, total_checking, total_investment, total_savings, total_cash, total_bausparer, total_depot, total_crypto, total_debts',
          )
          .eq('user_id', userId)
          .gte('snapshot_date', sinceIso)
          .order('snapshot_date', { ascending: true })
        if (error) return { error: error.message }

        // Ein Snapshot pro Monat statt jedem Tag — der letzte verfügbare
        // innerhalb des Monats gewinnt (überschreibt beim Durchlaufen in
        // aufsteigender Datumsreihenfolge).
        const byMonth = new Map<string, (typeof data)[number]>()
        for (const row of data ?? []) {
          byMonth.set(row.snapshot_date.slice(0, 7), row)
        }

        return { months: Array.from(byMonth.values()) }
      },
    }),

  }
}
