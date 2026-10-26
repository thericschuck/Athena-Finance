import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruefTermin, pruefeVertrag, type AbgleichBuchung, type AbgleichVertrag } from './vertrag-abgleich.ts'

const vt = (extra: Partial<AbgleichVertrag> = {}): AbgleichVertrag => ({
  id: 'v1', name: 'Supabase', type: 'subscription', amount: 44, account_id: 'k1',
  frequency: 'monthly', billing_day: 24, start_date: '2026-05-26', end_date: null, auto_renews: true, is_active: true,
  ...extra,
})
const bu = (extra: Partial<AbgleichBuchung> = {}): AbgleichBuchung => ({
  id: 'b1', account_id: 'k1', date: '2026-10-24', amount: 44, type: 'expense', ...extra,
})

test('Termin ist der jüngste, der nicht in der Zukunft liegt', () => {
  assert.equal(pruefTermin(vt(), '2026-10-26'), '2026-10-24')
  assert.equal(pruefTermin(vt(), '2026-10-23'), '2026-09-24')
})

test('Ohne Konto, inaktiv oder als Umbuchung wird nicht geprüft', () => {
  assert.equal(pruefTermin(vt({ account_id: null }), '2026-10-26'), null)
  assert.equal(pruefTermin(vt({ is_active: false }), '2026-10-26'), null)
  assert.equal(pruefTermin(vt({ type: 'building_savings' }), '2026-10-26'), null)
  assert.equal(pruefeVertrag(vt({ type: 'savings_plan' }), [bu()], '2026-10-26'), null)
})

test('Passende Buchung: eingegangen, auch bei kleiner Betragsabweichung und Vorabbuchung', () => {
  const a = pruefeVertrag(vt(), [bu({ date: '2026-10-22', amount: 44.8 })], '2026-10-26')
  assert.deepEqual(a, { status: 'eingegangen', termin: '2026-10-24', buchungDatum: '2026-10-22', buchungId: 'b1' })
})

test('Keine Buchung, Karenzzeit läuft noch: erwartet; danach: offen', () => {
  assert.equal(pruefeVertrag(vt(), [], '2026-10-26')?.status, 'erwartet')
  assert.equal(pruefeVertrag(vt(), [], '2026-10-31')?.status, 'erwartet')
  assert.equal(pruefeVertrag(vt(), [], '2026-11-01')?.status, 'offen')
})

test('Falsches Konto, falscher Betrag, Einnahme oder zu fernes Datum zählen nicht', () => {
  const heute = '2026-11-05'
  assert.equal(pruefeVertrag(vt(), [bu({ account_id: 'k2' })], heute)?.status, 'offen')
  assert.equal(pruefeVertrag(vt(), [bu({ amount: 50 })], heute)?.status, 'offen')
  assert.equal(pruefeVertrag(vt(), [bu({ type: 'income' })], heute)?.status, 'offen')
  assert.equal(pruefeVertrag(vt(), [bu({ date: '2026-10-15' })], heute)?.status, 'offen')
})

test('Bei mehreren Kandidaten gewinnt die dem Termin nächste Buchung', () => {
  const a = pruefeVertrag(vt(), [bu({ id: 'weit', date: '2026-10-21' }), bu({ id: 'nah', date: '2026-10-25' })], '2026-10-26')
  assert.equal(a?.buchungId, 'nah')
})
