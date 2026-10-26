import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aktivesToken,
  gueltigeMentions,
  mentionLabelsAus,
  setzeMention,
  zerlegeMentions,
} from './mention-eingabe.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

test('Token: Textanfang, nach Leerzeichen und Zeilenumbruch; nicht mitten im Wort', () => {
  assert.deepEqual(aktivesToken('@dk', 3), { start: 0, ende: 3, suche: 'dk' })
  assert.deepEqual(aktivesToken('Wie viel auf @', 14), { start: 13, ende: 14, suche: '' })
  assert.deepEqual(aktivesToken('a\n@x', 4), { start: 2, ende: 4, suche: 'x' })
  assert.equal(aktivesToken('mail@dkb', 8), null)
  assert.equal(aktivesToken('@dkb fertig', 11), null)
  assert.equal(aktivesToken('hallo', 5), null)
  assert.equal(aktivesToken('', 0), null)
})

test('Token: nur links vom Cursor zählt', () => {
  assert.deepEqual(aktivesToken('@dkb rest', 2), { start: 0, ende: 2, suche: 'd' })
})

test('Einsetzen ersetzt das Token und setzt den Cursor hinter das Leerzeichen', () => {
  const t = aktivesToken('Zeig @dk', 8)!
  assert.deepEqual(setzeMention('Zeig @dk', t, 'DKB Giro'), { text: 'Zeig @DKB Giro ', cursor: 15 })
  const mitte = aktivesToken('Zeig @dk bitte', 8)!
  assert.deepEqual(setzeMention('Zeig @dk bitte', mitte, 'DKB'), { text: 'Zeig @DKB bitte', cursor: 10 })
})

test('Gültige Bezüge: nur solche, deren Label noch im Text steht', () => {
  const gewaehlt = [
    { typ: 'konto' as const, id: ID, label: 'DKB Giro' },
    { typ: 'depot' as const, id: ID2, label: 'MSCI World' },
  ]
  assert.deepEqual(gueltigeMentions('Wie läuft @DKB Giro?', gewaehlt), [gewaehlt[0]])
  assert.deepEqual(gueltigeMentions('Wie läuft DKB Giro?', gewaehlt), [])
  // Teilwort zählt nicht: Label wurde nachträglich verlängert.
  assert.deepEqual(gueltigeMentions('@DKB Girokonto', gewaehlt), [])
  // Doppelt gewählt, einmal gesendet.
  assert.equal(gueltigeMentions('@DKB Giro', [gewaehlt[0], gewaehlt[0]]).length, 1)
})

test('Zerlegen: Label mit Leerzeichen, Satzzeichen danach, mehrere Bezüge', () => {
  assert.deepEqual(zerlegeMentions('Wie viel auf @Girokonto DKB, und @Miete?', ['Girokonto DKB', 'Miete']), [
    { text: 'Wie viel auf ', mention: false },
    { text: '@Girokonto DKB', mention: true },
    { text: ', und ', mention: false },
    { text: '@Miete', mention: true },
    { text: '?', mention: false },
  ])
})

test('Zerlegen: Wortgrenze, E-Mail und fehlende Labels bleiben Text; Überlappung -> längerer', () => {
  assert.deepEqual(zerlegeMentions('mail@Miete und @Miete2', ['Miete']), [{ text: 'mail@Miete und @Miete2', mention: false }])
  assert.deepEqual(zerlegeMentions('hallo', []), [{ text: 'hallo', mention: false }])
  assert.deepEqual(zerlegeMentions('@Konto Zwei', ['Konto', 'Konto Zwei']), [{ text: '@Konto Zwei', mention: true }])
})

test('Metadaten: nur Strings aus athena.mentions', () => {
  assert.deepEqual(mentionLabelsAus({ athena: { mentions: ['A', 3, '', 'B'] } }), ['A', 'B'])
  assert.deepEqual(
    mentionLabelsAus({ athena: { mentions: [{ typ: 'konto', id: 'x', label: 'DKB' }, { typ: 'konto' }, 'Alt'] } }),
    ['DKB', 'Alt'],
  )
  assert.deepEqual(mentionLabelsAus(undefined), [])
  assert.deepEqual(mentionLabelsAus({ athena: { mentions: 'x' } }), [])
  assert.deepEqual(mentionLabelsAus({ anthropic: {} }), [])
})
