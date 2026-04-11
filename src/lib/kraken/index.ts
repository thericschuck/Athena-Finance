/**
 * Shared Kraken API utilities.
 * Server-side only — never import in client components.
 */
import { createHash, createHmac } from 'crypto'

const KRAKEN_API = 'https://api.kraken.com'

// ─── Asset Code Mapping ───────────────────────────────────────────────────────
// Kraken uses internal codes that differ from standard trading symbols.
// X prefix = crypto, Z prefix = fiat. Some modern assets use plain symbols.
export const KRAKEN_TO_SYMBOL: Record<string, string> = {
  // X-prefixed legacy crypto codes
  XXBT:  'BTC',
  XETH:  'ETH',
  XXRP:  'XRP',
  XLTC:  'LTC',
  XXLM:  'XLM',
  XDOGE: 'DOGE',
  XXMR:  'XMR',
  XREP:  'REP',
  XZEC:  'ZEC',
  XMLN:  'MLN',
  XICN:  'ICN',
  // Z-prefixed fiat codes
  ZEUR:  'EUR',
  ZUSD:  'USD',
  ZGBP:  'GBP',
  ZCAD:  'CAD',
  ZJPY:  'JPY',
  ZCHF:  'CHF',
  ZAUD:  'AUD',
  // Modern assets already use standard symbols — pass through as-is
}

/**
 * Resolves a Kraken internal asset code to a standard trading symbol.
 * Falls back to stripping a leading X/Z if no explicit mapping exists.
 */
export function krakenCodeToSymbol(code: string): string {
  if (KRAKEN_TO_SYMBOL[code]) return KRAKEN_TO_SYMBOL[code]
  // Heuristic: single-letter X/Z prefix on 3-4 char codes
  if ((code.startsWith('X') || code.startsWith('Z')) && code.length <= 5) {
    return code.slice(1)
  }
  return code
}

// ─── Request Signing ──────────────────────────────────────────────────────────
/**
 * Signs a Kraken private API request.
 * HMAC-SHA512( base64decode(secret), path + SHA256(nonce + postData) )
 */
export function signKrakenRequest(path: string, nonce: string, postData: string, secret: string): string {
  const sha256Payload = createHash('sha256').update(nonce + postData).digest()
  const message = Buffer.concat([Buffer.from(path), sha256Payload])
  return createHmac('sha512', Buffer.from(secret, 'base64')).update(message).digest('base64')
}

// ─── Balance Fetch ────────────────────────────────────────────────────────────
export interface KrakenRawBalances {
  [krakenCode: string]: string  // e.g. { XXBT: '0.50', ZEUR: '1000.00' }
}

/**
 * Calls Kraken /0/private/Balance and returns raw balances.
 * Throws on network error or Kraken API error.
 */
export async function fetchKrakenBalances(apiKey: string, apiSecret: string): Promise<KrakenRawBalances> {
  const path     = '/0/private/Balance'
  const nonce    = Date.now().toString()
  const postData = `nonce=${nonce}`

  const res = await fetch(`${KRAKEN_API}${path}`, {
    method:  'POST',
    headers: {
      'API-Key':      apiKey,
      'API-Sign':     signKrakenRequest(path, nonce, postData, apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  const json = await res.json() as { error: string[]; result?: KrakenRawBalances }

  if (json.error?.length) {
    throw new Error(json.error.join(', '))
  }

  return json.result ?? {}
}
