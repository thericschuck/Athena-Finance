import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ausblickSatz, bewerteAusblick, fensterPunkte, kurzDatum, reduziereTage, SCHWELLE_KNAPP, tiefpunkte,
  type AusblickPunkt,
} from './ausblick.ts'

const tag = (datum: string, l: number, u = l - 100, o = l + 100) =>
  ({ datum, liquiditaet: l, liquiditaetUnten: u, liquiditaetOben: o })

test('reduziereTage: nur heute bis heute+n, gerundet, kurze Schluessel', () => {
  const quelle = [tag('2026-10-22', 1), tag('2026-10-23', 1000.6), tag('2026-10-25', 900.4), tag('2026-11-30', 5)]
  const r = reduziereTage(quelle, '2026-10-23', 30)
  assert.deepEqual(r.map(p => p.d), ['2026-10-23', '2026-10-25'])
  assert.equal(r[0].e, 1001)
  assert.equal(r[1].e, 900)
})

test('fensterPunkte: Umschalter schneidet vorne ab', () => {
  const p: AusblickPunkt[] = [
    { d: '2026-10-23', e: 1, u: 0, o: 2 }, { d: '2026-11-22', e: 1, u: 0, o: 2 }, { d: '2026-12-22', e: 1, u: 0, o: 2 },
  ]
  assert.equal(fensterPunkte(p, '2026-10-23', 30).length, 2)
  assert.equal(fensterPunkte(p, '2026-10-23', 60).length, 3)
})

test('tiefpunkte: frueherer Tag gewinnt bei Gleichstand, leere Liste = null', () => {
  const p: AusblickPunkt[] = [
    { d: '2026-10-23', e: 500, u: 300, o: 700 },
    { d: '2026-10-24', e: 420, u: 200, o: 600 },
    { d: '2026-10-25', e: 420, u: 100, o: 600 },
  ]
  const t = tiefpunkte(p)!
  assert.deepEqual(t.erwartet, { betrag: 420, datum: '2026-10-24' })
  assert.deepEqual(t.risiko, { betrag: 100, datum: '2026-10-25' })
  assert.equal(tiefpunkte([]), null)
})

test('bewerteAusblick: Schwellen', () => {
  assert.equal(bewerteAusblick(5000, 3000), 'ok')
  assert.equal(bewerteAusblick(SCHWELLE_KNAPP, 10), 'ok')
  assert.equal(bewerteAusblick(SCHWELLE_KNAPP - 1, 10), 'knapp')
  assert.equal(bewerteAusblick(5000, -1), 'knapp')   // nur der Risikobereich geht ins Minus: gelb
  assert.equal(bewerteAusblick(-1, -500), 'minus')
  assert.equal(bewerteAusblick(0, 0), 'knapp')
})

test('kurzDatum folgt dem Format der Einstellungen', () => {
  assert.equal(kurzDatum('2026-11-28'), '28.11.')
  assert.equal(kurzDatum('2026-11-28', 'MM/dd/yyyy'), '11/28')
  assert.equal(kurzDatum('2026-11-28', 'yyyy-MM-dd'), '11-28')
})

test('ausblickSatz: ein Satz je Stufe', () => {
  const euro = (n: number) => `${n} €`
  const dat = (i: string) => kurzDatum(i)
  const tp = (e: number, u: number) => ({
    erwartet: { betrag: e, datum: '2026-11-28' }, risiko: { betrag: u, datum: '2026-12-01' },
  })
  assert.equal(ausblickSatz(tp(420, 100), 'knapp', euro, dat), 'Wird knapp: tiefster Stand ca. 420 € am 28.11.')
  assert.equal(ausblickSatz(tp(3400, 2000), 'ok', euro, dat), 'Bleibt komfortabel: tiefster Stand ca. 3400 € am 28.11.')
  assert.equal(ausblickSatz(tp(-80, -300), 'minus', euro, dat), 'Voraussichtlich im Minus: ca. -80 € am 28.11.')
  assert.match(ausblickSatz(tp(3000, -50), 'knapp', euro, dat), /ungünstigen Fall Minus am 01\.12\./)
})
