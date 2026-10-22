import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneKiBilanz, type KiZeile } from './ai-bilanz.ts'

const z = (category_id: string | null, category_source: string | null, ai_category_id: string | null): KiZeile => ({ category_id, category_source, ai_category_id })

test('Ohne KI-Zeilen: alles null, keine Quote', () => {
  assert.deepEqual(berechneKiBilanz([]), { bestaetigt: 0, korrigiert: 0, ungeprueft: 0, offeneVorschlaege: 0, stichprobe: 0, quote: null })
  assert.equal(berechneKiBilanz([z('a', 'manual', null), z(null, null, null)]).stichprobe, 0) // Zeilen ohne KI-Bezug zählen nicht
})

test('Bestätigt, korrigiert, ungeprüft und offener Vorschlag werden getrennt gezählt', () => {
  const b = berechneKiBilanz([
    z('a', 'manual', 'a'),   // Vorschlag übernommen
    z('a', 'manual', 'a'),
    z('a', 'manual', 'a'),
    z('b', 'manual', 'a'),   // korrigiert
    z('a', 'ai', 'a'),       // von der KI gesetzt, nicht angefasst
    z(null, null, 'a'),      // nur Vorschlag
  ])
  assert.deepEqual(b, { bestaetigt: 3, korrigiert: 1, ungeprueft: 1, offeneVorschlaege: 1, stichprobe: 4, quote: 75 })
})

test('Ungeprüfte KI-Zuordnungen zählen nicht als Treffer', () => {
  const b = berechneKiBilanz([z('a', 'ai', 'a'), z('a', 'ai', 'a')])
  assert.equal(b.quote, null)
  assert.equal(b.ungeprueft, 2)
})
