import { getCoinCatalog } from './actions'
import { COIN_REGISTRY } from '@/lib/crypto/coin-registry'
import { CoinCatalogManager } from '@/components/crypto/coin-catalog-manager'

export default async function CryptoAssetsPage() {
  const customCoins = await getCoinCatalog()

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset-Katalog</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Verwalte die verfügbaren Coins und Währungen für dein Portfolio.
        </p>
      </div>

      <CoinCatalogManager builtinCoins={COIN_REGISTRY} customCoins={customCoins} />
    </div>
  )
}
