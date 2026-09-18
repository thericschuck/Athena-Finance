/**
 * Führt einen von `buildRebalancePlan()` berechneten Plan tatsächlich auf Kraken aus: platziert
 * jedes Leg als echte Market-Order, loggt das Ergebnis in `kraken_order_log` und stößt
 * abschließend einen normalen Kraken-Sync an, damit `assets`/`asset_valuations` sofort den
 * neuen Bestand zeigen.
 *
 * Liegt neben `sync.ts` (nicht in `crypto/actions.ts`) aus demselben Grund wie dort: kein
 * `auth.getUser()`/`revalidatePath()`, Supabase-Client und User-ID werden hereingereicht, damit
 * sowohl der WRITE_ACTION-`execute()` als auch ein direkter Server-Action-Aufruf sie nutzen
 * können.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import type { Database } from '@/types/database'
import { decrypt } from '@/lib/encryption'
import { fetchKrakenBalances, type KrakenAssetPair } from './index'
import { placeKrakenMarketOrder, pollOrderFill } from './orders'
import { syncKrakenForUser } from './sync'
import type { RebalanceLeg } from '@/lib/crypto/rebalance-plan'

// Kleiner Puffer, der Gebühren/leichte Slippage aus VORHERIGEN Legs DESSELBEN Laufs abfängt.
// Eric hat das am 18.09. live getroffen: BTC- und PAXG-Kauf haben zusammen ~0,25 € Gebühr aus
// dem EUR-Guthaben gezogen, die geplant NICHT als "verbraucht" galten — die dritte Order (EUR→USD
// für VTIx) war danach hauchdünn zu groß und scheiterte an Kraken mit "Insufficient funds".
const SAFETY_FACTOR = 0.995

export interface ExecutedLeg {
  leg:            RebalanceLeg
  status:         'filled' | 'partial' | 'failed'
  filledVolume?:  number
  priceEur?:      number
  costEur?:       number
  feeEur?:        number
  krakenOrderId?: string
  error?:         string
}

export interface RebalanceExecutionResult {
  legGroup:     string
  executed:     ExecutedLeg[]
  // true, sobald ein Leg fehlgeschlagen ist — die restlichen Legs werden dann NICHT mehr
  // versucht (kein automatisches Rollback bereits ausgeführter Trades möglich).
  stoppedEarly: boolean
}

export async function executeRebalancePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  legs: RebalanceLeg[],
  assetPairs: Record<string, KrakenAssetPair>,
  pendingActionId: string | null,
): Promise<RebalanceExecutionResult> {
  const { data: keyRow } = await supabase
    .from('exchange_keys')
    .select('api_key, api_secret')
    .eq('user_id', userId)
    .eq('exchange', 'kraken')
    .maybeSingle()
  if (!keyRow) throw new Error('Kein Kraken-Konto verbunden.')

  let apiKey: string, apiSecret: string
  try {
    apiKey    = decrypt(keyRow.api_key)
    apiSecret = decrypt(keyRow.api_secret)
  } catch (e) {
    throw new Error(`Entschlüsselung fehlgeschlagen: ${(e as Error).message}`)
  }

  const legGroup = randomUUID()
  const executed: ExecutedLeg[] = []
  let stoppedEarly = false

  // `leg.pairKey` ist der Kraken-`altname` (siehe rebalance-plan.ts), `assetPairs` aber nach dem
  // rohen AssetPairs-Objekt-Key indiziert — die beiden sind nicht immer identisch (Kraken listet
  // manche Pairs, mindestens xStocks, unter zwei Keys für denselben altname). Hier einmal auf
  // altname umschlüsseln, damit die Balance-Check-Logik unten den richtigen Eintrag findet.
  const pairsByAltname = new Map(Object.values(assetPairs).map(p => [p.altname, p]))

  for (const leg of legs) {
    if (stoppedEarly) break

    let result: ExecutedLeg
    let volume = leg.estVolume
    try {
      const pair = pairsByAltname.get(leg.pairKey)
      if (leg.side === 'sell' && pair) {
        // Bei 'sell' ist `estVolume` exakt die Menge der abgegebenen Basis-Einheit — lässt sich
        // direkt und exakt gegen das tatsächlich verfügbare Guthaben prüfen, statt dem beim
        // Planen geschätzten Wert blind zu vertrauen (siehe SAFETY_FACTOR-Kommentar oben).
        const balances  = await fetchKrakenBalances(apiKey, apiSecret)
        const available = parseFloat(balances[pair.base] ?? '0') || 0
        if (available < volume) volume = available * SAFETY_FACTOR
      } else if (leg.side === 'buy') {
        // Bei 'buy' ist `estVolume` die Menge der GEKAUFTEN Basis-Einheit, nicht die
        // Spend-Währung — der tatsächliche Preis steht erst nach der Marktorder fest, ein
        // exakter Guthaben-Check ist hier vorab nicht möglich. Der feste Abschlag reicht, um
        // Gebühren-/Slippage-Drift aus vorherigen Legs im selben Lauf abzufangen.
        volume = volume * SAFETY_FACTOR
      }

      const volumeStr = volume.toFixed(8)
      const assetClass = leg.assetClass === 'tokenized_asset' ? 'tokenized_asset' : undefined
      const { txid }  = await placeKrakenMarketOrder(apiKey, apiSecret, leg.pairKey, leg.side, volumeStr, assetClass)
      const info      = await pollOrderFill(apiKey, apiSecret, txid[0])

      const filledVolume = parseFloat(info.vol_exec)
      // Bezogen auf `leg.estVolume` (den ursprünglichen Plan), nicht auf `volume` (die evtl.
      // durch SAFETY_FACTOR/Guthaben-Check reduzierte tatsächliche Order) — `estEurAmount` und
      // `estFeeEur` sind Schätzungen für die GEPLANTE Menge, ihr Verhältnis zueinander (Preis pro
      // Einheit) bleibt unabhängig von einer Kürzung gültig und muss auf die tatsächlich
      // gefüllte Menge hochgerechnet werden, nicht auf die (kleinere) angeforderte.
      const fillRatioVsPlan = leg.estVolume > 0 ? filledVolume / leg.estVolume : 0
      // Ist die Quote-Währung EUR, liefert Kraken selbst echte EUR-Werte — sonst (Cross-Pair,
      // z. B. ETH/BTC) sind cost/fee/price in der Quote-Kryptowährung und wir fallen auf die
      // geschätzten EUR-Werte aus dem Plan zurück, skaliert auf den tatsächlichen Füllgrad.
      const [costEur, feeEur, priceEur] = leg.quoteIsEur
        ? [parseFloat(info.cost), parseFloat(info.fee), parseFloat(info.price)]
        : [
            leg.estEurAmount * fillRatioVsPlan,
            leg.estFeeEur * fillRatioVsPlan,
            leg.estVolume > 0 ? leg.estEurAmount / leg.estVolume : null,
          ]

      result = {
        leg,
        status:        filledVolume >= volume * 0.999 ? 'filled' : 'partial',
        filledVolume,
        priceEur:      priceEur ?? undefined,
        costEur,
        feeEur,
        krakenOrderId: txid[0],
      }
    } catch (e) {
      result = { leg, status: 'failed', error: (e as Error).message }
      stoppedEarly = true
    }
    executed.push(result)

    await supabase.from('kraken_order_log').insert({
      user_id:           userId,
      pending_action_id: pendingActionId,
      leg_group:         legGroup,
      kraken_pair:       leg.pairKey,
      side:              leg.side,
      order_type:        'market',
      // Die tatsächlich angeforderte Menge (nach Guthaben-Check/SAFETY_FACTOR), nicht der
      // ursprüngliche Plan-Wert — sonst sieht das Log im Nachhinein nicht, dass hier bewusst
      // gekürzt wurde.
      requested_volume:  volume,
      filled_volume:     result.filledVolume ?? null,
      price_eur:         result.priceEur ?? null,
      cost_eur:          result.costEur ?? null,
      fee_eur:           result.feeEur ?? null,
      kraken_order_id:   result.krakenOrderId ?? null,
      status:            result.status,
      error:             result.error ?? null,
    })
  }

  // Bestand danach immer neu ziehen, auch wenn ein Leg fehlgeschlagen ist — sonst zeigt die App
  // weiter den Stand von vor den Trades. Best-effort: ein fehlgeschlagener Re-Sync darf das
  // Ergebnis der Trades selbst nicht verstecken (die stehen schon sicher in kraken_order_log).
  await syncKrakenForUser(supabase, userId).catch(() => {})

  return { legGroup, executed, stoppedEarly }
}
