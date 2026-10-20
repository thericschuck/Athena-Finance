import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import {
  uuid, idField, isoDate, money, moneyField, optMoneyField, intField, optIntField,
  reqText, optText, optUuid, optDate, reqDate, checkbox, boolTrue, currency, reqEnum, optEnum,
} from './schemas.ts'
import { parseForm, parseInput, formDataToObject, issueMessage } from './parse.ts'

const UUID = '3f2b8c1e-9d4a-4e6f-8a1b-2c3d4e5f6a7b'

function fd(entries: Record<string, string | string[]>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x)
  }
  return f
}

test('uuid und idField', () => {
  assert.equal(parseInput(uuid, UUID).ok, true)
  assert.equal(parseInput(uuid, 'nicht-eine-uuid').ok, false)
  const missing = parseInput(idField(), undefined)
  assert.ok(!missing.ok && missing.issues[0].message === 'ID fehlt')
  const empty = parseInput(idField(), '')
  assert.ok(!empty.ok && empty.issues[0].message === 'ID fehlt')
  const bad = parseInput(idField(), 'xyz')
  assert.ok(!bad.ok && bad.issues[0].message === 'ID ist ungültig')
  assert.equal(parseInput(idField(), UUID).ok, true)
})

test('isoDate: Format und Kalendergültigkeit', () => {
  assert.equal(parseInput(isoDate, '2026-02-28').ok, true)
  assert.equal(parseInput(isoDate, '2024-02-29').ok, true)
  assert.equal(parseInput(isoDate, '2026-02-31').ok, false)
  assert.equal(parseInput(isoDate, '2026-13-01').ok, false)
  assert.equal(parseInput(isoDate, '31.12.2026').ok, false)
  assert.equal(parseInput(isoDate, '2026-1-1').ok, false)
  assert.equal(parseInput(isoDate, 20260101).ok, false)
})

test('reqDate: fehlt vs. ungültig', () => {
  const missing = parseInput(reqDate(), undefined)
  assert.ok(!missing.ok && missing.issues[0].message === 'Datum ist erforderlich')
  const empty = parseInput(reqDate(), '')
  assert.ok(!empty.ok && empty.issues[0].message === 'Datum ist erforderlich')
  const bad = parseInput(reqDate(), '2026-99-99')
  assert.ok(!bad.ok && bad.issues[0].message === 'Datum ist ungültig')
})

test('money (JSON-Zahl): endlich und begrenzt', () => {
  assert.equal(parseInput(money, -12.5).ok, true)
  assert.equal(parseInput(money, 0).ok, true)
  assert.equal(parseInput(money, Infinity).ok, false)
  assert.equal(parseInput(money, NaN).ok, false)
  assert.equal(parseInput(money, 1e13).ok, false)
  assert.equal(parseInput(money, '5').ok, false)
})

test('moneyField: Strings, Komma, leer, Müll', () => {
  const s = moneyField()
  assert.deepEqual(parseInput(s, '12.5'), { ok: true, data: 12.5 })
  assert.deepEqual(parseInput(s, ' -3 '), { ok: true, data: -3 })
  assert.deepEqual(parseInput(s, '12,5'), { ok: true, data: 12.5 })
  assert.deepEqual(parseInput(s, '0'), { ok: true, data: 0 })
  for (const bad of ['', '  ', 'abc', '1e999', 'Infinity', '1.234,56', undefined, '1e13']) {
    assert.equal(parseInput(s, bad).ok, false, `sollte abgelehnt werden: ${String(bad)}`)
  }
  const r = parseInput(moneyField('Preis ungültig'), 'x')
  assert.ok(!r.ok && r.issues[0].message === 'Preis ungültig')
})

test('optMoneyField / optIntField: leer wird null', () => {
  assert.deepEqual(parseInput(optMoneyField(), ''), { ok: true, data: null })
  assert.deepEqual(parseInput(optMoneyField(), undefined), { ok: true, data: null })
  assert.deepEqual(parseInput(optMoneyField(), '4.2'), { ok: true, data: 4.2 })
  assert.equal(parseInput(optMoneyField(), 'x').ok, false)
  assert.deepEqual(parseInput(optIntField(), ''), { ok: true, data: null })
  assert.deepEqual(parseInput(optIntField(), '15'), { ok: true, data: 15 })
  assert.equal(parseInput(optIntField(), '1.5').ok, false)
})

test('intField', () => {
  assert.deepEqual(parseInput(intField(), '7'), { ok: true, data: 7 })
  assert.equal(parseInput(intField(), '7.1').ok, false)
  assert.equal(parseInput(intField(), '').ok, false)
})

test('reqText und optText', () => {
  const r = reqText('Name ist erforderlich', 5)
  assert.deepEqual(parseInput(r, '  Ab  '), { ok: true, data: 'Ab' })
  const empty = parseInput(r, '   ')
  assert.ok(!empty.ok && empty.issues[0].message === 'Name ist erforderlich')
  const missing = parseInput(r, undefined)
  assert.ok(!missing.ok && missing.issues[0].message === 'Name ist erforderlich')
  assert.equal(parseInput(r, 'sechs!').ok, false)

  const o = optText(5)
  assert.deepEqual(parseInput(o, ''), { ok: true, data: null })
  assert.deepEqual(parseInput(o, undefined), { ok: true, data: null })
  assert.deepEqual(parseInput(o, ' x '), { ok: true, data: 'x' })
  assert.equal(parseInput(o, 'zu lang!').ok, false)
})

test('optUuid / optDate: leer wird null, sonst geprüft', () => {
  assert.deepEqual(parseInput(optUuid(), ''), { ok: true, data: null })
  assert.deepEqual(parseInput(optUuid(), UUID), { ok: true, data: UUID })
  assert.equal(parseInput(optUuid(), 'abc').ok, false)
  assert.deepEqual(parseInput(optDate, ''), { ok: true, data: null })
  assert.deepEqual(parseInput(optDate, '2026-01-31'), { ok: true, data: '2026-01-31' })
  assert.equal(parseInput(optDate, '2026-02-30').ok, false)
})

test('checkbox, boolTrue, currency, Enums', () => {
  assert.equal(parseInput(checkbox, 'on').ok && (parseInput(checkbox, 'on') as { data: boolean }).data, true)
  assert.deepEqual(parseInput(checkbox, undefined), { ok: true, data: false })
  assert.deepEqual(parseInput(checkbox, 'true'), { ok: true, data: true })
  assert.deepEqual(parseInput(boolTrue, 'on'), { ok: true, data: false })
  assert.deepEqual(parseInput(boolTrue, 'true'), { ok: true, data: true })

  assert.deepEqual(parseInput(currency, ' EUR '), { ok: true, data: 'EUR' })
  assert.equal(parseInput(currency, '').ok, false)
  assert.equal(parseInput(currency, 'ABCDEFGHIJK').ok, false)

  const e = reqEnum(['a', 'b'] as const, 'Typ ist erforderlich')
  assert.equal(parseInput(e, 'a').ok, true)
  const bad = parseInput(e, 'c')
  assert.ok(!bad.ok && bad.issues[0].message === 'Typ ist erforderlich')
  const oe = optEnum(['hoch', 'mittel'] as const, 'Priorität ist ungültig')
  assert.deepEqual(parseInput(oe, ''), { ok: true, data: null })
  assert.deepEqual(parseInput(oe, 'hoch'), { ok: true, data: 'hoch' })
  assert.equal(parseInput(oe, 'x').ok, false)
})

test('parseForm: FormData, Mehrfachwerte, issueMessage', () => {
  const schema = z.object({
    name: reqText('Name ist erforderlich'),
    amount: moneyField(),
    ids: z.preprocess(v => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(uuid)),
  })
  const ok = parseForm(fd({ name: ' A ', amount: '1,5', ids: [UUID, UUID] }), schema)
  assert.deepEqual(ok, { ok: true, data: { name: 'A', amount: 1.5, ids: [UUID, UUID] } })
  const single = parseForm(fd({ name: 'A', amount: '1', ids: UUID }), schema)
  assert.ok(single.ok && single.data.ids.length === 1)
  const none = parseForm(fd({ name: 'A', amount: '1' }), schema)
  assert.ok(none.ok && none.data.ids.length === 0)

  const bad = parseForm(fd({ name: '', amount: '1' }), schema)
  assert.ok(!bad.ok)
  if (!bad.ok) {
    assert.equal(issueMessage(bad), 'Name ist erforderlich')
    assert.match(bad.error, /^Ungültige Eingabe \(name\): /)
    assert.equal(bad.issues[0].path, 'name')
  }
})

test('deutsche Standardmeldungen nur pro Aufruf', () => {
  const r = parseInput(z.object({ n: z.number() }), { n: 'x' })
  assert.ok(!r.ok && /Zahl|number/i.test(r.issues[0].message))
  // außerhalb von parseInput bleibt zod englisch
  const plain = z.string().safeParse(1)
  assert.ok(!plain.success && /string/i.test(plain.error.issues[0].message))
})

test('formDataToObject', () => {
  const o = formDataToObject(fd({ a: '1', b: ['x', 'y'], c: '' }))
  assert.deepEqual(o, { a: '1', b: ['x', 'y'], c: '' })
})
