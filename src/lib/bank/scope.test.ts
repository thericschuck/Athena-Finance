import { test } from 'node:test'
import assert from 'node:assert/strict'
import { berechneScope } from './scope.ts'
import type { BankSeitenDaten } from './typen.ts'

const tx = (id: string, iban: string, datum: string) =>
  ({ id, account_iban: iban, value_date: datum, amount: -10 }) as unknown as BankSeitenDaten['transactions'][number]
const flow = (month: string, account_id: string | null) =>
  ({ flow_kind: 'echt', income: 0, expense: 10, month, account_id }) as BankSeitenDaten['flowRows'][number]

const basis = (extra: Partial<BankSeitenDaten> = {}): BankSeitenDaten => ({
  heute: '2026-10-23', locale: 'de-DE', dateFormat: 'dd.MM.yyyy',
  periode: '6M', cutoff: '2026-05-23', monat: null, konto: null, partei: null, kat: null,
  include: { anlage: true, forderung: true },
  balances: [{ account_iban: 'DE01 1234', account_id: 'a1' } as unknown as BankSeitenDaten['balances'][number]],
  transactions: [tx('1', 'DE011234', '2026-04-30'), tx('2', 'DE011234', '2026-06-10'), tx('3', 'DE99', '2026-06-11')],
  categories: [],
  flowRows: [flow('2026-04-01', 'a1'), flow('2026-05-01', 'a1'), flow('2026-06-01', 'a2'), flow('2026-11-01', 'a1')],
  eigeneIbans: ['DE011234'],
  ...extra,
})

test('Zeitraum: Buchungen ab Cutoff (Tag), Flows ab Cutoff-Monat, keine Zukunftsmonate', () => {
  const s = berechneScope(basis())
  assert.deepEqual(s.buchungen.map(t => t.id), ['2', '3'])
  assert.deepEqual(s.flows.map(f => f.month), ['2026-05-01', '2026-06-01'])
})

test('Konto: IBAN wird normalisiert, Flows laufen ueber die verknuepfte account_id', () => {
  const s = berechneScope(basis({ konto: 'DE01 1234' }))
  assert.deepEqual(s.buchungen.map(t => t.id), ['2'])
  assert.deepEqual(s.flows.map(f => f.month), ['2026-05-01'])
  assert.equal(s.kontoAccountId, 'a1')
})

test('Konto ohne verknuepfte account_id ergibt keine Flows statt aller', () => {
  const s = berechneScope(basis({ konto: 'DE99' }))
  assert.equal(s.flows.length, 0)
})

test('Monat filtert alles ausser den Ohne-Monat-Sichten; Liste ignoriert den Zeitraum', () => {
  const s = berechneScope(basis({ monat: '2026-04' }))
  assert.equal(s.buchungen.length, 0)
  assert.equal(s.buchungenOhneMonat.length, 2)
  assert.deepEqual(s.liste.map(t => t.id), ['1'])
})
