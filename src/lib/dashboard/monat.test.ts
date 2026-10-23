import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetStand, nettoVorzeichen } from './monat.ts'
import { kontotypLabel, kryptoErgebnis, prozentText, tonFuer, zeigeRebalancing } from './anlagen.ts'

test('budgetStand: gruen, gelb ab 80 %, rot ab 100 %', () => {
  assert.equal(budgetStand(1000, 500)?.ton, 'gut')
  assert.equal(budgetStand(1000, 800)?.ton, 'warnung')
  assert.equal(budgetStand(1000, 1000)?.ton, 'schlecht')
})

test('budgetStand: Balken auf 100 begrenzt, Rest negativ bei Ueberzug', () => {
  const s = budgetStand(1000, 1500)!
  assert.equal(s.prozent, 150)
  assert.equal(s.balken, 100)
  assert.equal(s.rest, -500)
})

test('budgetStand: ohne Budget kein Stand', () => {
  assert.equal(budgetStand(null, 100), null)
  assert.equal(budgetStand(0, 100), null)
})

test('nettoVorzeichen: Cent-Rundung', () => {
  assert.equal(nettoVorzeichen(-0.001), 'null')
  assert.equal(nettoVorzeichen(12), 'plus')
  assert.equal(nettoVorzeichen(-12), 'minus')
})

test('kryptoErgebnis: gegen Kosten, ohne Kosten null', () => {
  assert.deepEqual(kryptoErgebnis(1200, 1000), { betrag: 200, prozent: 20 })
  assert.equal(kryptoErgebnis(1200, null), null)
  assert.equal(kryptoErgebnis(1200, 0), null)
})

test('Rebalancing ab 1 EUR, Kontotyp-Labels, Prozenttext', () => {
  assert.equal(zeigeRebalancing(0.5), false)
  assert.equal(zeigeRebalancing(1), true)
  assert.equal(kontotypLabel('checking'), 'Girokonto')
  assert.equal(kontotypLabel('xyz'), 'xyz')
  assert.equal(prozentText(5.04, 'de-DE'), '+5,0 %')
  assert.equal(prozentText(-2.26, 'de-DE'), '−2,3 %')
  assert.equal(prozentText(0.01, 'de-DE'), '0,0 %')
  assert.equal(tonFuer(0.01), 'neutral')
})
