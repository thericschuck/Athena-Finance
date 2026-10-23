import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregiereTage, anteile, assetKennzahlen, bildeReihen, gruppiere, toggleAsset,
  zeitraumAusParam, zeitraumStart, type SnapshotZeile,
} from './portfolio.ts'

const z = (asset_id: string, snapshot_date: string, quantity: number, price_eur: number, portfolio_name = 'Kraken'): SnapshotZeile => ({
  asset_id, snapshot_date, portfolio_name, quantity, price_eur, value_eur: quantity * price_eur,
})

test('Zeitraum-Parameter und Startdatum', () => {
  assert.equal(zeitraumAusParam('quatsch'), 'max')
  assert.equal(zeitraumAusParam('6m'), '6m')
  assert.equal(zeitraumStart('max'), null)
  assert.equal(zeitraumStart('3m', new Date('2026-10-23T10:00:00Z')), '2026-07-23')
})

test('aggregiereTage addiert Portfolios und schreibt Luecken fort, aber nicht nach dem Ende', () => {
  const tage = aggregiereTage([
    z('a', '2026-01-01', 1, 100), z('a', '2026-01-01', 1, 100, 'Zweit'),
    z('b', '2026-01-01', 1, 50),
    z('a', '2026-01-02', 1, 110),
    // b fehlt am 2.1. (Luecke), kommt am 3.1. zurueck
    z('b', '2026-01-03', 1, 60), z('a', '2026-01-03', 1, 120),
    // c endet am 3.1.
    z('c', '2026-01-02', 1, 10), z('c', '2026-01-03', 1, 10),
    z('a', '2026-01-04', 1, 130),
  ])
  assert.equal(tage[0].werte.a, 200)
  assert.equal(tage[1].werte.b, 50)
  assert.equal(tage[1].werte.c, 10)
  assert.equal(tage[2].werte.b, 60)
  assert.equal(tage[3].werte.c, undefined)
  assert.equal(tage[3].werte.b, undefined)
})

test('anteile summieren zu 100 und sind bei Wert 0 nie NaN', () => {
  const a = anteile({ x: 30, y: 70 })
  assert.equal(a.x + a.y, 100)
  assert.deepEqual(anteile({ x: 0 }), { x: 0 })
})

test('bildeReihen: mehr als fuenf Assets ergeben Weitere', () => {
  const werte: Record<string, number> = {}
  for (let i = 0; i < 7; i++) werte['a' + i] = (i + 1) * 10
  const { reihen, rest } = bildeReihen([{ datum: '2026-01-01', werte }], id => id)
  assert.equal(reihen.length, 6)
  assert.equal(reihen[0].key, 'a6')
  assert.equal(reihen[5].key, 'weitere')
  assert.equal(rest.size, 2)
  const g = gruppiere(werte, rest)
  assert.equal(g.weitere, 10 + 20)
})

test('Zukauf ist kein Gewinn: Kurs und Menge getrennt, Summe = Wertdelta', () => {
  // 10 Stueck a 100 -> 20 Stueck a 110 (10 zugekauft)
  const k = assetKennzahlen([z('a', '2026-01-01', 10, 100), z('a', '2026-02-01', 20, 110)])[0]
  assert.equal(k.deltaGesamtEur, 2200 - 1000)
  assert.equal(k.kursEur, 10 * 10)
  assert.equal(k.mengeEur, 10 * 110)
  assert.ok(Math.abs((k.kursProzent ?? 0) - 10) < 1e-9)
  assert.equal(k.kursEur + k.mengeEur, k.deltaGesamtEur)
})

test('Anteil am Portfolio und Ausschluss nicht mehr gehaltener Assets', () => {
  const ks = assetKennzahlen([
    z('a', '2026-01-01', 1, 100), z('a', '2026-02-01', 1, 300),
    z('b', '2026-01-01', 1, 100), z('b', '2026-02-01', 1, 100),
    z('alt', '2026-01-01', 1, 999),
  ])
  assert.equal(ks.length, 2)
  assert.equal(ks[0].assetId, 'a')
  assert.equal(ks[0].anteil, 75)
})

test('toggleAsset: alle -> eins -> mehrere -> wieder alle', () => {
  const alle = ['a', 'b', 'c']
  assert.equal(toggleAsset(new Set(), 'b', alle), 'b')
  assert.equal(toggleAsset(new Set(['b']), 'a', alle), 'a,b')
  assert.equal(toggleAsset(new Set(['a', 'b']), 'c', alle), undefined)
  assert.equal(toggleAsset(new Set(['b']), 'b', alle), undefined)
})
