import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liquiditaetIn, liquiditaetIst, naechsterTermin, veraenderungNachTagen } from './kennzahlen.ts'

test('liquiditaetIst: nur Giro, Spar und Bargeld', () => {
  assert.equal(liquiditaetIst([
    { type: 'checking', saldo: 100 }, { type: 'savings', saldo: 50 }, { type: 'cash', saldo: 5 },
    { type: 'crypto', saldo: 999 }, { type: 'bausparer', saldo: 1000 },
  ]), 155)
  assert.equal(liquiditaetIst([]), 0)
})

test('veraenderungNachTagen: Referenz am Stichtag, Prozent auf den Ausgangswert', () => {
  const p = [
    { datum: '2026-09-23', net_worth: 1000 },
    { datum: '2026-10-10', net_worth: 1050 },
    { datum: '2026-10-23', net_worth: 1100 },
  ]
  const d = veraenderungNachTagen(p, '2026-10-23', 30)
  assert.equal(d?.betrag, 100)
  assert.equal(d?.referenz, '2026-09-23')
  assert.equal(Math.round(d?.prozent ?? 0), 10)
})

test('veraenderungNachTagen: zu wenig Historie oder Luecke gibt null', () => {
  assert.equal(veraenderungNachTagen([{ datum: '2026-10-23', net_worth: 1 }], '2026-10-23', 30), null)
  // Aeltester Snapshot erst 10 Tage alt: kein Stand vor dem Stichtag.
  assert.equal(veraenderungNachTagen([
    { datum: '2026-10-13', net_worth: 1 }, { datum: '2026-10-23', net_worth: 2 },
  ], '2026-10-23', 30), null)
  // Referenz 20 Tage vor dem Stichtag: zu weit weg.
  assert.equal(veraenderungNachTagen([
    { datum: '2026-08-04', net_worth: 1 }, { datum: '2026-10-23', net_worth: 2 },
  ], '2026-10-23', 30), null)
})

test('veraenderungNachTagen: Ausgangswert 0 gibt keinen Prozentwert', () => {
  const d = veraenderungNachTagen([
    { datum: '2026-09-23', net_worth: 0 }, { datum: '2026-10-23', net_worth: 50 },
  ], '2026-10-23', 30)
  assert.equal(d?.betrag, 50)
  assert.equal(d?.prozent, null)
})

test('liquiditaetIn: letzter Prognosetag bis zum Ziel, sonst null', () => {
  const tage = [
    { datum: '2026-11-21', liquiditaet: 1, liquiditaetUnten: 0, liquiditaetOben: 2 },
    { datum: '2026-11-22', liquiditaet: 5, liquiditaetUnten: 3, liquiditaetOben: 8 },
    { datum: '2026-11-23', liquiditaet: 6, liquiditaetUnten: 4, liquiditaetOben: 9 },
    { datum: '2026-11-24', liquiditaet: 7, liquiditaetUnten: 5, liquiditaetOben: 10 },
  ]
  assert.equal(liquiditaetIn(tage, '2026-10-23', 30)?.wert, 5)
  assert.equal(liquiditaetIn(tage.slice(0, 1), '2026-10-23', 30)?.wert, 1)
  assert.equal(liquiditaetIn([], '2026-10-23', 30), null)
  assert.equal(liquiditaetIn(tage, '2026-09-01', 30), null)
})

test('naechsterTermin: fruehester ab heute, sonst Kuendigungsfrist', () => {
  const t = naechsterTermin([
    { datum: '2026-10-22', name: 'gestern', betrag: -1 },
    { datum: '2026-10-28', name: 'Miete', betrag: -800 },
    { datum: '2026-10-25', name: 'Strom', betrag: -50 },
  ], [], '2026-10-23')
  assert.equal(t?.name, 'Strom')
  assert.equal(t?.tage, 2)
  const k = naechsterTermin(null, [{ name: 'A', days: 9 }, { name: 'B', days: -2 }], '2026-10-23')
  assert.equal(k?.name, 'B')
  assert.equal(k?.art, 'kuendigung')
  assert.equal(k?.tage, -2)
  assert.equal(naechsterTermin([], [], '2026-10-23'), null)
})

test('naechsterTermin: eine fruehere Kuendigungsfrist schlaegt eine spaetere Zahlung', () => {
  const t = naechsterTermin(
    [{ datum: '2026-12-01', name: 'Miete', betrag: -800 }],
    [{ name: 'Netflix', days: 5 }],
    '2026-10-23',
  )
  assert.equal(t?.art, 'kuendigung')
  assert.equal(t?.name, 'Netflix')
  // Gleichstand: die Zahlung gewinnt.
  const g = naechsterTermin([{ datum: '2026-10-28', name: 'Miete', betrag: -800 }], [{ name: 'Netflix', days: 5 }], '2026-10-23')
  assert.equal(g?.art, 'zahlung')
})
