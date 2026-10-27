import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neuesLimit } from './rate-limit.ts'

test('Limit: max Versuche je Fenster, danach gesperrt, nach Ablauf frei', () => {
  const l = neuesLimit(3, 1000)
  assert.equal(l.erlaube('ip', 0), true)
  assert.equal(l.erlaube('ip', 1), true)
  assert.equal(l.erlaube('ip', 2), true)
  assert.equal(l.erlaube('ip', 3), false)
  assert.equal(l.erlaube('andere', 3), true)
  assert.equal(l.erlaube('ip', 1001), true)
})
