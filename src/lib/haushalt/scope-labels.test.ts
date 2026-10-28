import { test } from 'node:test'
import assert from 'node:assert/strict'
import { namensAnfang, scopeAnzeige } from './scope-labels.ts'

test('Normalfall: Anfangsbuchstaben in Grossbuchstaben, & fuer Gemeinsam', () => {
  const a = scopeAnzeige('Eric', 'Malik')
  assert.equal(a.ich.zeichen, 'E')
  assert.equal(a.partner.zeichen, 'M')
  assert.equal(a.gemeinsam.zeichen, '&')
})

test('volle Texte fuer aria-label/title', () => {
  const a = scopeAnzeige('Eric', 'Malik')
  assert.equal(a.ich.text, 'Ich (Eric)')
  assert.equal(a.partner.text, 'Malik')
  assert.equal(a.gemeinsam.text, 'Gemeinsam')
})

test('Fallbacks ohne Namen: I und P, Texte ohne Klammer', () => {
  for (const leer of [null, undefined, '', '   ']) {
    const a = scopeAnzeige(leer, leer)
    assert.equal(a.ich.zeichen, 'I')
    assert.equal(a.partner.zeichen, 'P')
    assert.equal(a.ich.text, 'Ich')
    assert.equal(a.partner.text, 'Partner')
  }
})

test('kleingeschriebene Namen werden gross', () => {
  assert.equal(scopeAnzeige('eric', 'malik').ich.zeichen, 'E')
  assert.equal(scopeAnzeige('eric', 'malik').partner.zeichen, 'M')
})

test('Umlaute und Akzente am Anfang', () => {
  assert.equal(namensAnfang('ömer'), 'Ö')
  assert.equal(namensAnfang('Åsa'), 'Å')
  assert.equal(namensAnfang('élodie'), 'É')
  // zerlegtes E + kombinierender Akzent bleibt ein Zeichen
  assert.equal(namensAnfang('élodie'), 'É')
  assert.equal(namensAnfang('ßeta'), 'S')
})

test('Sonderzeichen und Leerraum am Namensanfang werden uebersprungen', () => {
  assert.equal(namensAnfang('  (Eric)'), 'E')
  assert.equal(namensAnfang('-- malik'), 'M')
  assert.equal(namensAnfang('"Anna"'), 'A')
  assert.equal(namensAnfang('@@@'), '')
  assert.equal(scopeAnzeige('***', '!!!').ich.zeichen, 'I')
})

test('Ziffern zaehlen als Zeichen', () => {
  assert.equal(namensAnfang('007'), '0')
})

test('Emoji-Namen: ganzes Graphem, nicht [0]', () => {
  assert.equal(namensAnfang('😀 Eric'), '😀')
  assert.equal(namensAnfang('👨‍👩‍👧 Familie'), '👨‍👩‍👧')
  assert.equal(namensAnfang('🇩🇪 Hans'), '🇩🇪')
  assert.equal(scopeAnzeige('😀', 'Malik').ich.zeichen, '😀')
})

test('Kollision: gleicher Anfangsbuchstabe -> Partner bekommt zwei Zeichen', () => {
  const a = scopeAnzeige('Eric', 'Emma')
  assert.equal(a.ich.zeichen, 'E')
  assert.equal(a.partner.zeichen, 'EM')
  assert.notEqual(a.ich.zeichen, a.partner.zeichen)
})

test('Kollision, nicht aufloesbar (Ein-Zeichen-Partner): beide auf Fallback', () => {
  const a = scopeAnzeige('Eric', 'E')
  assert.equal(a.ich.zeichen, 'I')
  assert.equal(a.partner.zeichen, 'P')
})

test('Kollision ohne Eigennamen: Fallback-I gegen Partner mit I', () => {
  const a = scopeAnzeige(null, 'Ida')
  assert.equal(a.ich.zeichen, 'I')
  assert.equal(a.partner.zeichen, 'ID')
})

test('Zeichen sind nie leer und nie gleich', () => {
  const faelle: Array<[string | null, string | null]> = [
    ['Eric', 'Malik'], ['Eric', 'Eric'], [null, null], ['', 'P'], ['I', null], ['P', 'P'], ['😀', '😀'],
  ]
  for (const [o, p] of faelle) {
    const a = scopeAnzeige(o, p)
    const z = [a.ich.zeichen, a.partner.zeichen, a.gemeinsam.zeichen]
    assert.ok(z.every(x => x !== ''))
    assert.equal(new Set(z).size, 3, `${o}/${p}: ${z.join(',')}`)
  }
})

test('Gemeinsam bleibt eindeutig, auch wenn ein Name mit G beginnt', () => {
  const a = scopeAnzeige('Greta', 'Gero')
  assert.equal(a.gemeinsam.zeichen, '&')
  assert.notEqual(a.ich.zeichen, a.gemeinsam.zeichen)
})
