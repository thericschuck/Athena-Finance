import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRebalancePlan } from './rebalance-plan.ts'
import type { AssetInput, RebalancingTarget } from './rebalancing.ts'
import type { KrakenAssetPair, KrakenTradeableAsset } from '../kraken/index.ts'

const TARGETS: RebalancingTarget[] = [
  { symbol: 'BTC', coingecko_id: 'bitcoin',  target_pct: 50 },
  { symbol: 'ETH', coingecko_id: 'ethereum', target_pct: 50 },
]

const TRADEABLE: KrakenTradeableAsset[] = [
  { code: 'XXBT', symbol: 'BTC', dbSymbol: 'bitcoin',  name: 'Bitcoin',  type: 'crypto' },
  { code: 'XETH', symbol: 'ETH', dbSymbol: 'ethereum', name: 'Ethereum', type: 'crypto' },
]

const EUR_PAIRS: Record<string, KrakenAssetPair> = {
  XXBTZEUR: { altname: 'XBTEUR', base: 'XXBT', quote: 'ZEUR' },
  XETHZEUR: { altname: 'ETHEUR', base: 'XETH', quote: 'ZEUR' },
}

const DIRECT_PAIR: Record<string, KrakenAssetPair> = {
  ...EUR_PAIRS,
  XETHXXBT: { altname: 'ETHXBT', base: 'XETH', quote: 'XXBT' },
}

// Portfolio: alles in BTC, nichts in ETH, kein Cash — 1000 € gesamt, Ziel 50/50.
const ALL_BTC_ASSETS: AssetInput[] = [
  { symbol: 'bitcoin', portfolio_name: 'Kraken', current_price: 50_000, current_value: 1000, quantity: 0.02 },
]
const ETH_PRICE = { ethereum: 3000 }

test('direktes Pair wird bevorzugt statt über EUR zu routen', () => {
  const plan = buildRebalancePlan(TARGETS, ALL_BTC_ASSETS, 1000, 5, TRADEABLE, DIRECT_PAIR, ETH_PRICE)
  assert.equal(plan.legs.length, 1)
  assert.equal(plan.legs[0].route, 'direct')
  assert.equal(plan.legs[0].pairKey, 'ETHXBT') // altname, nicht der rohe AssetPairs-Key
  assert.equal(plan.legs[0].side, 'buy') // Basis der Pair ist ETH → wir kaufen ETH, zahlen in BTC
  assert.ok(Math.abs(plan.legs[0].estVolume - 500 / 3000) < 1e-9)
})

test('ohne direktes Pair wird über EUR geroutet (zwei Legs)', () => {
  const plan = buildRebalancePlan(TARGETS, ALL_BTC_ASSETS, 1000, 5, TRADEABLE, EUR_PAIRS, ETH_PRICE)
  assert.equal(plan.legs.length, 2)
  assert.ok(plan.legs.every(l => l.route === 'via-eur'))
  const sell = plan.legs.find(l => l.side === 'sell')!
  const buy  = plan.legs.find(l => l.side === 'buy')!
  assert.equal(sell.fromSymbol, 'BTC')
  assert.equal(sell.toSymbol, 'EUR')
  assert.equal(buy.fromSymbol, 'EUR')
  assert.equal(buy.toSymbol, 'ETH')
})

test('Beine unter Kraken-Mindestordergröße werden übersprungen, nicht ausgeführt', () => {
  const tinyPortfolio: AssetInput[] = [
    { symbol: 'bitcoin', portfolio_name: 'Kraken', current_price: 50_000, current_value: 10, quantity: 0.0002 },
  ]
  const pairsWithMin: Record<string, KrakenAssetPair> = {
    XXBTZEUR: { ...EUR_PAIRS.XXBTZEUR, ordermin: '1' },  // absurd hoch, erzwingt den Skip
    XETHZEUR: { ...EUR_PAIRS.XETHZEUR, ordermin: '10' }, // absurd hoch, erzwingt den Skip
  }
  const plan = buildRebalancePlan(TARGETS, tinyPortfolio, 10, 5, TRADEABLE, pairsWithMin, ETH_PRICE)
  assert.equal(plan.legs.length, 0)
  assert.ok(plan.warnings.some(w => w.includes('Mindestordergröße')))
})

test('Assets ohne EUR-Pair werden über USD geroutet, inklusive EUR→USD-Wechsel-Leg (xStocks-Fall wie VTIx)', () => {
  // Nachbau des echten Kraken-Bugs: VTIx (und xStocks allgemein) haben nur ein ZUSD-Pair, kein
  // ZEUR-Pair — hier simuliert, indem ETH nur gegen USD notiert, nicht gegen EUR. Eric hält aber
  // nur EUR, deshalb muss zusätzlich eine EUR→USD-Wechsel-Order eingeplant werden.
  const usdOnlyEthPairs: Record<string, KrakenAssetPair> = {
    XXBTZEUR: EUR_PAIRS.XXBTZEUR,
    XETHZUSD: { altname: 'ETHUSD', base: 'XETH', quote: 'ZUSD', aclass_base: 'tokenized_asset' },
    ZUSDZEUR: { altname: 'USDEUR', base: 'ZUSD', quote: 'ZEUR' },
  }
  const usdPerEur = 1.08
  const plan = buildRebalancePlan(TARGETS, ALL_BTC_ASSETS, 1000, 5, TRADEABLE, usdOnlyEthPairs, ETH_PRICE, usdPerEur)
  assert.deepEqual(plan.warnings, [])
  assert.equal(plan.legs.length, 3, 'Verkauf BTC→EUR, Wechsel EUR→USD, Kauf USD→ETH')

  const buy = plan.legs.find(l => l.toSymbol === 'ETH')!
  assert.ok(buy, 'ETH-Kauf sollte trotz fehlendem EUR-Pair über USD zustande kommen')
  assert.equal(buy.fromSymbol, 'USD')
  assert.equal(buy.quoteIsEur, false)
  assert.equal(buy.assetClass, 'tokenized_asset')
  // Die ETH-Menge selbst hängt nur an ETHs EUR-Preis, nicht an der Zahlwährung — 500 € Ziel-
  // Volumen ergeben immer dieselbe Menge, ob in EUR oder USD bezahlt wird.
  assert.ok(Math.abs(buy.estVolume - 500 / 3000) < 1e-9)

  const fx = plan.legs.find(l => l.fromSymbol === 'EUR' && l.toSymbol === 'USD')
  assert.ok(fx, 'EUR→USD-Wechsel-Order fehlt — ohne sie hat Kraken beim ETH-Kauf kein USD-Guthaben')
  assert.equal(fx!.estEurAmount, 500)
  // Wechsel-Volumen ist in USD: 500 € × Kurs ergibt die tatsächlich benötigten Dollar.
  assert.ok(Math.abs(fx!.estVolume - 500 * usdPerEur) < 1e-9)
})

test('vorhandenes EUR-Cash deckt Käufe vor dem Sell-Matching — UND wird selbst zu einem echten Kauf-Auftrag', () => {
  const withCash: AssetInput[] = [
    ...ALL_BTC_ASSETS,
    { symbol: 'EUR', portfolio_name: 'Kraken', current_price: 1, current_value: 200, quantity: 200 },
  ]
  // Gesamtwert jetzt 1200 (1000 BTC + 200 EUR) → Ziel je 600. BTC verkauft 400, ETH kauft 600,
  // davon deckt Cash 200 (EIGENER Kauf-Leg, EUR→ETH) — die verbleibenden 400 werden gegen den
  // BTC-Verkauf gematcht (direktes Pair BTC→ETH). Insgesamt muss die volle Kaufsumme von 600 €
  // als Trades ankommen, nicht nur der über den Verkauf gedeckte Teil.
  const plan = buildRebalancePlan(TARGETS, withCash, 1200, 5, TRADEABLE, DIRECT_PAIR, ETH_PRICE)
  const totalEur = plan.legs.reduce((s, l) => s + l.estEurAmount, 0)
  assert.ok(Math.abs(totalEur - 600) < 0.01, `erwartet 600€ Handelsvolumen (voller ETH-Kauf), war ${totalEur}`)

  const cashLeg   = plan.legs.find(l => l.pairKey === 'ETHEUR') // altname von XETHZEUR
  const directLeg = plan.legs.find(l => l.pairKey === 'ETHXBT') // altname von XETHXXBT
  assert.ok(cashLeg, 'Cash-finanzierter Kauf (EUR→ETH) fehlt')
  assert.ok(Math.abs(cashLeg!.estEurAmount - 200) < 0.01)
  assert.ok(directLeg, 'Über den BTC-Verkauf gematchter Kauf (direktes Pair) fehlt')
  assert.ok(Math.abs(directLeg!.estEurAmount - 400) < 0.01)
})

test('Kaufbedarf ohne Deckung wird als Lücke gemeldet statt als Order, die auf Kraken scheitern würde', () => {
  // Nachbau von Erics echtem Fall: `totalValue` zählt auch Kleinstbestände in Coins mit, die
  // keine Ziele sind (ETH/SOL/BNB-Staub) — das tatsächliche Cash reicht dann nicht ganz für die
  // vollen Ziel-Beträge. Hier simuliert: totalValue (100) liegt 1 € über dem echten Cash (99).
  const assets: AssetInput[] = [
    { symbol: 'EUR', portfolio_name: 'Kraken', current_price: 1, current_value: 99, quantity: 99 },
  ]
  // Weder BTC noch ETH gehalten — beide Preise kommen aus `livePrices`, wie bei echten Ziel-
  // Assets ohne eigenen Bestand.
  const plan = buildRebalancePlan(TARGETS, assets, 100, 5, TRADEABLE, EUR_PAIRS, { bitcoin: 50_000, ...ETH_PRICE })

  assert.ok(
    plan.warnings.some(w => w.includes('ohne Deckung')),
    'Erwartet eine Lücken-Warnung statt eines stillschweigenden oder zum Scheitern verurteilten Trades',
  )
  const totalEur = plan.legs.reduce((s, l) => s + l.estEurAmount, 0)
  assert.ok(Math.abs(totalEur - 99) < 0.01, `sollte nur das tatsächlich vorhandene Cash verplanen, war ${totalEur}`)
})

test('zwei AssetPairs-Keys mit demselben altname (Kraken-SPV-Alias) verschmelzen zu EINER Order mit dem altname', () => {
  // Nachbau des echten Kraken-Bugs bei VTIx: derselbe Pair steht im AssetPairs-Ergebnis unter
  // ZWEI verschiedenen Keys ("VTISPVUSD" und "VTIxUSD"), beide mit altname "VTIxUSD" — der
  // ältere/interne Key wurde von Kraken bei AddOrder mit "Permission denied" abgelehnt, der
  // altname funktioniert. Hier nachgebaut mit ETH/USD unter zwei Keys.
  const aliasedPairs: Record<string, KrakenAssetPair> = {
    XXBTZEUR:   EUR_PAIRS.XXBTZEUR,
    ETHSPVUSD:  { altname: 'ETHUSD', base: 'XETH', quote: 'ZUSD', aclass_base: 'tokenized_asset' },
    ETHUSD:     { altname: 'ETHUSD', base: 'XETH', quote: 'ZUSD', aclass_base: 'tokenized_asset' },
    ZEURZUSD:   { altname: 'EURUSD', base: 'ZEUR', quote: 'ZUSD' },
  }
  const plan = buildRebalancePlan(TARGETS, ALL_BTC_ASSETS, 1000, 5, TRADEABLE, aliasedPairs, ETH_PRICE, 1.08)

  const ethBuys = plan.legs.filter(l => l.toSymbol === 'ETH')
  assert.equal(ethBuys.length, 1, 'darf nicht in zwei separate (evtl. zu kleine) Orders zerfallen')
  assert.equal(ethBuys[0].pairKey, 'ETHUSD', 'muss den öffentlichen altname verwenden, nicht den rohen AssetPairs-Key')
})

test('bereits vorhandenes USD-Cash wird direkt genutzt, kein doppelter Umtausch', () => {
  // Nachbau von Erics zweitem Versuch: die EUR→USD-Order war schon erfolgreich, der eigentliche
  // VTIx-Kauf danach an einer Kraken-Berechtigung gescheitert — beim nächsten Lauf liegt das USD
  // also schon bereit und darf NICHT nochmal aus EUR gewandelt werden. BTC ist hier absichtlich
  // exakt im Ziel (kein Sell-Matching), um nur den Cash-Pfad zu prüfen.
  const usdOnlyEthPairs: Record<string, KrakenAssetPair> = {
    XXBTZEUR: EUR_PAIRS.XXBTZEUR,
    XETHZUSD: { altname: 'ETHUSD', base: 'XETH', quote: 'ZUSD', aclass_base: 'tokenized_asset' },
    ZEURZUSD: { altname: 'EURUSD', base: 'ZEUR', quote: 'ZUSD' },
  }
  const assetsWithUsd: AssetInput[] = [
    { symbol: 'bitcoin', portfolio_name: 'Kraken', current_price: 50_000, current_value: 500, quantity: 0.01 },
    { symbol: 'USD', portfolio_name: 'Kraken', current_price: 1, current_value: 500, quantity: 500 },
  ]
  const plan = buildRebalancePlan(TARGETS, assetsWithUsd, 1000, 5, TRADEABLE, usdOnlyEthPairs, ETH_PRICE, 1.08)

  assert.deepEqual(plan.warnings, [])
  assert.equal(plan.legs.length, 1, 'BTC ist exakt im Ziel, ETH komplett aus vorhandenem USD gedeckt')
  const buy = plan.legs[0]
  assert.equal(buy.fromSymbol, 'USD')
  assert.equal(buy.toSymbol, 'ETH')
  assert.ok(Math.abs(buy.estEurAmount - 500) < 0.01)
})
