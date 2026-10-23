import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuehreZusammen, imFenster, kurzDatumTermin, relativDatum, summeFaellig } from './termine.ts'

const HEUTE = '2026-10-23'

test('fuehreZusammen: sortiert nach Datum, Zahlungen vor Fristen am selben Tag', () => {
  const z = fuehreZusammen(HEUTE, 14,
    [
      { datum: '2026-10-30', name: 'Miete', betrag: -900 },
      { datum: '2026-10-25', name: 'Strom', betrag: -60 },
    ],
    [{ id: 'a', name: 'Netflix', days: 7 }, { id: 'b', name: 'Gym', days: 2 }],
  )
  assert.deepEqual(z.map(x => x.name), ['Strom', 'Gym', 'Miete', 'Netflix'])
  assert.equal(z[0].tage, 2)
  assert.equal(z[3].datum, '2026-10-30')
  assert.equal(z[2].art, 'zahlung')   // am selben Tag zuerst die Zahlung
  assert.equal(z[3].art, 'kuendigung')
})

test('fuehreZusammen: Fenster, Vergangenes und Ueberfaelliges', () => {
  const z = fuehreZusammen(HEUTE, 14,
    [
      { datum: '2026-10-22', name: 'gestern', betrag: -1 },
      { datum: '2026-10-23', name: 'heute', betrag: -1 },
      { datum: '2026-11-06', name: 'letzter Tag', betrag: -1 },
      { datum: '2026-11-07', name: 'zu spaet', betrag: -1 },
    ],
    [{ id: 'x', name: 'alt', days: -3 }, { id: 'y', name: 'fern', days: 40 }],
  )
  assert.deepEqual(z.map(x => x.name), ['alt', 'heute', 'letzter Tag'])
  assert.equal(z[0].ueberfaellig, true)
  assert.equal(z[0].datum, '2026-10-20')
  assert.equal(z[1].ueberfaellig, false)
})

test('fuehreZusammen: ueber Monats- und Jahresgrenze', () => {
  const z = fuehreZusammen('2026-12-28', 14, [{ datum: '2027-01-05', name: 'Jan', betrag: -5 }], [])
  assert.equal(z[0].tage, 8)
})

test('imFenster: 30 Tage auf 14 zurueckschneiden', () => {
  const z = fuehreZusammen(HEUTE, 30,
    [{ datum: '2026-10-24', name: 'a', betrag: -1 }, { datum: '2026-11-15', name: 'b', betrag: -1 }], [])
  assert.equal(z.length, 2)
  assert.deepEqual(imFenster(z, 14).map(x => x.name), ['a'])
})

test('relativDatum', () => {
  assert.equal(relativDatum(0), 'Heute')
  assert.equal(relativDatum(1), 'Morgen')
  assert.equal(relativDatum(5), 'in 5 Tagen')
  assert.equal(relativDatum(-1), 'Gestern')
  assert.equal(relativDatum(-3), 'vor 3 Tagen')
})

test('summeFaellig: Ausgaben und Einnahmen getrennt, Fristen zaehlen nicht', () => {
  const z = fuehreZusammen(HEUTE, 14,
    [
      { datum: '2026-10-24', name: 'Miete', betrag: -1200.1 },
      { datum: '2026-10-25', name: 'Strom', betrag: -40 },
      { datum: '2026-10-26', name: 'Lohn', betrag: 3000 },
    ],
    [{ id: 'k', name: 'Netflix', days: 3 }],
  )
  assert.deepEqual(summeFaellig(z), { ausgaben: 1240.1, einnahmen: 3000 })
  assert.deepEqual(summeFaellig([]), { ausgaben: 0, einnahmen: 0 })
})

test('kurzDatumTermin', () => {
  assert.equal(kurzDatumTermin('2026-11-02'), '02.11.')
  assert.equal(kurzDatumTermin('2026-11-02', 'MM/dd/yyyy'), '11/02')
})
