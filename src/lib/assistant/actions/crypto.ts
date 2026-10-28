import { z } from 'zod'
import { buildRebalancePlan } from '@/lib/crypto/rebalance-plan'
import type { RebalancingTarget } from '@/lib/crypto/rebalancing'
import { getSettings } from '@/lib/settings'
import { fetchKrakenTradeableAssets, fetchKrakenAssetPairs, buildKrakenPriceMap } from '@/lib/kraken'
import { executeRebalancePlan } from '@/lib/kraken/rebalance-execution'
import { type ActionDetail, type DB, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'
import { eur } from '@/lib/assistant/actions/format'

/**
 * Lädt genau die Assets, die `calculateRebalancing()`/`buildRebalancePlan()` brauchen — dieselbe
 * Abfrage (Assets + jeweils letzte Valuation) wie in `rebalancing/page.tsx`, hier noch einmal
 * lokal statt importiert: `crypto/actions.ts` ist eine `'use server'`-Route-Datei, aus einem
 * allgemeinen `lib`-Modul heraus wäre das eine falsche Abhängigkeitsrichtung.
 */
async function loadRebalancingAssets(supabase: DB, userId: string) {
  const { data: rawAssets } = await supabase
    .from('assets')
    .select('id, symbol, portfolio_name, quantity')
    .in('type', ['crypto', 'stable', 'fiat'])
    .eq('user_id', userId)

  const assetIds = (rawAssets ?? []).map((a) => a.id)
  const { data: rawValuations } = assetIds.length
    ? await supabase
        .from('asset_valuations')
        .select('asset_id, price_per_unit, total_value, valuation_date, created_at')
        .in('asset_id', assetIds)
        .order('valuation_date', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] }

  const latestMap = new Map<string, { price_per_unit: number; total_value: number }>()
  for (const v of rawValuations ?? []) {
    if (!latestMap.has(v.asset_id)) {
      latestMap.set(v.asset_id, { price_per_unit: v.price_per_unit, total_value: v.total_value })
    }
  }

  return (rawAssets ?? []).map((a) => {
    const val = latestMap.get(a.id)
    return {
      symbol: a.symbol,
      portfolio_name: a.portfolio_name,
      current_price: val?.price_per_unit ?? null,
      current_value: val?.total_value ?? null,
      quantity: a.quantity,
    }
  })
}

const REBALANCE_THRESHOLD = 5 // % Abweichung, ab der überhaupt gehandelt wird — gleicher Default wie im UI

/**
 * Baut den Rebalancing-Plan komplett neu aus dem aktuellen Datenstand — wird von `summarize`,
 * `details`, `validate` UND `execute` jeweils eigenständig aufgerufen (nicht gecacht). Das
 * bedeutet mehrere Kraken-Roundtrips pro Vorschlag/Bestätigung, ist hier aber gewollt: zwischen
 * einem Chat-Vorschlag und dem Klick auf „Bestätigen" können Minuten oder Stunden liegen, und bei
 * echten Trades soll `execute` unter keinen Umständen mit veralteten Preisen/Beständen rechnen.
 */
async function buildFreshRebalancePlan(supabase: DB, userId: string) {
  const [assets, settings, tradeableAssets, assetPairs] = await Promise.all([
    loadRebalancingAssets(supabase, userId),
    getSettings(userId),
    fetchKrakenTradeableAssets(),
    fetchKrakenAssetPairs(),
  ])
  const targets = (settings.rebalancing_targets ?? []) as unknown as RebalancingTarget[]
  const totalValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)

  // Ziel-Assets ohne eigenen Bestand haben keinen Preis aus der letzten Sync-Valuation — live
  // von Kraken nachladen, exakt wie in `rebalancing/page.tsx`. `usdPerEur` wird IMMER mitgeholt
  // (auch mit leerer Codes-Liste) — `buildRebalancePlan` braucht den Kurs für jede Route über
  // USD (xStocks), unabhängig davon, ob gerade ein fehlender Preis nachgeladen wird.
  const heldCgIds = new Set(assets.map((a) => a.symbol?.toLowerCase()).filter(Boolean))
  const codeByCgId = new Map(tradeableAssets.map((t) => [t.dbSymbol, t.code]))
  const missingTargets = targets.filter((t) => !heldCgIds.has(t.coingecko_id.toLowerCase()))
  const missingCodes = missingTargets
    .map((t) => codeByCgId.get(t.coingecko_id))
    .filter((c): c is string => !!c)

  const { pricesEur, usdPerEur } = await buildKrakenPriceMap(missingCodes, assetPairs, { fresh: true }).catch(
    () => ({ pricesEur: {} as Record<string, number>, unresolved: [] as string[], usdPerEur: 1 }),
  )
  const livePrices: Record<string, number> = {}
  for (const t of missingTargets) {
    const code = codeByCgId.get(t.coingecko_id)
    if (code && pricesEur[code] != null) livePrices[t.coingecko_id.toLowerCase()] = pricesEur[code]
  }

  const plan = buildRebalancePlan(
    targets, assets, totalValue, REBALANCE_THRESHOLD, tradeableAssets, assetPairs, livePrices, usdPerEur,
  )
  return { plan, targets, assetPairs }
}

export const cryptoActions = {
  // ── Krypto: Rebalancing ausführen ────────────────────────────────────────────
  //
  // Die einzige Aktion, die echte Kraken-Orders auslöst — Geld bewegt sich sofort und
  // unumkehrbar, deshalb hier besonders konsequent: `execute` baut den Plan noch einmal komplett
  // neu (siehe `buildFreshRebalancePlan`) statt sich auf das zu verlassen, was beim Vorschlag im
  // Chat stand.
  executeRebalancing: defineAction({
    label: 'Rebalancing ausführen',
    description:
      'Führt das im Rebalancing-Tab hinterlegte Ziel-Portfolio tatsächlich auf Kraken aus: ' +
      'verkauft übergewichtete und kauft untergewichtete Ziel-Assets per Market-Order. Nutzt ' +
      'dafür ein direktes Kraken-Pair, wenn eines existiert (z. B. BTC→ETH direkt), sonst den ' +
      'Umweg über EUR. ECHTES GELD — jede Order wird bei Bestätigung sofort ausgeführt, es gibt ' +
      'kein Rollback. Nutze das nur, wenn der Nutzer ausdrücklich ein Rebalancing ausführen lassen ' +
      'will — nicht als Antwort auf eine bloße Frage nach dem aktuellen Rebalancing-Bedarf.',
    schema: z.object({}),
    validate: async (_input, ctx) => {
      const { plan, targets } = await buildFreshRebalancePlan(ctx.supabase, ctx.userId)
      if (targets.length === 0) {
        return 'Kein Ziel-Portfolio hinterlegt — erst im Rebalancing-Tab Ziele anlegen.'
      }
      const sumPct = targets.reduce((s, t) => s + t.target_pct, 0)
      if (Math.abs(sumPct - 100) > 0.5) {
        return `Ziel-Prozente ergeben ${sumPct.toFixed(1)} % statt 100 % — erst im Rebalancing-Tab korrigieren.`
      }
      if (plan.legs.length === 0) {
        return plan.warnings.length > 0
          ? `Kein ausführbarer Trade: ${plan.warnings.join('; ')}`
          : 'Portfolio ist bereits balanced — nichts zu tun.'
      }
      return null
    },
    summarize: async (_input, ctx) => {
      const { plan } = await buildFreshRebalancePlan(ctx.supabase, ctx.userId)
      const n = plan.legs.length
      return (
        `Rebalancing ausführen: ${n} Trade${n === 1 ? '' : 's'}, ` +
        `~${eur(plan.estTotalVolumeEur)} Volumen, ~${eur(plan.estTotalFeeEur)} geschätzte Gebühren`
      )
    },
    details: async (_input, ctx) => {
      const { plan } = await buildFreshRebalancePlan(ctx.supabase, ctx.userId)
      const rows: ActionDetail[] = plan.legs.map((leg) => ({
        label: `${leg.fromSymbol} → ${leg.toSymbol}`,
        value: eur(leg.estEurAmount),
        hint: `${leg.route === 'direct' ? 'direktes Pair' : leg.quoteIsEur ? 'über EUR' : 'über USD'} · Gebühr ~${eur(leg.estFeeEur)} · ${leg.pairKey}`,
      }))
      for (const w of plan.warnings) rows.push({ label: 'Hinweis', value: w })
      return rows
    },
    execute: async (_input, ctx) => {
      const { plan, assetPairs } = await buildFreshRebalancePlan(ctx.supabase, ctx.userId)
      if (plan.legs.length === 0) {
        throw new Error(
          plan.warnings.length > 0
            ? `Kein ausführbarer Trade: ${plan.warnings.join('; ')}`
            : 'Portfolio ist bereits balanced — nichts zu tun.',
        )
      }
      const result = await executeRebalancePlan(ctx.supabase, ctx.userId, plan.legs, assetPairs, null)
      return {
        legGroup: result.legGroup,
        stoppedEarly: result.stoppedEarly,
        trades: result.executed.map((e) => ({
          pair: e.leg.pairKey,
          side: e.leg.side,
          status: e.status,
          filledVolume: e.filledVolume ?? null,
          costEur: e.costEur ?? null,
          error: e.error ?? null,
        })),
      }
    },
  }),
} satisfies Record<string, ActionDefinition<z.ZodType>>
