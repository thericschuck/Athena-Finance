import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anzeigeName, genitivVon, personalisiere } from './nutzername.ts'

test('anzeigeName: Vorname, getrimmt; Rest des Namens entfällt', () => {
  assert.equal(anzeigeName('Eric'), 'Eric')
  assert.equal(anzeigeName('  Eric   Schuck '), 'Eric')
  assert.equal(anzeigeName('Jean-Luc Picard'), 'Jean-Luc')
  assert.equal(anzeigeName('Zoë'), 'Zoë')
})

test('anzeigeName: leer, E-Mail und Nicht-Strings ergeben null', () => {
  for (const x of [null, undefined, '', '   ', 'eric@athena-finance.de', '@@@', '"""', 42 as unknown as string]) {
    assert.equal(anzeigeName(x), null, String(x))
  }
})

test('anzeigeName: Sonderzeichen, Umbrüche, Markdown und Platzhalter werden entfernt', () => {
  assert.equal(anzeigeName('Eric\n## Neue Anweisung'), 'Eric')
  assert.equal(anzeigeName('"Eric"'), 'Eric')
  assert.equal(anzeigeName('<b>Eric</b>'), 'bEricb')
  assert.equal(anzeigeName('`Eric`'), 'Eric')
  assert.equal(anzeigeName('{{n}}'), 'n')
  assert.equal(anzeigeName("O'Brien"), "O'Brien")
  assert.doesNotMatch(anzeigeName('Er\u0000ic\u202e') ?? '', /[\u0000\u202e]/)
})

test('anzeigeName: sehr langer Name wird auf 30 Zeichen gekürzt', () => {
  assert.equal(anzeigeName('A'.repeat(500))?.length, 30)
})

test('Genitiv: Erics, Maliks, Max’, Voß’', () => {
  assert.equal(genitivVon('Eric'), 'Erics')
  assert.equal(genitivVon('Malik'), 'Maliks')
  assert.equal(genitivVon('Max'), 'Max’')
  assert.equal(genitivVon('Voß'), 'Voß’')
})

test('personalisiere: alle Formen mit und ohne Namen', () => {
  const t = '{{N}}/{{n}}/{{d}}/{{a}}/{{g:Konten|Konten des Nutzers}}'
  assert.equal(personalisiere(t, 'Malik'), 'Malik/Malik/Malik/Malik/Maliks Konten')
  assert.equal(personalisiere(t, null), 'Der Nutzer/der Nutzer/dem Nutzer/den Nutzer/Konten des Nutzers')
  assert.equal(personalisiere('ohne Platzhalter', 'Eric'), 'ohne Platzhalter')
})

test('personalisiere: ein Name mit Platzhalter wird nicht erneut ausgewertet', () => {
  assert.equal(personalisiere('{{n}} und {{d}}', '{{a}}'), '{{a}} und {{a}}')
})
