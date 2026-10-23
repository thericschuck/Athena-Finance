import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aktuellesFenster, imFenster, monateInFenster, monatPlus, parseVergleich, vergleichBelastbar, vergleichsFenster,
  zusammenhaengenderBeginn,
} from './vergleich.ts'

test('parseVergleich: unbekannte Werte fallen auf die Vorperiode zurueck', () => {
  assert.equal(parseVergleich('vorjahr'), 'vorjahr')
  assert.equal(parseVergleich('aus'), 'aus')
  assert.equal(parseVergleich('quatsch'), 'vorperiode')
  assert.equal(parseVergleich(null), 'vorperiode')
})

test('monatPlus: ueber Jahresgrenzen', () => {
  assert.equal(monatPlus('2026-01-15', -1), '2025-12-01')
  assert.equal(monatPlus('2026-11-01', 3), '2027-02-01')
})

test('Aktuelles Fenster: ab Cutoff-Monat bis laufender Monat; Alles = null', () => {
  const f = aktuellesFenster('2026-07-23', '2026-10-23')
  assert.deepEqual(f, { von: '2026-07-01', bis: '2026-10-01' })
  assert.equal(monateInFenster(f!), 4)
  assert.equal(aktuellesFenster(null, '2026-10-23'), null)
})

test('Vorperiode: gleich viele Monate direkt davor', () => {
  const v = vergleichsFenster('3M', '2026-07-23', '2026-10-23', 'vorperiode')
  assert.deepEqual(v, { von: '2026-03-01', bis: '2026-06-01' })
  assert.equal(monateInFenster(v!), 4)
})

test('Vorjahr: dasselbe Fenster ein Jahr frueher', () => {
  assert.deepEqual(
    vergleichsFenster('6M', '2026-04-23', '2026-10-23', 'vorjahr'),
    { von: '2025-04-01', bis: '2025-10-01' },
  )
})

test('Kein Vergleich bei aus, Alles und einer Woche', () => {
  assert.equal(vergleichsFenster('3M', '2026-07-23', '2026-10-23', 'aus'), null)
  assert.equal(vergleichsFenster('Alles', null, '2026-10-23', 'vorperiode'), null)
  assert.equal(vergleichsFenster('1W', '2026-10-16', '2026-10-23', 'vorperiode'), null)
})

test('zusammenhaengenderBeginn: Streumonate weit davor zaehlen nicht', () => {
  const monate = ['2018-06-13', '2021-01-05', '2024-03-01', '2024-08-01', '2024-09-01', '2024-10-01', '2026-10-01']
  // Lücke 2024-10 -> 2026-10 ist zu gross: die zusammenhaengende Historie beginnt erst 2026-10.
  assert.equal(zusammenhaengenderBeginn(monate), '2026-10-01')
  const dicht = ['2024-08-01', '2024-09-01', '2024-11-01', '2024-12-01'] // eine Luecke von 1 Monat ist ok
  assert.equal(zusammenhaengenderBeginn(dicht), '2024-08-01')
  assert.equal(zusammenhaengenderBeginn([]), null)
})

test('imFenster und vergleichBelastbar', () => {
  const f = { von: '2026-03-01', bis: '2026-06-01' }
  assert.equal(imFenster('2026-03-31', f), true)
  assert.equal(imFenster('2026-07-01', f), false)
  assert.equal(imFenster('2026-07-01', null), true)
  // Historie beginnt erst im Maerz-Monatsmitte: Fenster ab 1.3. ist abgedeckt, ab 1.2. nicht.
  assert.equal(vergleichBelastbar(f, '2026-03-08'), true)
  assert.equal(vergleichBelastbar({ von: '2026-02-01', bis: '2026-05-01' }, '2026-03-08'), false)
  assert.equal(vergleichBelastbar(null, '2026-03-08'), false)
})
