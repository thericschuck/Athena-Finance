import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtereSessions, gruppiereSessions } from './session-gruppen.ts'
import type { SessionSummary } from './sessions.ts'

function s(id: string, title: string | null, updatedAt: string, pinned = false): SessionSummary {
  return { id, title, pinned, updatedAt, messageCount: 2, projectId: null }
}

// Mittag lokaler Zeit, damit die Zeitzone des Testrechners keinen Tag verschiebt.
const jetzt = new Date(2026, 9, 26, 12, 0, 0)
const vor = (tage: number) => new Date(2026, 9, 26 - tage, 12, 0, 0).toISOString()

test('Gruppen: angeheftet zuerst, dann Heute/Gestern/Woche/Älter', () => {
  const gruppen = gruppiereSessions(
    [s('a', 'A', vor(0)), s('b', 'B', vor(1)), s('c', 'C', vor(3)), s('d', 'D', vor(9)), s('e', 'E', vor(20), true)],
    jetzt,
  )
  assert.deepEqual(gruppen.map((g) => g.key), ['angeheftet', 'heute', 'gestern', 'woche', 'aelter'])
  assert.deepEqual(gruppen.map((g) => g.sessions[0].id), ['e', 'a', 'b', 'c', 'd'])
})

test('Gruppen: Tag 6 ist noch Woche, Tag 7 schon Älter; leere Gruppen entfallen', () => {
  const gruppen = gruppiereSessions([s('a', 'A', vor(6)), s('b', 'B', vor(7))], jetzt)
  assert.deepEqual(gruppen.map((g) => g.key), ['woche', 'aelter'])
})

test('Suche: Titel, ohne Beachtung der Schreibweise; null-Titel heißt „Ohne Titel"', () => {
  const liste = [s('a', 'Steuer 2025', vor(0)), s('b', null, vor(0)), s('c', 'Depot', vor(0))]
  assert.deepEqual(filtereSessions(liste, 'STEU').map((x) => x.id), ['a'])
  assert.deepEqual(filtereSessions(liste, 'ohne').map((x) => x.id), ['b'])
  assert.equal(filtereSessions(liste, '  ').length, 3)
})
