import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bewegungsMonate, bewegungSumme, type BewegungFlow, type BewegungSnapshot } from './bewegung.ts'

const snap = (datum: string, nw: number, depot = 0, crypto = 0): BewegungSnapshot =>
  ({ datum, net_worth: nw, total_depot: depot, total_crypto: crypto })
const flow = (month: string, ei: number, ee: number, ai = 0, ae = 0): BewegungFlow =>
  ({ month, echt_income: ei, echt_expense: ee, anlage_income: ai, anlage_expense: ae })

test('erster Monat fehlt, Rest = Delta minus gespart', () => {
  const m = bewegungsMonate(
    [snap('2026-03-10', 1000), snap('2026-03-31', 1100), snap('2026-04-30', 1500)],
    [flow('2026-03-01', 500, 400), flow('2026-04-01', 2000, 1700)],
  )
  assert.equal(m.length, 1)
  assert.equal(m[0].delta, 400)
  assert.equal(m[0].gespart, 300)
  assert.equal(m[0].markt, 100)
})

test('Einzahlung ins Depot ist weder gespart noch Markt', () => {
  const m = bewegungsMonate(
    [snap('2026-03-31', 1000, 0), snap('2026-04-30', 1010, 510)],
    [flow('2026-04-01', 0, 0, 0, 500)],
  )
  assert.equal(m[0].gespart, 0)
  assert.equal(m[0].markt, 10)
  assert.equal(m[0].marktAnlagen, 10)
  assert.equal(m[0].marktSonstiges, 0)
})

test('Monat ohne Snapshot erbt den Stand, Summe der letzten n', () => {
  const m = bewegungsMonate(
    [snap('2026-01-31', 100), snap('2026-03-31', 400)],
    [],
  )
  assert.deepEqual(m.map(x => x.delta), [0, 300])
  assert.equal(bewegungSumme(m, 1).delta, 300)
  assert.equal(bewegungSumme(m, null).monate, 2)
})
