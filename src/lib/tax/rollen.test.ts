import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effektiveRollen, type Kategorieknoten } from './rollen.ts'

/** Erics Baum, verkuerzt auf das, was steuerlich zaehlt. */
const BAUM: Kategorieknoten[] = [
  { id: 'business',   parent_id: null,       tax_role: null },
  { id: 'einnahmen',  parent_id: 'business', tax_role: 'betriebseinnahme' },
  { id: 'tools',      parent_id: 'business', tax_role: null },
  { id: 'weiterbild', parent_id: 'business', tax_role: null },
  { id: 'abo',        parent_id: null,       tax_role: null },
  { id: 'claude',     parent_id: 'abo',      tax_role: null },
  { id: 'gehalt',     parent_id: null,       tax_role: 'lohn' },
]

test('ohne Zuordnung hat niemand eine Rolle', () => {
  const rollen = effektiveRollen(BAUM)
  assert.equal(rollen.get('tools'), null)
  assert.equal(rollen.get('claude'), null)
})

test('eigene Rolle gewinnt', () => {
  const rollen = effektiveRollen(BAUM)
  assert.equal(rollen.get('einnahmen'), 'betriebseinnahme')
  assert.equal(rollen.get('gehalt'), 'lohn')
})

test('Rolle der Oberkategorie vererbt sich auf den Teilbaum', () => {
  // Ein Klick auf "Business" muss Tools und Weiterbildung mitnehmen.
  const baum = BAUM.map(k =>
    k.id === 'business' ? { ...k, tax_role: 'betriebsausgabe' } : k,
  )
  const rollen = effektiveRollen(baum)
  assert.equal(rollen.get('tools'), 'betriebsausgabe')
  assert.equal(rollen.get('weiterbild'), 'betriebsausgabe')
  // Die eigene Rolle des Kindes bleibt unberuehrt.
  assert.equal(rollen.get('einnahmen'), 'betriebseinnahme')
  // Ein anderer Teilbaum bleibt unberuehrt.
  assert.equal(rollen.get('claude'), null)
})

test('Vererbung geht ueber mehrere Ebenen', () => {
  const tief: Kategorieknoten[] = [
    { id: 'a', parent_id: null, tax_role: 'betriebsausgabe' },
    { id: 'b', parent_id: 'a',  tax_role: null },
    { id: 'c', parent_id: 'b',  tax_role: null },
    { id: 'd', parent_id: 'c',  tax_role: null },
  ]
  assert.equal(effektiveRollen(tief).get('d'), 'betriebsausgabe')
})

test('ein Zyklus in parent_id laesst die Funktion nicht haengen', () => {
  // Das Datenmodell verhindert das nicht. Ohne Absicherung wuerde die
  // Steuerseite hier endlos drehen statt eine Zahl zu zeigen.
  const zyklus: Kategorieknoten[] = [
    { id: 'x', parent_id: 'y', tax_role: null },
    { id: 'y', parent_id: 'x', tax_role: null },
  ]
  const rollen = effektiveRollen(zyklus)
  assert.equal(rollen.get('x'), null)
  assert.equal(rollen.get('y'), null)
})

test('Zyklus mit einer Rolle darin liefert die Rolle', () => {
  const zyklus: Kategorieknoten[] = [
    { id: 'x', parent_id: 'y', tax_role: null },
    { id: 'y', parent_id: 'x', tax_role: 'lohn' },
  ]
  assert.equal(effektiveRollen(zyklus).get('x'), 'lohn')
})

test('fehlende Oberkategorie wird nicht zum Absturz', () => {
  const verwaist: Kategorieknoten[] = [{ id: 'a', parent_id: 'gibt-es-nicht', tax_role: null }]
  assert.equal(effektiveRollen(verwaist).get('a'), null)
})

test('jede Kategorie kommt genau einmal im Ergebnis vor', () => {
  const rollen = effektiveRollen(BAUM)
  assert.equal(rollen.size, BAUM.length)
})
