import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMonate,
  fortschritt,
  istUeberfaellig,
  pruefeZahlung,
  restlaufzeitMonate,
  restNachLoeschen,
  restNachZahlung,
  restschuldVerlauf,
  restzinsen,
  schuldenKennzahlen,
  tageBis,
  zahlungsAnteile,
  zinsenProJahr,
  type SchuldDaten,
} from './berechnen.ts'

const schuld = (p: Partial<SchuldDaten>): SchuldDaten => ({
  id: 'x', type: 'borrowed', currency: 'EUR', original_amount: 1000, outstanding: 1000,
  interest_rate: null, monthly_payment: null, due_date: null, is_active: true, ...p,
})

test('Anteile: ohne Angabe ist alles Tilgung, ein Anteil ergänzt den anderen', () => {
  assert.deepEqual(zahlungsAnteile({ amount: 100, principal: null, interest: null }), { tilgung: 100, zinsen: 0 })
  assert.deepEqual(zahlungsAnteile({ amount: 100, principal: null, interest: 12.5 }), { tilgung: 87.5, zinsen: 12.5 })
  assert.deepEqual(zahlungsAnteile({ amount: 100, principal: 90, interest: null }), { tilgung: 90, zinsen: 10 })
  assert.deepEqual(zahlungsAnteile({ amount: 100, principal: 80, interest: 20 }), { tilgung: 80, zinsen: 20 })
})

test('Restschuld sinkt nur um die Tilgung, nie unter 0', () => {
  assert.equal(restNachZahlung(1000, { amount: 100, principal: null, interest: 20 }), 920)
  assert.equal(restNachZahlung(50, { amount: 80, principal: null, interest: null }), 0)
  assert.equal(restNachLoeschen(920, 1000, { amount: 100, principal: null, interest: 20 }), 1000)
  assert.equal(restNachLoeschen(990, 1000, { amount: 100, principal: null, interest: null }), 1000)
})

test('Zahlung prüfen: Summe, Vorzeichen, Überzahlung', () => {
  assert.equal(pruefeZahlung({ amount: 100, principal: null, interest: null }, 100), null)
  assert.match(pruefeZahlung({ amount: 100, principal: null, interest: null }, 99)!, /höher als die offene/)
  assert.match(pruefeZahlung({ amount: 100, principal: 70, interest: 20 }, 500)!, /zusammen den Betrag/)
  assert.match(pruefeZahlung({ amount: 100, principal: null, interest: 120 }, 500)!, /nicht mehr als der Betrag/)
  assert.match(pruefeZahlung({ amount: 0, principal: null, interest: null }, 500)!, /größer als 0/)
  // Zinsen dürfen über die Restschuld hinausgehen, nur die Tilgung zählt
  assert.equal(pruefeZahlung({ amount: 105, principal: null, interest: 5 }, 100), null)
})

test('Fortschritt: Grenzen und Rundung', () => {
  assert.deepEqual(fortschritt(1000, 250), { getilgt: 750, prozent: 75, anteil: 0.75 })
  assert.equal(fortschritt(1000, 1200).getilgt, 0)
  assert.equal(fortschritt(1000, -5).prozent, 100)
  assert.equal(fortschritt(0, 0).prozent, 0)
})

test('Überfällig: Fälligkeitstag selbst nicht, abgeschlossen nie', () => {
  assert.equal(istUeberfaellig('2026-10-25', '2026-10-26'), true)
  assert.equal(istUeberfaellig('2026-10-26', '2026-10-26'), false)
  assert.equal(istUeberfaellig('2026-10-25', '2026-10-26', false), false)
  assert.equal(istUeberfaellig(null, '2026-10-26'), false)
  assert.equal(tageBis('2026-11-01', '2026-10-26'), 6)
  assert.equal(tageBis('2026-10-20', '2026-10-26'), -6)
})

test('Monate addieren: Monatsende gekappt, Jahreswechsel', () => {
  assert.equal(addMonate('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonate('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonate('2026-11-15', 3), '2027-02-15')
  assert.equal(addMonate('2026-03-31', -1), '2026-02-28')
})

test('Restlaufzeit: ohne Zins, mit Zins, Rate zu klein, keine Rate', () => {
  assert.equal(restlaufzeitMonate(1000, null, 100), 10)
  assert.equal(restlaufzeitMonate(1050, 0, 100), 11)
  // 10.000 bei 6 % und 200 €/Monat: -ln(0,75)/ln(1,005) = 57,7 -> 58 Monate
  assert.equal(restlaufzeitMonate(10000, 6, 200), 58)
  assert.equal(restlaufzeitMonate(10000, 6, 40), null)
  assert.equal(restlaufzeitMonate(1000, 5, null), null)
  assert.equal(restlaufzeitMonate(0, 5, null), 0)
})

test('Zinsen: pro Jahr und über die Restlaufzeit', () => {
  assert.equal(zinsenProJahr(10000, 4.5), 450)
  assert.equal(zinsenProJahr(0, 4.5), 0)
  assert.equal(zinsenProJahr(500, null), 0)
  assert.equal(restzinsen(1000, null, 100), 0)
  const z = restzinsen(10000, 6, 200)!
  // Summe aller Raten ist Schuld + Zinsen: 57 volle Raten + kleine letzte
  assert.ok(z > 1400 && z < 1700)
  assert.equal(restzinsen(10000, 6, 40), null)
})

test('Verlauf: rückwärts aus dem Stand, Start vor der ersten Zahlung', () => {
  const v = restschuldVerlauf(
    700,
    [
      { amount: 100, principal: null, interest: null, payment_date: '2026-05-01' },
      { amount: 250, principal: null, interest: null, payment_date: '2026-03-01' },
      { amount: 50, principal: null, interest: null, payment_date: '2026-05-01' },
    ],
    '2026-01-10',
  )
  assert.deepEqual(v, [
    { datum: '2026-01-10', rest: 1100 },
    { datum: '2026-03-01', rest: 850 },
    { datum: '2026-05-01', rest: 700 },
  ])
  assert.deepEqual(restschuldVerlauf(500, [], '2026-01-01'), [])
})

test('Kennzahlen: Summen, Rate, Schuldenfrei, Fremdwährung, Überfälliges', () => {
  const k = schuldenKennzahlen(
    [
      schuld({ id: 'a', outstanding: 600, original_amount: 1000, monthly_payment: 100, interest_rate: 0 }),
      schuld({ id: 'b', outstanding: 200, original_amount: 200, monthly_payment: 50, interest_rate: 6, due_date: '2026-10-01' }),
      schuld({ id: 'c', type: 'lent', outstanding: 150, original_amount: 150 }),
      schuld({ id: 'd', outstanding: 0, original_amount: 300, is_active: false }),
      schuld({ id: 'e', currency: 'USD', outstanding: 99 }),
    ],
    '2026-10-26',
  )
  assert.equal(k.schulde, 800)
  assert.equal(k.geschuldet, 150)
  assert.equal(k.monatlicheLast, 150)
  assert.equal(k.mitRate, 2)
  assert.equal(k.zinsenProJahr, 12)
  assert.equal(k.getilgt, 700) // 400 von a, 0 von b, 300 von d
  assert.equal(k.urspruenglich, 1500)
  assert.equal(k.aktiv, 4)
  assert.equal(k.abgeschlossen, 1)
  assert.equal(k.fremdwaehrung, 1)
  assert.equal(k.ueberfaellig, 1)
  assert.equal(k.ohneEnde, 0)
  // a: 6 Monate, b: 200 bei 6 %/12 mit 50 -> 5 Monate
  assert.equal(k.schuldenfrei, '2027-04-26')
})

test('Kennzahlen: eine Schuld ohne Rate macht das Enddatum unbestimmt', () => {
  const k = schuldenKennzahlen(
    [schuld({ outstanding: 100, monthly_payment: 50 }), schuld({ id: 'z', outstanding: 500 })],
    '2026-10-26',
  )
  assert.equal(k.schuldenfrei, null)
  assert.equal(k.ohneEnde, 1)
})
