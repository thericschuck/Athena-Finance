import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gegenparteien, parteiName, berechneKennzahlen, berechneMuster, veraenderungProzent, UNBEKANNT,
} from './auswertung.ts'
import { berechneScope } from './scope.ts'
import type { BankSeitenDaten } from './typen.ts'

type Tx = BankSeitenDaten['transactions'][number]
const tx = (p: Partial<Tx> & { amount: number; value_date: string }): Tx =>
  ({ id: Math.random().toString(), account_iban: 'DE01', counterpart_name: null, counterpart_iban: null,
     description: null, ...p }) as unknown as Tx
const flow = (month: string, income: number, expense: number, kind = 'echt') =>
  ({ flow_kind: kind, income, expense, month, account_id: null }) as BankSeitenDaten['flowRows'][number]

const basis = (extra: Partial<BankSeitenDaten> = {}): BankSeitenDaten => ({
  heute: '2026-10-23', locale: 'de-DE', dateFormat: 'dd.MM.yyyy',
  periode: '3M', cutoff: '2026-07-23', monat: null, konto: null, partei: null, kat: null,
  include: { anlage: true, forderung: true },
  balances: [{ account_iban: 'DE01', booked_balance: 100, account_id: null } as unknown as BankSeitenDaten['balances'][number],
             { account_iban: 'DE02', booked_balance: 50, account_id: null } as unknown as BankSeitenDaten['balances'][number]],
  transactions: [], categories: [], flowRows: [], eigeneIbans: ['DE01', 'DE02'],
  ...extra,
})

test('parteiName: Name, Fallback Verwendungszweck, Unbekannt', () => {
  assert.equal(parteiName({ counterpart_name: '  REWE   Markt ', description: 'x' }), 'REWE Markt')
  assert.equal(parteiName({ counterpart_name: null, description: 'Kartenzahlung  Aldi' }), 'Kartenzahlung Aldi')
  assert.equal(parteiName({ counterpart_name: ' ', description: null }), UNBEKANNT)
})

test('gegenparteien: normalisiert, ohne Umbuchungen, Top-N mit Weitere', () => {
  const b = [
    tx({ amount: -10, value_date: '2026-09-01', counterpart_name: 'Rewe' }),
    tx({ amount: -20, value_date: '2026-10-01', counterpart_name: 'REWE ' }),
    tx({ amount: -5, value_date: '2026-10-02', counterpart_name: 'Aldi' }),
    tx({ amount: -3, value_date: '2026-10-03', counterpart_name: 'Netto' }),
    tx({ amount: -500, value_date: '2026-10-04', counterpart_name: 'Eigen', counterpart_iban: 'de02' }),
    tx({ amount: 100, value_date: '2026-10-05', counterpart_name: 'Arbeitgeber' }),
  ]
  const a = gegenparteien(b, ['DE01', 'DE02'], 'ausgaben', 2)
  assert.deepEqual(a.zeilen.map(z => [z.schluessel, z.summe, z.anzahl]), [['rewe', 30, 2], ['aldi', 5, 1]])
  assert.equal(a.gesamt, 38)
  assert.equal(a.weitere?.anzahlParteien, 1)
  assert.equal(a.weitere?.summe, 3)
  assert.equal(a.zeilen[0].monate['2026-10'], 20)
  const e = gegenparteien(b, ['DE01', 'DE02'], 'einnahmen')
  assert.deepEqual(e.zeilen.map(z => z.name), ['Arbeitgeber'])
  assert.equal(e.weitere, null)
})

test('Kennzahlen: Saldo, Flows, Sparquote nur Konsum, groesste Buchungen ohne Umbuchung', () => {
  const d = basis({
    transactions: [
      tx({ amount: -40, value_date: '2026-10-01' }),
      tx({ amount: -900, value_date: '2026-10-02', counterpart_iban: 'DE02' }),
      tx({ amount: 300, value_date: '2026-10-03' }),
    ],
    flowRows: [flow('2026-08-01', 1000, 500), flow('2026-09-01', 1000, 400), flow('2026-10-01', 2000, 1000), flow('2026-10-01', 0, 500, 'anlage')],
  })
  const k = berechneKennzahlen(d, berechneScope(d))
  assert.equal(k.saldo, 150)
  assert.equal(k.einnahmen, 2000 + 1000 + 1000)
  assert.equal(k.ausgaben, 500 + 400 + 1000 + 500)
  assert.equal(k.sparquote, Math.round(((4000 - 1900) / 4000) * 100)) // Anlage zaehlt nicht als Konsum
  assert.equal(k.groessteAusgabe?.amount, -40)
  assert.equal(k.groessteEinnahme?.amount, 300)
  assert.equal(k.anzahl, 2)
  // Die Flows im Zaehler beginnen am 1. des Cutoff-Monats (01.07.), also zaehlt der Nenner ab dort:
  // 01.07. .. 23.10. = 115 Tage. Ab dem Cutoff-Tag (93) waeren die Ausgaben pro Tag ~24 % zu hoch.
  assert.equal(k.tage, 115)
})

test('Vorperiode: nur mit ausreichend alten Daten', () => {
  const d = basis({
    flowRows: [flow('2026-05-01', 100, 50), flow('2026-06-01', 100, 50), flow('2026-07-01', 100, 50), flow('2026-08-01', 200, 80),
               flow('2026-09-01', 200, 80), flow('2026-10-01', 200, 80)],
  })
  const k = berechneKennzahlen(d, berechneScope(d))
  // Cutoff-Monat Juli, 4 Monate (Jul-Okt) -> Vorperiode Mar-Jun; aeltester Monat ist Mai => keine
  assert.equal(k.vorperiode, null)
  const d2 = basis({ periode: '3M', cutoff: '2026-08-23', flowRows: d.flowRows })
  const k2 = berechneKennzahlen(d2, berechneScope(d2))
  assert.deepEqual(k2.vorperiode, { einnahmen: 300, ausgaben: 150, laufenderMonat: true })
  const d3 = basis({ monat: '2026-07', flowRows: d.flowRows })
  assert.equal(berechneKennzahlen(d3, berechneScope(d3)).vorperiode?.einnahmen, 100)
  assert.equal(veraenderungProzent(150, 100), 50)
  assert.equal(veraenderungProzent(5, 0), null)
})

test('Muster: zu wenig Daten, dann Hinweis auf den Monatsanfang', () => {
  assert.equal(berechneMuster([tx({ amount: -5, value_date: '2026-10-02' })], []).genug, false)
  const viele = Array.from({ length: 40 }, (_, i) =>
    tx({ amount: -10, value_date: `2026-09-0${(i % 5) + 1}` }))
  const m = berechneMuster(viele, [])
  assert.equal(m.genug, true)
  assert.equal(m.tagAnzahl[0], 8)
  assert.ok(m.hinweise[0].startsWith('Mehr als die Hälfte'))
  // 2026-09-01 ist ein Dienstag
  assert.equal(m.wochentagAnzahl[1], 8)
})
