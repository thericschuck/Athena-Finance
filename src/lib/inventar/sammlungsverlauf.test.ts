import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sammlungsverlauf, type VerlaufBewertung, type VerlaufStueck } from './sammlungsverlauf.ts'

const stueck = (id: string, extra: Partial<VerlaufStueck> = {}): VerlaufStueck => ({
  id, im_vermoegen: true, kaufpreis: null, gekauft_am: null, verkauft_am: null, ...extra,
})
const bew = (valuable_id: string, bewertet_am: string, wert: number): VerlaufBewertung => ({ valuable_id, bewertet_am, wert })

test('Summe nimmt je Stück die jüngste Bewertung bis zum Stichtag', () => {
  const p = sammlungsverlauf(
    [stueck('a'), stueck('b')],
    [bew('a', '2026-01-01', 100), bew('a', '2026-03-01', 80), bew('b', '2026-02-01', 50)],
    '2026-04-01',
  )
  assert.deepEqual(p.map(x => [x.datum, x.wert]), [
    ['2026-01-01', 100],
    ['2026-02-01', 150],
    ['2026-03-01', 130],
    ['2026-04-01', 130],
  ])
})

test('Stücke außerhalb der Summe zählen nicht', () => {
  const p = sammlungsverlauf(
    [stueck('a'), stueck('b', { im_vermoegen: false })],
    [bew('a', '2026-01-01', 100), bew('b', '2026-01-01', 999)],
    '2026-01-01',
  )
  assert.equal(p[0].wert, 100)
})

test('Verkaufte Stücke zählen nur vor dem Verkauf', () => {
  const p = sammlungsverlauf(
    [stueck('a', { verkauft_am: '2026-03-01' }), stueck('b')],
    [bew('a', '2026-01-01', 100), bew('b', '2026-01-01', 10)],
    '2026-04-01',
  )
  assert.equal(p.find(x => x.datum === '2026-02-01') ?? null, null)
  assert.equal(p[0].wert, 110)
  assert.equal(p[p.length - 1].wert, 10)
})

test('Zukünftige Bewertungen werden ignoriert, heute ist immer der letzte Punkt', () => {
  const p = sammlungsverlauf([stueck('a')], [bew('a', '2026-01-01', 100), bew('a', '2027-01-01', 5)], '2026-06-01')
  assert.equal(p[p.length - 1].datum, '2026-06-01')
  assert.equal(p[p.length - 1].wert, 100)
})

test('Eingekauft wächst mit dem Kaufdatum', () => {
  const p = sammlungsverlauf(
    [stueck('a', { kaufpreis: 80, gekauft_am: '2026-01-01' })],
    [bew('a', '2026-01-01', 80), bew('a', '2026-02-01', 70)],
    '2026-02-01',
  )
  assert.deepEqual(p.map(x => x.eingekauft), [80, 80])
})

test('Ohne jede Bewertung gibt es keine Punkte', () => {
  assert.deepEqual(sammlungsverlauf([stueck('a')], [], '2026-01-01'), [])
})
