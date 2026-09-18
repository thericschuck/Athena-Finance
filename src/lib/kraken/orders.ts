/**
 * Echte Kraken-Order-Ausführung (AddOrder + QueryOrders). Getrennt von `index.ts`, weil dort
 * ausschließlich lesende Endpunkte liegen — dieses Modul ist der einzige Ort im Code, der
 * tatsächlich Geld bewegt.
 *
 * Nutzt `signKrakenRequest`/`nextNonce` aus `index.ts` statt eigener Implementierungen: der
 * Nonce-Zähler MUSS über alle privaten Aufrufe eines Keys hinweg ein einziger monotoner Zähler
 * sein (siehe Kommentar bei `nextNonce()`), ein zweiter unabhängiger Zähler hier würde genau das
 * Problem riskieren, vor dem dieser Kommentar warnt.
 */
import { KRAKEN_API, signKrakenRequest, nextNonce } from './index'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── AddOrder ───────────────────────────────────────────────────────────────────
export interface KrakenAddOrderResult {
  txid: string[]
  descr: { order: string }
}

/**
 * Platziert eine Market-Order. Bewusst kein Limit-Order-Handling (Preis setzen, Timeout,
 * Cancel) — für "ein Klick, sofort fertig" ist Market der pragmatische Weg; Limit-Orders wären
 * ein eigenes Feature mit eigener Fehlerbehandlung.
 *
 * `assetClass` MUSS für xStocks (z. B. VTIx) auf 'tokenized_asset' gesetzt sein — ohne den
 * Parameter lehnt Kraken den Pair-Namen mit "Unknown asset pair" ab, obwohl er in AssetPairs
 * ganz normal gelistet ist.
 */
export async function placeKrakenMarketOrder(
  apiKey: string,
  apiSecret: string,
  pair: string,
  side: 'buy' | 'sell',
  volume: string,
  assetClass?: 'tokenized_asset',
): Promise<KrakenAddOrderResult> {
  const path     = '/0/private/AddOrder'
  const nonce    = nextNonce()
  let   postData = `nonce=${nonce}&ordertype=market&type=${side}&pair=${pair}&volume=${volume}`
  if (assetClass) postData += `&asset_class=${assetClass}`

  const res = await fetch(`${KRAKEN_API}${path}`, {
    method:  'POST',
    headers: {
      'API-Key':      apiKey,
      'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  const json = await res.json() as { error: string[]; result?: KrakenAddOrderResult }
  if (json.error?.length) throw new Error(json.error.join(', '))
  if (!json.result?.txid?.length) throw new Error('Kraken hat keine Order-ID zurückgegeben')
  return json.result
}

// ─── QueryOrders ────────────────────────────────────────────────────────────────
export interface KrakenOrderInfo {
  status:    'pending' | 'open' | 'closed' | 'canceled' | 'expired'
  vol:       string   // angeforderte Menge
  vol_exec:  string   // tatsächlich ausgeführte Menge
  cost:      string   // Gegenwert in der Quote-Währung
  fee:       string   // Gebühr, in der Quote-Währung
  price:     string   // durchschnittlicher Ausführungspreis
  descr:     { pair: string; type: string; ordertype: string }
}

export async function fetchKrakenOrderInfo(
  apiKey: string,
  apiSecret: string,
  txids: string[],
): Promise<Record<string, KrakenOrderInfo>> {
  const path     = '/0/private/QueryOrders'
  const nonce    = nextNonce()
  const postData = `nonce=${nonce}&txid=${txids.join(',')}`

  const res = await fetch(`${KRAKEN_API}${path}`, {
    method:  'POST',
    headers: {
      'API-Key':      apiKey,
      'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  const json = await res.json() as { error: string[]; result?: Record<string, KrakenOrderInfo> }
  if (json.error?.length) throw new Error(json.error.join(', '))
  return json.result ?? {}
}

const POLL_INTERVAL_MS  = 1500
// Market-Orders füllen praktisch sofort — 8 Versuche à 1,5s sind großzügiger Puffer für den
// Fall, dass Kraken den Fill nicht beim ersten Poll schon verbucht hat.
const POLL_MAX_ATTEMPTS = 8

/**
 * Wartet, bis eine Order einen Endzustand erreicht hat, und gibt deren Info zurück. Wirft nach
 * `POLL_MAX_ATTEMPTS` Versuchen — die Order selbst kann trotzdem längst gefüllt sein, dieser
 * Fehler bedeutet nur "Status hier nicht rechtzeitig bestätigt", nicht "Order fehlgeschlagen".
 * Der Aufrufer (`executeRebalancePlan`) muss diesen Fall im Log als unklar markieren statt als
 * sicher gescheitert.
 */
export async function pollOrderFill(apiKey: string, apiSecret: string, txid: string): Promise<KrakenOrderInfo> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS)
    const info = (await fetchKrakenOrderInfo(apiKey, apiSecret, [txid]))[txid]
    if (info && ['closed', 'canceled', 'expired'].includes(info.status)) return info
  }
  throw new Error(
    `Order ${txid}: Status nach ${POLL_MAX_ATTEMPTS} Abfragen noch nicht final — auf Kraken selbst prüfen.`,
  )
}
