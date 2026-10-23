import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hochrechnung, kumuliert, monatVersatz, perzentil, tempoReihe, waehleVormonate } from './tempo.ts'

const ausgabe = (date: string, amount: number) => ({ date, type: 'expense' as const, amount, flow_kind: 'echt' })
const einnahme = (date: string, amount: number) => ({ date, type: 'income' as const, amount, flow_kind: 'echt' })

/** Vier Vormonate (Juni bis September): Miete 500 am 1., dazu 100 am 15. und 100 am 28. */
function historie() {
  const out = []
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    out.push(ausgabe(`${m}-01`, 500), ausgabe(`${m}-15`, 100), ausgabe(`${m}-28`, 100), einnahme(`${m}-25`, 3000))
  }
  return out
}

test('monatVersatz ueber Jahresgrenzen', () => {
  assert.equal(monatVersatz('2026-01', -1), '2025-12')
  assert.equal(monatVersatz('2026-11', 3), '2027-02')
})

test('Perzentil: Interpolation', () => {
  assert.equal(perzentil([1, 2, 3, 4], 0.5), 2.5)
  assert.equal(perzentil([10], 0.25), 10)
  assert.equal(perzentil([0, 100], 0.25), 25)
})

test('Vormonate: nur mit Buchungen, hoechstens max, nie der erste Datenmonat', () => {
  const b = historie()
  assert.deepEqual(waehleVormonate(b, '2026-10-12', null), ['2026-06', '2026-07', '2026-08', '2026-09'])
  assert.deepEqual(waehleVormonate(b, '2026-10-12', '2026-06-01'), ['2026-07', '2026-08', '2026-09'])
  assert.deepEqual(waehleVormonate(b, '2026-10-12', null, 2), ['2026-08', '2026-09'])
})

test('Kumuliert: je Tag, mit Zukunftsgrenze', () => {
  const k = kumuliert(historie(), '2026-09', 'ausgaben')
  assert.equal(k.length, 30)
  assert.equal(k[0], 500)
  assert.equal(k[13], 500)
  assert.equal(k[14], 600)
  assert.equal(k[29], 700)
  const bis = kumuliert(historie(), '2026-09', 'ausgaben', 20)
  assert.equal(bis[29], 600)
})

test('Tempo: Schnitt, Band und Abweichung; nach heute kein aktueller Wert', () => {
  const b = [...historie(), ausgabe('2026-10-01', 650), ausgabe('2026-10-09', 30), ausgabe('2026-10-20', 999)]
  const r = tempoReihe(b, '2026-10-10', 'ausgaben')!
  assert.equal(r.punkte.length, 31)
  assert.equal(r.heuteTag, 10)
  assert.equal(r.aktuellHeute, 680)
  assert.equal(r.schnittHeute, 500)
  assert.equal(r.abweichung, 180)
  assert.equal(r.punkte[9].aktuell, 680)
  assert.equal(r.punkte[10].aktuell, null)       // Zukunft: die Buchung vom 20. zaehlt noch nicht
  assert.equal(r.punkte[14].schnitt, 600)
  assert.equal(r.punkte[14].min, 600)
  assert.equal(r.punkte[14].max, 600)
})

test('Tempo: unter drei Vormonaten keine Reihe', () => {
  const b = historie().filter(x => x.date >= '2026-08')
  assert.equal(tempoReihe(b, '2026-10-10', 'ausgaben'), null)
})

test('Hochrechnung: Stand plus Rest der Vormonate, Fixkosten werden nicht hochskaliert', () => {
  // Heute 10.10.: bisher Miete 500 + 40. In jedem Vormonat kamen danach noch 200 dazu.
  const b = [...historie(), ausgabe('2026-10-01', 500), ausgabe('2026-10-05', 40)]
  const h = hochrechnung(b, '2026-10-10', 'ausgaben')
  assert.equal(h.methode, 'verlauf')
  assert.equal(h.monate, 4)
  assert.equal(h.stand, 540)
  assert.equal(h.mitte, 740)
  assert.equal(h.unten, 740)
  assert.equal(h.oben, 740)
  // Linear waere 540 / 10 * 31 = 1674: weit daneben.
})

test('Hochrechnung: Ausreisser-Monat zieht die Mitte nicht weg, verbreitert aber die Spanne', () => {
  const b = [...historie(), ausgabe('2026-08-20', 2000), ausgabe('2026-10-01', 500)]
  const h = hochrechnung(b, '2026-10-10', 'ausgaben')
  assert.equal(h.mitte, 700)
  assert.ok(h.oben! > h.mitte)
})

test('Hochrechnung: zu wenig Historie faellt auf linear ohne Spanne', () => {
  const b = [ausgabe('2026-10-01', 100), ausgabe('2026-10-10', 100)]
  const h = hochrechnung(b, '2026-10-10', 'ausgaben')
  assert.equal(h.methode, 'linear')
  assert.equal(h.mitte, 200 / 10 * 31)
  assert.equal(h.unten, null)
})

test('Hochrechnung am Monatsletzten = Stand', () => {
  const b = [...historie(), ausgabe('2026-10-01', 700)]
  assert.equal(hochrechnung(b, '2026-10-31', 'ausgaben').mitte, 700)
})

test('Einnahmen: Lohn kommt am 25., davor zaehlt nur der Stand', () => {
  const b = historie()
  const h = hochrechnung(b, '2026-10-10', 'einnahmen')
  assert.equal(h.stand, 0)
  assert.equal(h.mitte, 3000)
})
