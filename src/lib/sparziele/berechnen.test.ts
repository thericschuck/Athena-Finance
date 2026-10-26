import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonateTag, ampelVon, dauerText, erreichtAmDatum, kennzahlen, monateBisZiel, monateZwischenTage,
  noetigeRateBis, phaseVon, planAbweichung, prozent, restbetrag, sortiereOffene, ueberschuss,
  type ZielDaten,
} from './berechnen.ts'

function ziel(p: Partial<ZielDaten> = {}): ZielDaten {
  return {
    id: 'a', description: 'Reise', status: 'offen', priority: null, target_amount: 1000, current_amount: 0,
    target_date: null, monthly_savings_rate: null, savings_rate_start_date: null, ...p,
  }
}

test('Monate addieren: Monatsende wird gekappt, Jahreswechsel', () => {
  assert.equal(addMonateTag('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonateTag('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonateTag('2026-11-15', 3), '2027-02-15')
  assert.equal(addMonateTag('2026-03-31', -1), '2026-02-28')
})

test('Volle Monate zwischen Tagen', () => {
  assert.equal(monateZwischenTage('2026-01-15', '2026-03-14'), 1)
  assert.equal(monateZwischenTage('2026-01-15', '2026-03-15'), 2)
  assert.equal(monateZwischenTage('2026-01-31', '2026-02-28'), 1)
  assert.equal(monateZwischenTage('2026-05-01', '2026-04-01'), -1)
})

test('Prozent: nie 100 vor Erreichen, nie ueber 100, Ziel 0', () => {
  assert.equal(prozent(996, 1000), 99)
  assert.equal(prozent(1000, 1000), 100)
  assert.equal(prozent(2500, 1000), 100)
  assert.equal(prozent(-5, 1000), 0)
  assert.equal(prozent(5, 0), 0)
  assert.equal(restbetrag(1610, 4000), 2390)
  assert.equal(restbetrag(5000, 4000), 0)
  assert.equal(ueberschuss(4250.5, 4000), 250.5)
})

test('Phase: geschlossen ist nur bei vollem Betrag erreicht', () => {
  assert.equal(phaseVon({ status: 'offen', target_amount: 100, current_amount: 100 }), 'offen')
  assert.equal(phaseVon({ status: 'geschlossen', target_amount: 4000, current_amount: 1610 }), 'beendet')
  assert.equal(phaseVon({ status: 'geschlossen', target_amount: 100, current_amount: 100 }), 'erreicht')
})

test('Enddatum bei Rate: aufgerundet, ohne Rate null', () => {
  assert.equal(monateBisZiel(2390, 50), 48)
  assert.equal(monateBisZiel(100, 30), 4)
  assert.equal(monateBisZiel(100, null), null)
  assert.equal(monateBisZiel(0, null), 0)
  assert.equal(erreichtAmDatum('2026-10-26', 2390, 50), '2030-10-26')
  assert.equal(erreichtAmDatum('2026-01-31', 100, 100), '2026-02-28')
})

test('Noetige Rate bis zum Zieldatum', () => {
  assert.equal(noetigeRateBis('2026-10-26', 1200, '2027-10-26'), 100)
  // weniger als ein Monat: eine Zahlung
  assert.equal(noetigeRateBis('2026-10-26', 300, '2026-11-10'), 300)
  assert.equal(noetigeRateBis('2026-10-26', 300, '2026-10-01'), null)
  assert.equal(noetigeRateBis('2026-10-26', 0, '2027-01-01'), null)
  assert.equal(noetigeRateBis('2026-10-26', 100, null), null)
  assert.equal(noetigeRateBis('2026-10-26', 100, '2027-01-26'), 33.34)
})

test('Ampel: alle Stufen', () => {
  const h = '2026-10-26'
  assert.equal(ampelVon(ziel({ current_amount: 1000 }), h).stufe, 'erreicht')
  assert.equal(ampelVon(ziel({ current_amount: 400, target_date: '2026-12-26', monthly_savings_rate: 300 }), h).stufe, 'imPlan')
  // Rest 600, 2 Monate, Rate 250 -> 3 noetig = knapp (1 zu spaet)
  assert.equal(ampelVon(ziel({ current_amount: 400, target_date: '2026-12-26', monthly_savings_rate: 250 }), h).stufe, 'knapp')
  assert.equal(ampelVon(ziel({ current_amount: 400, target_date: '2026-12-26', monthly_savings_rate: 100 }), h).stufe, 'reichtNicht')
  assert.equal(ampelVon(ziel({ current_amount: 400, target_date: '2026-09-19', monthly_savings_rate: 100 }), h).stufe, 'ueberfaellig')
  assert.equal(ampelVon(ziel({ target_date: '2027-01-01' }), h).stufe, 'ohneRate')
  assert.equal(ampelVon(ziel({}), h).stufe, 'ohnePlan')
  assert.equal(ampelVon(ziel({ monthly_savings_rate: 100 }), h).stufe, 'laeuft')
  const a = ampelVon(ziel({ current_amount: 400, target_date: '2026-12-26', monthly_savings_rate: 100 }), h)
  assert.equal(a.noetigeRate, 300)
  assert.equal(a.erreichtAm, '2027-04-26')
})

test('Plan-Abweichung', () => {
  const z = ziel({ monthly_savings_rate: 50, savings_rate_start_date: '2026-07-15', current_amount: 120 })
  assert.equal(planAbweichung(z, '2026-10-26'), -30) // 3 Monate x 50 = 150
  assert.equal(planAbweichung({ ...z, savings_rate_start_date: null }, '2026-10-26'), null)
  assert.equal(planAbweichung({ ...z, savings_rate_start_date: '2027-01-01' }, '2026-10-26'), null)
})

test('Sortierung: Prioritaet, Zieldatum, Fortschritt', () => {
  const l = sortiereOffene([
    ziel({ id: 'n', priority: 'niedrig' }),
    ziel({ id: 'h2', priority: 'hoch', target_date: '2027-05-01' }),
    ziel({ id: 'h1', priority: 'hoch', target_date: '2026-12-01' }),
    ziel({ id: 'x' }),
  ])
  assert.deepEqual(l.map(z => z.id), ['h1', 'h2', 'n', 'x'])
})

test('Kennzahlen: offene Ziele, getrennte erreichte/beendete', () => {
  const h = '2026-10-26'
  const k = kennzahlen([
    ziel({ id: '1', target_amount: 1000, current_amount: 400, monthly_savings_rate: 100, target_date: '2027-03-01', description: 'A' }),
    ziel({ id: '2', target_amount: 500, current_amount: 500, description: 'B' }),
    ziel({ id: '3', target_amount: 4000, current_amount: 1610, status: 'geschlossen' }),
    ziel({ id: '4', target_amount: 200, current_amount: 200, status: 'geschlossen' }),
    ziel({ id: '5', target_amount: 300, current_amount: 0, monthly_savings_rate: 10, target_date: '2026-12-01', description: 'C' }),
  ], h)
  assert.equal(k.offen, 3)
  assert.equal(k.erreicht, 1)
  assert.equal(k.beendet, 1)
  assert.equal(k.gesamtziel, 1800)
  assert.equal(k.gespart, 900)
  assert.equal(k.rest, 900)
  assert.equal(k.rateGesamt, 110)
  assert.equal(k.vollOffen, 1)
  assert.equal(k.kritisch, 2)
  assert.deepEqual(k.naechstesDatum, { datum: '2026-12-01', name: 'C' })
})

test('Dauer-Text', () => {
  assert.equal(dauerText(5), '5 Mon.')
  assert.equal(dauerText(12), '1 J.')
  assert.equal(dauerText(48), '4 J.')
  assert.equal(dauerText(14), '1 J. 2 Mon.')
})
