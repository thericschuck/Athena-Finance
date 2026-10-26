import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bereinigeMentions, filtereMentionOptionen, MAX_MENTIONS, type MentionOption } from './mentions.ts'

const A = '6e8ff680-f844-45b9-81a6-3f8cefc2aff3'
const B = '11111111-2222-3333-4444-555555555555'

test('Bereinigen: Typ, UUID, Label; Doppelte und Müll fallen heraus', () => {
  const aus = bereinigeMentions([
    { typ: 'konto', id: A, label: '  DKB\nGiro  ' },
    { typ: 'konto', id: A.toUpperCase(), label: 'doppelt' },
    { typ: 'unbekannt', id: B, label: 'x' },
    { typ: 'sparziel', id: 'keine-uuid', label: 'x' },
    null,
    'text',
    { typ: 'inventar', id: B },
  ])
  assert.deepEqual(aus, [
    { typ: 'konto', id: A, label: 'DKB Giro' },
    { typ: 'inventar', id: B, label: '' },
  ])
})

test('Bereinigen: kein Array -> leer; Obergrenze', () => {
  assert.deepEqual(bereinigeMentions(undefined), [])
  assert.deepEqual(bereinigeMentions({ typ: 'konto', id: A }), [])
  const viele = Array.from({ length: 30 }, (_, i) => ({
    typ: 'konto',
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    label: 'k',
  }))
  assert.equal(bereinigeMentions(viele).length, MAX_MENTIONS)
})

test('Filter: Label, Zweitzeile und Typname, Groß/Klein egal', () => {
  const opt: MentionOption[] = [
    { typ: 'konto', id: A, label: 'Girokonto', sub: 'DKB' },
    { typ: 'kategorie', id: B, label: 'Lebensmittel', sub: 'Ausgaben' },
  ]
  assert.deepEqual(filtereMentionOptionen(opt, 'dkb').map((o) => o.id), [A])
  assert.deepEqual(filtereMentionOptionen(opt, 'KATEGORIE').map((o) => o.id), [B])
  assert.equal(filtereMentionOptionen(opt, '').length, 2)
  assert.equal(filtereMentionOptionen(opt, 'nichts').length, 0)
})
