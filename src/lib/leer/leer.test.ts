import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEERE_ZAEHLER, einstiegsAnsicht, ersteSchritte, fortschritt, istDatenlos, naechsterSchritt,
  type ErsteSchritteZaehler,
} from './erste-schritte.ts'
import { scopeHinweis } from './hinweis.ts'

const z = (teil: Partial<ErsteSchritteZaehler>): ErsteSchritteZaehler => ({ ...LEERE_ZAEHLER, ...teil })

test('Erste Schritte: ohne Daten ist nichts erledigt, 0 von 4, naechster ist das Konto', () => {
  const s = ersteSchritte(LEERE_ZAEHLER)
  assert.equal(s.length, 5)
  assert.ok(s.every(x => !x.erledigt))
  assert.deepEqual(fortschritt(s), { erledigt: 0, gesamt: 4, prozent: 0 })
  assert.equal(naechsterSchritt(s)?.id, 'konto')
})

test('Erste Schritte: haken sich aus den Zaehlwerten ab', () => {
  const s = ersteSchritte(z({ konten: 1, buchungen: 12, kategorien: 5, sparziele: 1 }))
  assert.deepEqual(s.filter(x => x.erledigt).map(x => x.id), ['konto', 'buchungen', 'kategorien', 'planung'])
  assert.equal(fortschritt(s).prozent, 100)
  // nur Athena (optional) bleibt offen und ist dann der naechste Schritt
  assert.equal(naechsterSchritt(s)?.id, 'athena')
})

test('Erste Schritte: Vertrag ODER Sparziel erledigt den Planungsschritt; Athena zaehlt nicht zum Fortschritt', () => {
  assert.ok(ersteSchritte(z({ vertraege: 1 })).find(x => x.id === 'planung')?.erledigt)
  assert.ok(ersteSchritte(z({ sparziele: 2 })).find(x => x.id === 'planung')?.erledigt)
  const s = ersteSchritte(z({ athenaChats: 3 }))
  assert.ok(s.find(x => x.id === 'athena')?.erledigt)
  assert.equal(fortschritt(s).erledigt, 0)
})

test('Erste Schritte: ganz fertig -> kein naechster Schritt', () => {
  const s = ersteSchritte(z({ konten: 1, buchungen: 1, kategorien: 1, vertraege: 1, athenaChats: 1 }))
  assert.equal(naechsterSchritt(s), null)
})

test('Dashboard-Ansicht: nichts da -> voll (Checkliste ersetzt das Dashboard)', () => {
  assert.equal(istDatenlos(LEERE_ZAEHLER), true)
  assert.equal(einstiegsAnsicht(LEERE_ZAEHLER), 'voll')
})

test('Dashboard-Ansicht: schon eine Anlage, ein Vertrag oder ein Sparziel -> nicht mehr voll', () => {
  for (const teil of [{ anlagen: 1 }, { vertraege: 1 }, { sparziele: 1 }, { buchungen: 1 }, { konten: 1 }]) {
    assert.notEqual(einstiegsAnsicht(z(teil)), 'voll', JSON.stringify(teil))
  }
})

test('Dashboard-Ansicht: Konto ohne Buchungen oder Buchungen ohne Konto -> Karte', () => {
  assert.equal(einstiegsAnsicht(z({ konten: 1 })), 'karte')
  assert.equal(einstiegsAnsicht(z({ buchungen: 3 })), 'karte')
  assert.equal(einstiegsAnsicht(z({ anlagen: 2 })), 'karte')
})

test('Dashboard-Ansicht: Konto UND Buchungen -> aus (Regression: Nutzer mit Daten sehen nichts Neues)', () => {
  assert.equal(einstiegsAnsicht(z({ konten: 1, buchungen: 1 })), 'aus')
  assert.equal(einstiegsAnsicht(z({ konten: 4, buchungen: 900, kategorien: 30, vertraege: 5, sparziele: 2, athenaChats: 9, anlagen: 3 })), 'aus')
})

const mitglieder = [
  { id: 'eric', name: 'Eric', role: 'owner' },
  { id: 'malik', name: 'Malik', role: 'member' },
]
const ctx = (scope: 'ich' | 'partner' | 'gemeinsam', available: ('ich' | 'partner' | 'gemeinsam')[], userId = 'malik') => ({
  scope, available, members: mitglieder, userId, partnerId: userId === 'malik' ? 'eric' : 'malik',
})

test('Scope-Hinweis: ohne Haushalt (nur ein Scope) kein Hinweis', () => {
  assert.equal(scopeHinweis(ctx('ich', ['ich']), 'Konten'), null)
})

test('Scope-Hinweis: im Scope Gemeinsam kein Hinweis', () => {
  assert.equal(scopeHinweis(ctx('gemeinsam', ['ich', 'partner', 'gemeinsam']), 'Konten'), null)
})

test('Scope-Hinweis: Ich + Haushalt -> verweist auf Gemeinsam und nennt den Partner', () => {
  const h = scopeHinweis(ctx('ich', ['ich', 'partner', 'gemeinsam']), 'Konten')
  assert.equal(h?.ziel, 'gemeinsam')
  assert.match(h?.text ?? '', /Konten von Eric/)
})

test('Scope-Hinweis: ohne Partnername faellt der Text sauber zurueck', () => {
  const h = scopeHinweis({ ...ctx('ich', ['ich', 'gemeinsam']), members: [{ id: 'malik', name: null, role: 'member' }, { id: 'eric', name: ' ', role: 'owner' }] }, 'Verträge')
  assert.match(h?.text ?? '', /Verträge von dem Partner/)
})

test('Scope-Hinweis: Scope Partner verweist ebenfalls auf Gemeinsam', () => {
  assert.equal(scopeHinweis(ctx('partner', ['ich', 'partner', 'gemeinsam']), 'Konten')?.ziel, 'gemeinsam')
})
