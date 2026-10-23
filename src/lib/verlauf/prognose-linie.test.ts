import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prognoseLinie } from './prognose-linie.ts'

const tag = (i: number) => ({
  datum: `2026-01-${String(i + 1).padStart(2, '0')}`,
  vermoegen: 1000 + i, vermoegenUnten: 900 + i, vermoegenOben: 1100 + i,
})
const tage = Array.from({ length: 20 }, (_, i) => tag(i))

test('Ein Punkt pro Woche plus letzter Tag', () => {
  const p = prognoseLinie(tage)
  assert.deepEqual(p.map(x => x.datum), ['2026-01-07', '2026-01-14', '2026-01-20'])
})

test('Bereich bleibt erhalten und umschliesst den Wert', () => {
  for (const p of prognoseLinie(tage)) {
    assert.ok((p.unten ?? 0) <= p.wert && p.wert <= (p.oben ?? 0))
  }
})

test('Leere Prognose gibt keine Punkte', () => {
  assert.deepEqual(prognoseLinie([]), [])
})
