import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTage } from './datum.ts'
import { berechnePrognose, lerneModelle, type PrognoseEingaben } from './cashflow.ts'
import type { TagesSumme } from './zyklus.ts'

/** Ein Jahr Historie mit Monatsrhythmus: Ausgaben am 3. und 15., Einnahmen am 25. */
function historie(bis: string, faktor = 1): TagesSumme[] {
  const out: TagesSumme[] = []
  for (let i = 0; i < 400; i++) {
    const datum = addTage(bis, -i)
    const tag = Number(datum.slice(8, 10))
    const aus = (tag === 3 ? 900 : tag === 15 ? 300 : 20) * faktor
    const ein = tag === 25 ? 700 * faktor : 0
    out.push({ datum, einnahmen: ein, ausgaben: aus, einnahmenEcht: ein, ausgabenEcht: aus, lohn: 0 })
  }
  return out.reverse()
}

const eingaben = (tage: TagesSumme[]): PrognoseEingaben => ({
  heute: '2026-10-22', monate: 6, liquideKontoIds: ['a', 'b'], liquiditaet: 5000, vermoegen: 20000,
  vertraege: [], tage, lohnTag: 27, annahmen: [],
})

test('lerneModelle: gleiche Eingabe gibt dieselben Modelle zurück, andere Eingabe neue', () => {
  const tage = historie('2026-10-21')
  const a = lerneModelle(eingaben(tage))
  assert.equal(lerneModelle(eingaben(historie('2026-10-21'))), a)               // gleicher Inhalt, andere Objekte
  assert.equal(lerneModelle({ ...eingaben(tage), liquideKontoIds: ['b', 'a'] }), a) // Reihenfolge der Konten egal
  assert.notEqual(lerneModelle(eingaben(historie('2026-10-21', 1.5))), a)       // andere Beträge
  assert.notEqual(lerneModelle({ ...eingaben(tage), heute: '2026-10-23' }), a)  // anderer Tag
})

test('Geteilte Modelle liefern exakt dasselbe wie frisch gelernte', () => {
  const e = eingaben(historie('2026-10-21', 1.1))
  const geteilt = berechnePrognose(e, lerneModelle(e))
  const frisch = berechnePrognose({ ...e, tage: e.tage.map(t => ({ ...t })) })
  assert.deepEqual(geteilt, frisch)
})

test('Basis und Szenario teilen die Modelle: Annahmen ändern nur das Szenario', () => {
  const e = eingaben(historie('2026-10-21'))
  const modelle = lerneModelle(e)
  const ohne = berechnePrognose({ ...e, annahmen: [] }, modelle)
  const mit = berechnePrognose({
    ...e,
    annahmen: [{ id: 'x', art: 'ausgabe', bezeichnung: 'Auto', betrag: 500, von: '2026-11', bis: null, einmalig: false } as never],
  }, modelle)
  assert.deepEqual(ohne.modell, mit.modell)                 // gelernt: identisch
  assert.notDeepEqual(ohne.monate, mit.monate)              // Wirkung der Annahme: anders
})
