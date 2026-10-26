import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  artAusTyp,
  betragAusEingabe,
  betragFuerFeld,
  betragMitVorzeichen,
  heuteBerlin,
  kanonisch,
  pruefeBuchung,
  betragAusNutzereingabe,
  typUndBetrag,
} from './formular.ts'

test('Betrag lesen: deutsch und Maschinenformat', () => {
  assert.equal(betragAusEingabe('12,50'), 12.5)
  assert.equal(betragAusEingabe('1.234,56'), 1234.56)
  assert.equal(betragAusEingabe('1234.56'), 1234.56)
  assert.equal(betragAusEingabe(' -50 '), -50)
  assert.equal(betragAusEingabe('−50,5'), -50.5)
  assert.equal(betragAusEingabe('1.500'), 1.5, 'Maschinenformat gewinnt: der Browser sendet kanonisch')
  assert.equal(betragAusEingabe('abc'), null)
  assert.equal(betragAusEingabe(''), null)
  assert.equal(betragAusEingabe('1e5'), null)
})

test('Kanonischer Text ohne Exponent und Rundungsreste', () => {
  assert.equal(kanonisch(12.5), '12.5')
  assert.equal(kanonisch(100), '100')
  assert.equal(kanonisch(0.1 + 0.2), '0.3')
  assert.equal(kanonisch(0.00000001), '0.00000001')
  assert.equal(kanonisch(-0), '0')
  assert.equal(kanonisch(1.234), '1.234')
})

test('Betrag im Feld: Komma, mindestens zwei Stellen', () => {
  assert.equal(betragFuerFeld(12.5), '12,50')
  assert.equal(betragFuerFeld(-1234), '1234,00')
  assert.equal(betragFuerFeld(0.00012345), '0,00012345')
})

test('Vorzeichen kommt aus der Art, nicht aus der Eingabe', () => {
  assert.equal(betragMitVorzeichen('50', 'expense'), '-50')
  assert.equal(betragMitVorzeichen('-50', 'expense'), '-50')
  assert.equal(betragMitVorzeichen('50', 'income'), '50')
  assert.equal(betragMitVorzeichen('-50,5', 'income'), '50.5')
  assert.equal(betragMitVorzeichen('50', 'transfer'), '50')
  assert.equal(betragMitVorzeichen('x', 'expense'), null)
})

test('Typ und Betrag aus dem Wert der Action', () => {
  assert.deepEqual(typUndBetrag(-12.5, false), { type: 'expense', amount: 12.5 })
  assert.deepEqual(typUndBetrag(12.5, false), { type: 'income', amount: 12.5 })
  assert.deepEqual(typUndBetrag(-12.5, true), { type: 'transfer', amount: 12.5 })
  // Rundreise: Formular -> Action -> Typ
  const wert = Number(betragMitVorzeichen('1.234,56', 'expense'))
  assert.deepEqual(typUndBetrag(wert, false), { type: 'expense', amount: 1234.56 })
})

test('Art einer gespeicherten Buchung', () => {
  assert.equal(artAusTyp('expense'), 'expense')
  assert.equal(artAusTyp('transfer'), 'transfer')
  assert.equal(artAusTyp('income'), 'income')
  assert.equal(artAusTyp('anderes'), 'income')
})

test('Heute in Berliner Zeit statt UTC', () => {
  // 23:30 UTC am 25.10. ist 00:30 Berlin (MEZ) am 26.10.
  assert.equal(heuteBerlin(new Date('2026-10-25T23:30:00Z')), '2026-10-26')
  // Sommerzeit: 22:30 UTC am 15.07. ist 00:30 Berlin am 16.07.
  assert.equal(heuteBerlin(new Date('2026-07-15T22:30:00Z')), '2026-07-16')
  assert.equal(heuteBerlin(new Date('2026-07-15T12:00:00Z')), '2026-07-15')
})

test('Prüfung vor dem Senden', () => {
  const ok = { betragText: '12,50', art: 'expense', date: '2026-10-26', accountId: 'a', transferTo: '' } as const
  assert.equal(pruefeBuchung(ok), null)
  assert.match(pruefeBuchung({ ...ok, betragText: '' }) ?? '', /Betrag/)
  assert.match(pruefeBuchung({ ...ok, betragText: 'abc' }) ?? '', /ungültig/)
  assert.match(pruefeBuchung({ ...ok, betragText: '0' }) ?? '', /0/)
  assert.match(pruefeBuchung({ ...ok, date: '' }) ?? '', /Datum/)
  assert.match(pruefeBuchung({ ...ok, accountId: '' }) ?? '', /Konto/)
  assert.match(pruefeBuchung({ ...ok, art: 'transfer' }) ?? '', /Zielkonto/)
  assert.match(pruefeBuchung({ ...ok, art: 'transfer', transferTo: 'a' }) ?? '', /verschieden/)
  assert.equal(pruefeBuchung({ ...ok, art: 'transfer', transferTo: 'b' }), null)
})

test('Nutzereingabe: deutsche Schreibweise zuerst — „1.500“ sind 1500 €, nicht 1,50 €', () => {
  assert.equal(betragAusNutzereingabe('1.500'), 1500)
  assert.equal(betragAusNutzereingabe('12,5'), 12.5)
  assert.equal(betragAusNutzereingabe('1.234,56'), 1234.56)
  assert.equal(betragAusNutzereingabe('1234.56'), 1234.56)
  assert.equal(betragAusNutzereingabe('abc'), null)
  // zum Server geht der kanonische Wert, den `betragAusEingabe` eindeutig liest
  assert.equal(betragMitVorzeichen('1.500', 'expense'), '-1500')
  assert.equal(betragMitVorzeichen('1,234', 'income'), '1.234')
  assert.equal(betragAusEingabe(betragMitVorzeichen('1,234', 'income') ?? ''), 1.234)
})
