import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KRAKEN_TO_SYMBOL, krakenCodeToSymbol } from './symbols.ts'

test('explizite Legacy-Codes: XXBT->BTC, XETH->ETH, ZEUR->EUR ...', () => {
  assert.equal(krakenCodeToSymbol('XXBT'), 'BTC')
  assert.equal(krakenCodeToSymbol('XETH'), 'ETH')
  assert.equal(krakenCodeToSymbol('XDOGE'), 'DOGE')
  assert.equal(krakenCodeToSymbol('ZEUR'), 'EUR')
  assert.equal(krakenCodeToSymbol('ZUSD'), 'USD')
  for (const [code, sym] of Object.entries(KRAKEN_TO_SYMBOL)) assert.equal(krakenCodeToSymbol(code), sym)
})

test('XBT (API-altname) wird explizit zu BTC gemappt, nicht per X-Strip zu BT', () => {
  assert.equal(krakenCodeToSymbol('XBT'), 'BTC')
})

test('Prototyp-Schlüssel treffen nicht das Mapping', () => {
  assert.equal(krakenCodeToSymbol('constructor'), 'constructor')
  assert.equal(krakenCodeToSymbol('toString'), 'toString')
})

test('moderne Codes laufen unverändert durch', () => {
  for (const c of ['SOL', 'ADA', 'DOT', 'USDT', 'USDC', 'MATIC', 'BTC']) assert.equal(krakenCodeToSymbol(c), c)
})

test('unbekannte X/Z-Codes bis 5 Zeichen: Präfix wird gestrippt', () => {
  assert.equal(krakenCodeToSymbol('XTZ'), 'TZ')
  assert.equal(krakenCodeToSymbol('ZRX'), 'RX')
  assert.equal(krakenCodeToSymbol('ZKSYN'), 'KSYN')
  assert.equal(krakenCodeToSymbol('XNEW'), 'NEW')
})

test('Codes >5 Zeichen mit X/Z bleiben unverändert', () => {
  assert.equal(krakenCodeToSymbol('XRPUSD'), 'XRPUSD')
  assert.equal(krakenCodeToSymbol('ZEUROS'), 'ZEUROS')
  assert.equal(krakenCodeToSymbol('XYZABC'), 'XYZABC')
})

test('Randfälle: leer, Kleinschreibung, Sonderzeichen', () => {
  assert.equal(krakenCodeToSymbol(''), '')
  assert.equal(krakenCodeToSymbol('xxbt'), 'xxbt')
  assert.equal(krakenCodeToSymbol('X'), '')
  assert.equal(krakenCodeToSymbol('ETH.S'), 'ETH.S')
  assert.equal(krakenCodeToSymbol('ETH2.S'), 'ETH2.S')
})
