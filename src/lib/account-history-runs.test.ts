import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandiereLaeufe, tageVonBis, type BalanceRun } from './account-history-runs.ts'

test('Tage von..bis: inklusive, über Monats-, Jahres- und Schaltjahrgrenzen, Sommerzeit egal', () => {
  assert.deepEqual(tageVonBis('2026-03-30', '2026-04-02'), ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02'])
  assert.deepEqual(tageVonBis('2023-12-31', '2024-01-01'), ['2023-12-31', '2024-01-01'])
  assert.deepEqual(tageVonBis('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01'])
  assert.equal(tageVonBis('2026-03-28', '2026-03-30').length, 3) // Zeitumstellung 29.03.2026
  assert.deepEqual(tageVonBis('2026-05-05', '2026-05-05'), ['2026-05-05'])
  assert.deepEqual(tageVonBis('2026-05-06', '2026-05-05'), [])
  assert.deepEqual(tageVonBis('kaputt', '2026-05-05'), [])
})

test('Läufe werden zu den ursprünglichen Tageszeilen: Datum aufsteigend, dann Konto', () => {
  const laeufe: BalanceRun[] = [
    { account_id: 'a', von: '2026-01-01', bis: '2026-01-03', balance: 100 },
    { account_id: 'a', von: '2026-01-04', bis: '2026-01-04', balance: 120.5 },
    { account_id: 'b', von: '2026-01-02', bis: '2026-01-04', balance: 7 },
  ]
  assert.deepEqual(expandiereLaeufe(laeufe).map(r => `${r.snapshot_date} ${r.account_id} ${r.balance}`), [
    '2026-01-01 a 100',
    '2026-01-02 a 100',
    '2026-01-02 b 7',
    '2026-01-03 a 100',
    '2026-01-03 b 7',
    '2026-01-04 a 120.5',
    '2026-01-04 b 7',
  ])
})

test('Eine Lücke bleibt eine Lücke: zwei Läufe mit Abstand ergeben keine Zwischentage', () => {
  const r = expandiereLaeufe([
    { account_id: 'a', von: '2026-01-01', bis: '2026-01-01', balance: 1 },
    { account_id: 'a', von: '2026-01-05', bis: '2026-01-05', balance: 1 },
  ])
  assert.deepEqual(r.map(x => x.snapshot_date), ['2026-01-01', '2026-01-05'])
})

test('Leere Eingabe, negative Stände und Nullstand bleiben erhalten', () => {
  assert.deepEqual(expandiereLaeufe([]), [])
  const r = expandiereLaeufe([{ account_id: 'a', von: '2026-01-01', bis: '2026-01-02', balance: -50.25 }, { account_id: 'a', von: '2026-01-03', bis: '2026-01-03', balance: 0 }])
  assert.deepEqual(r.map(x => x.balance), [-50.25, -50.25, 0])
})
