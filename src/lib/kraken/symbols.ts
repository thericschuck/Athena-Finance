/** Kraken-Asset-Code-Mapping (rein, importfrei, testbar). Server-side wie ./index. */

// Kraken uses internal codes that differ from standard trading symbols.
// X prefix = crypto, Z prefix = fiat. Some modern assets use plain symbols.
export const KRAKEN_TO_SYMBOL: Record<string, string> = {
  // X-prefixed legacy crypto codes
  XXBT:  'BTC',
  XBT:   'BTC', // altname der Kraken-API; ohne Eintrag würde der X-Strip 'BT' liefern
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
 *
 * `KRAKEN_TO_SYMBOL` still wins over Kraken's own `/Assets` "altname" for the handful of
 * legacy-prefixed codes in it (siehe resolveKrakenAsset in ./index).
 */
export function krakenCodeToSymbol(code: string): string {
  // hasOwn statt Index-Zugriff: 'constructor'/'toString' dürfen nicht über den Prototyp treffen
  if (Object.hasOwn(KRAKEN_TO_SYMBOL, code)) return KRAKEN_TO_SYMBOL[code]
  // Heuristic: single-letter X/Z prefix on 3-4 char codes
  if ((code.startsWith('X') || code.startsWith('Z')) && code.length <= 5) {
    return code.slice(1)
  }
  return code
}
