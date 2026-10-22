import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PREIS_TTL_S, preisFetchOptionen } from './preis-cache.ts'

test('Ohne Angabe: kurzer Data Cache mit der Standard-TTL', () => {
  assert.deepEqual(preisFetchOptionen(), { next: { revalidate: PREIS_TTL_S } })
  assert.deepEqual(preisFetchOptionen({}), { next: { revalidate: PREIS_TTL_S } })
  assert.deepEqual(preisFetchOptionen({ fresh: false }), { next: { revalidate: PREIS_TTL_S } })
})

test('fresh: gar kein Cache (nie beides gleichzeitig, das ignoriert Next.js)', () => {
  const o = preisFetchOptionen({ fresh: true })
  assert.deepEqual(o, { cache: 'no-store' })
  assert.ok(!('next' in o))
})

test('TTL ist kurz genug für Kurse und lang genug, um Rate-Limits zu schonen', () => {
  assert.ok(PREIS_TTL_S >= 10 && PREIS_TTL_S <= 60)
})
