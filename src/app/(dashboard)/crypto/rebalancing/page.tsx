import { requireAuthUser } from '@/lib/supabase/server'
import { getRebalancingTargets, getLastRebalancing } from '@/app/(dashboard)/crypto/actions'
import { RebalancingCalculator } from '@/components/crypto/rebalancing-calculator'
import { getCryptoAssetsWithPrice } from '@/lib/data/crypto'
import { resolveScope } from '@/lib/haushalt/resolve'
import { fetchKrakenTradeableAssets, fetchKrakenAssetPairs, buildKrakenPriceMap } from '@/lib/kraken'

export default async function RebalancingPage() {
  const { supabase, user } = await requireAuthUser()
  const userId = user!.id

  // Load assets + latest valuations. Das Rebalancing fuehrt Orders mit den EIGENEN Kraken-Schluesseln aus: gerechnet wird deshalb
  // strikt mit den eigenen Assets (kein geteiltes Asset eines Haushaltspartners, kein Scope-Cookie). Kraken-Handel bleibt beim Eigentuemer.
  const scope = await resolveScope(supabase, user!, 'ich')
  const ctx = { ...scope, ownerIds: [scope.userId], includeShared: false }
  const assets = await getCryptoAssetsWithPrice(supabase, ctx)

  const totalValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)

  const [targets, lastRebalancing] = await Promise.all([
    getRebalancingTargets(userId),
    getLastRebalancing(userId),
  ])

  // Ziel-Assets ohne eigenen Bestand haben keine `assets`-Zeile und damit keinen Preis aus der
  // letzten Sync-Valuation. Fuer die (Kraken fuehrt sie oeffentlich, kein API-Key noetig) live
  // nachladen, statt in der Tabelle als "Kein Preis" stehen zu bleiben.
  const heldCgIds = new Set(assets.map(a => a.symbol?.toLowerCase()).filter(Boolean))
  const missingTargets = targets.filter(t => !heldCgIds.has(t.coingecko_id.toLowerCase()))

  const livePrices: Record<string, number> = {}
  if (missingTargets.length > 0) {
    try {
      const [tradeable, assetPairs] = await Promise.all([
        fetchKrakenTradeableAssets(),
        fetchKrakenAssetPairs(),
      ])
      const codeByCgId = new Map(tradeable.map(t => [t.dbSymbol, t.code]))
      const codes = missingTargets
        .map(t => codeByCgId.get(t.coingecko_id))
        .filter((c): c is string => !!c)

      if (codes.length > 0) {
        const { pricesEur } = await buildKrakenPriceMap(codes, assetPairs)
        for (const t of missingTargets) {
          const code = codeByCgId.get(t.coingecko_id)
          if (code && pricesEur[code] != null) livePrices[t.coingecko_id.toLowerCase()] = pricesEur[code]
        }
      }
    } catch {
      // best-effort — Rebalancing funktioniert trotzdem, die betroffenen Zeilen zeigen dann
      // weiterhin "Kein Preis" statt einer Kauf-Empfehlung.
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rebalancing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Ziel-Assets mit Prozent-Gewichtung anlegen und mit dem Ist-Bestand vergleichen
        </p>
      </div>

      <RebalancingCalculator
        assets={assets}
        initialTargets={targets}
        totalValue={totalValue}
        lastRebalancing={lastRebalancing}
        livePrices={livePrices}
      />
    </div>
  )
}
