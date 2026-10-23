import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregiere, mitDelta, kennzahlen, luecken, auffaelligkeiten,
  meilensteine, addMonate, wochenStart,
} from './networth.ts'
import type { NetWorthPunkt } from './types.ts'

function p(datum: string, nw: number, schulden = 0): NetWorthPunkt {
  return {
    datum, net_worth: nw, total_assets: nw + schulden, total_checking: nw + schulden, total_investment: 0,
    total_savings: 0, total_cash: 0, total_depot: 0, total_crypto: 0, total_bausparer: 0,
    total_business: 0, total_debts: schulden,
  }
}

test('Wochen laufen von Montag, Monate nach YYYY-MM, letzter Snapshot gewinnt', () => {
  // 2026-04-05 ist ein Sonntag, 2026-04-06 ein Montag.
  assert.equal(wochenStart('2026-04-05'), '2026-03-30')
  assert.equal(wochenStart('2026-04-06'), '2026-04-06')
  const punkte = [p('2026-04-03', 1), p('2026-04-05', 2), p('2026-04-06', 3), p('2026-05-01', 4)]
  assert.deepEqual(aggregiere(punkte, 'woche').map(x => x.datum), ['2026-04-05', '2026-04-06', '2026-05-01'])
  assert.deepEqual(aggregiere(punkte, 'monat').map(x => x.net_worth), [3, 4])
  assert.equal(aggregiere(punkte, 'tag').length, 4)
})

test('Aggregation sortiert unsortierte Eingabe', () => {
  const r = aggregiere([p('2026-04-10', 2), p('2026-04-01', 1)], 'monat')
  assert.equal(r[0].net_worth, 2)
})

test('mitDelta: erstes null, danach Betrag und Prozent', () => {
  const r = mitDelta([p('2026-01-01', 100), p('2026-01-02', 110), p('2026-01-03', 99)])
  assert.equal(r[0].delta, null)
  assert.equal(r[1].delta, 10)
  assert.equal(r[1].deltaProzent, 10)
  assert.equal(r[2].delta, -11)
  assert.equal(r[2].deltaProzent, -10)
  assert.equal(mitDelta([p('a', 0), p('b', 5)])[1].deltaProzent, null)
})

test('addMonate kappt aufs Monatsende', () => {
  assert.equal(addMonate('2026-03-31', -1), '2026-02-28')
  assert.equal(addMonate('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonate('2026-11-15', 3), '2027-02-15')
})

test('kennzahlen: Deltas, Hoch, fehlende Referenz', () => {
  const punkte = [p('2025-12-30', 80), p('2026-03-10', 120), p('2026-09-20', 150), p('2026-10-20', 130, 7)]
  const k = kennzahlen(punkte, '2026-10-23')
  assert.equal(k.aktuell?.net_worth, 130)
  assert.equal(k.schulden, 7)
  assert.equal(k.monat1?.referenz, '2026-09-20')
  assert.equal(k.monat1?.betrag, -20)
  assert.equal(k.monate3?.referenz, '2026-03-10')
  assert.equal(k.ytd?.referenz, '2025-12-30')
  assert.equal(k.ytd?.betrag, 50)
  assert.equal(k.monate12, null) // Historie beginnt erst am 30.12.2025
  assert.deepEqual(k.hoch, { datum: '2026-09-20', wert: 150 })
  assert.equal(k.abstandHoch?.betrag, -20)
  assert.ok(Math.abs((k.abstandHoch?.prozent ?? 0) + 13.333) < 0.01)
})

test('kennzahlen: leere Liste', () => {
  const k = kennzahlen([], '2026-10-23')
  assert.equal(k.aktuell, null)
  assert.equal(k.hoch, null)
})

test('luecken: fehlende Tage als Bereiche', () => {
  const l = luecken([p('2026-04-10', 1), p('2026-04-11', 1), p('2026-04-15', 1), p('2026-04-17', 1)])
  assert.deepEqual(l, [
    { von: '2026-04-12', bis: '2026-04-14', tage: 3 },
    { von: '2026-04-16', bis: '2026-04-16', tage: 1 },
  ])
  assert.deepEqual(luecken([p('2026-04-10', 1)]), [])
})

test('auffaelligkeiten: Null und Sprung > 30 %', () => {
  const a = auffaelligkeiten([p('2026-04-01', 100), p('2026-04-02', 0), p('2026-04-03', 100), p('2026-04-04', 131), p('2026-04-05', 140)])
  assert.deepEqual(a.map(x => [x.datum, x.grund]), [['2026-04-02', 'null'], ['2026-04-04', 'sprung']])
  // genau 30 % ist noch kein Sprung
  assert.equal(auffaelligkeiten([p('2026-04-01', 100), p('2026-04-02', 130)]).length, 0)
})

test('meilensteine: nächste runde Schwellen über dem Stand, max 2', () => {
  assert.deepEqual(meilensteine(8000), [10_000, 25_000])
  assert.deepEqual(meilensteine(10_000), [25_000, 50_000])
  assert.deepEqual(meilensteine(120_000), [250_000, 500_000])
  assert.deepEqual(meilensteine(-500), [1000, 2500])
})
