import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeCsvText, escapeCsvValue, formatCsvAmount } from './csv.ts'

test('Gefahrzeichen am Anfang bekommen ein Apostroph', () => {
  for (const gefahr of ['=1+1', '+49 170 1234', '-5 € Kaffee', '@SUM(A1:A2)', '\tTab', '\rCR']) {
    assert.equal(escapeCsvText(gefahr).replace(/^"|"$/g, '').replace(/""/g, '"').startsWith("'"), true, JSON.stringify(gefahr))
  }
})

test('Formel wird zu Text, die Formel selbst bleibt lesbar', () => {
  assert.equal(escapeCsvText('=HYPERLINK("http://x";"a")'), `"'=HYPERLINK(""http://x"";""a"")"`)
})

test('führender Leerraum vor dem Gefahrzeichen reicht nicht zum Umgehen', () => {
  assert.equal(escapeCsvText(' =cmd'), "' =cmd")
  assert.equal(escapeCsvText('   @x'), "'   @x")
  assert.equal(escapeCsvText(' =x'), "' =x")
  assert.equal(escapeCsvText('\n=x'), `"'\n=x"`)
  assert.equal(escapeCsvText(' \t +x'), "' \t +x")
})

test('Gefahrzeichen mitten im Text sind harmlos', () => {
  for (const ok of ['Miete = 800', 'a+b', 'Max-Planck', 'info@firma.de', 'x =y']) {
    assert.equal(escapeCsvText(ok), ok)
  }
})

test('normaler Text, leere und fehlende Werte bleiben unverändert', () => {
  assert.equal(escapeCsvText('Edeka Markt'), 'Edeka Markt')
  assert.equal(escapeCsvText(''), '')
  assert.equal(escapeCsvText(null), '')
  assert.equal(escapeCsvText(undefined), '')
})

test('Leerraum ohne Gefahrzeichen dahinter bekommt kein Apostroph', () => {
  assert.equal(escapeCsvText('  Kaffee'), '  Kaffee')
  assert.equal(escapeCsvText('\nKaffee'), `"\nKaffee"`)
})

test('Maskierung von Trennzeichen und Anführungszeichen läuft weiter mit', () => {
  assert.equal(escapeCsvText('a;b'), '"a;b"')
  assert.equal(escapeCsvText('sag "hi"'), '"sag ""hi"""')
  assert.equal(escapeCsvText('=a;b'), `"'=a;b"`)
})

test('escapeCsvValue und Beträge sind unverändert (negativer Betrag bleibt Zahl)', () => {
  assert.equal(escapeCsvValue('-5'), '-5')
  assert.equal(formatCsvAmount(-12.5), '-12,50')
})
