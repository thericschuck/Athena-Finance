/**
 * Kraken Futures (derivatives) API — completely separate product from Kraken Spot: different
 * domain, different API key pair (generated on futures.kraken.com, not kraken.com), and a
 * different signing algorithm. Do not reuse anything from `src/lib/kraken/index.ts` (Spot) here
 * — mixing the two nonce counters or signing schemes is exactly how the Spot "Invalid nonce"
 * bug happened.
 *
 * Signing (per https://docs.kraken.com/api/docs/guides/futures-rest/):
 *   1. Concatenate postData + Nonce + endpointPath
 *   2. SHA-256 hash of that string
 *   3. Base64-decode api_secret
 *   4. HMAC-SHA512(decoded secret, hash from step 2)
 *   5. Base64-encode the result → the `Authent` header
 * `endpointPath` excludes the `/derivatives` prefix (e.g. "/api/v3/openpositions"), even though
 * the actual request URL includes it.
 */
import { createHash, createHmac } from 'crypto'

const FUTURES_BASE = 'https://futures.kraken.com/derivatives'

function signKrakenFuturesRequest(endpointPath: string, nonce: string, postData: string, secret: string): string {
  const hash = createHash('sha256').update(postData + nonce + endpointPath).digest()
  return createHmac('sha512', Buffer.from(secret, 'base64')).update(hash).digest('base64')
}

// Own nonce counter, deliberately separate from Spot's (src/lib/kraken/index.ts) — these are
// two different API keys as far as Kraken is concerned, each tracking its own nonce history.
let lastNonce = 0
function nextNonce(): string {
  const now = Date.now()
  lastNonce = now > lastNonce ? now : lastNonce + 1
  return lastNonce.toString()
}

export interface KrakenFuturesPosition {
  symbol:            string
  side:              'long' | 'short'
  size:              number
  price:             number   // average entry price
  unrealizedPnl:     number
  unrealizedFunding: number
  pnlCurrency:       string   // e.g. "USD"
  fillTime?:         string   // ISO timestamp der Eroeffnung
  /** Nur bei Positionen mit fixem Hebel gesetzt. Kraken Futures rechnet Margin sonst auf
   *  Kontoebene (cross margin) — dann gibt es zu einer einzelnen Position schlicht keinen
   *  Hebelfaktor, den man ehrlich ausweisen koennte. */
  maxFixedLeverage?: number
}

export async function fetchKrakenFuturesOpenPositions(
  apiKey: string,
  apiSecret: string,
): Promise<KrakenFuturesPosition[]> {
  const endpointPath = '/api/v3/openpositions'
  const nonce        = nextNonce()
  const postData      = '' // GET request, no body

  const res = await fetch(`${FUTURES_BASE}${endpointPath}`, {
    method:  'GET',
    headers: {
      'APIKey': apiKey,
      'Authent': signKrakenFuturesRequest(endpointPath, nonce, postData, apiSecret),
      'Nonce':   nonce,
    },
  })

  const json = await res.json() as {
    result: string
    error?: string
    openPositions?: KrakenFuturesPosition[]
  }
  if (json.result !== 'success') throw new Error(json.error ?? 'Kraken Futures API Fehler')
  return json.openPositions ?? []
}
