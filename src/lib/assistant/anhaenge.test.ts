import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bildErfuelltApiGrenzen,
  istHeic,
  kuerzeName,
  mitEndung,
  pruefeAnzahl,
  pruefeBudget,
  sollBildVerkleinern,
  summeBytes,
  zielGroesse,
} from './anhaenge.ts'

const MB = 1024 * 1024

test('Verkleinern: GIF nie, fremder Typ immer, sonst nach Größe und Kante', () => {
  assert.equal(sollBildVerkleinern({ mediaType: 'image/gif', size: 20 * MB, width: 9000, height: 9000 }), false)
  assert.equal(sollBildVerkleinern({ mediaType: 'image/heic', size: 1000, width: 100, height: 100 }), true)
  assert.equal(sollBildVerkleinern({ mediaType: 'image/png', size: 4 * MB, width: 800, height: 600 }), true)
  assert.equal(sollBildVerkleinern({ mediaType: 'image/jpeg', size: 1 * MB, width: 2001, height: 100 }), true)
  assert.equal(sollBildVerkleinern({ mediaType: 'image/jpeg', size: 1 * MB, width: 2000, height: 1500 }), false)
})

test('Zielgröße: längste Kante begrenzt, nie vergrößert', () => {
  assert.deepEqual(zielGroesse(4000, 3000), { breite: 2000, hoehe: 1500 })
  assert.deepEqual(zielGroesse(3000, 4000), { breite: 1500, hoehe: 2000 })
  assert.deepEqual(zielGroesse(800, 600), { breite: 800, hoehe: 600 })
  assert.deepEqual(zielGroesse(10000, 1), { breite: 2000, hoehe: 1 })
  assert.deepEqual(zielGroesse(0, 0), { breite: 1, hoehe: 1 })
})

test('API-Grenzen je Bild: 5 MB und 8000 px', () => {
  assert.equal(bildErfuelltApiGrenzen({ size: 5 * MB, width: 8000, height: 10 }), true)
  assert.equal(bildErfuelltApiGrenzen({ size: 5 * MB + 1, width: 100, height: 10 }), false)
  assert.equal(bildErfuelltApiGrenzen({ size: 10, width: 8001, height: 10 }), false)
})

test('Budget und Anzahl', () => {
  assert.equal(summeBytes([1, 2, 3]), 6)
  assert.equal(pruefeBudget(10 * MB, 14 * MB, 'a.pdf'), null)
  assert.match(pruefeBudget(10 * MB, 14 * MB + 1, 'a.pdf') ?? '', /passt nicht mehr/)
  assert.equal(pruefeAnzahl(9, 'a'), null)
  assert.match(pruefeAnzahl(10, 'a') ?? '', /höchstens 10/)
})

test('Namen: HEIC erkennen, Endung tauschen, mittig kürzen', () => {
  assert.equal(istHeic('image/heic', 'x'), true)
  assert.equal(istHeic('', 'IMG_1.HEIF'), true)
  assert.equal(istHeic('image/jpeg', 'x.jpg'), false)
  assert.equal(mitEndung('foto.heic', 'jpg'), 'foto.jpg')
  assert.equal(mitEndung('foto', 'jpg'), 'foto.jpg')
  assert.equal(kuerzeName('kurz.pdf'), 'kurz.pdf')
  const lang = kuerzeName('eine-sehr-lange-rechnung-2026.pdf', 22)
  assert.ok(lang.length <= 22 && lang.endsWith('.pdf') && lang.includes('…'))
})
