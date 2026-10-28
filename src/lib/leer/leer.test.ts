import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EINSTELLUNGEN_HAUSHALT, EINSTELLUNGEN_INTEGRATIONEN,
  LEERE_ZAEHLER, einstiegsAnsicht, ersteSchritte, fortschritt, istDatenlos, naechsterSchritt,
  type ErsteSchritteZaehler,
} from './erste-schritte.ts'
import { scopeHinweis } from './hinweis.ts'

const z = (teil: Partial<ErsteSchritteZaehler>): ErsteSchritteZaehler => ({ ...LEERE_ZAEHLER, ...teil })

test('Erste Schritte: ohne Daten ist nichts erledigt, 0 von 4 Grundlagen, naechster ist das Konto', () => {
  const s = ersteSchritte(LEERE_ZAEHLER)
  // 4 Grundlagen + Bank, Krypto, Depot, Athena (der Partner-Schritt fehlt ohne Haushalt)
  assert.deepEqual(s.map(x => x.id), ['konto', 'buchungen', 'kategorien', 'planung', 'bank', 'krypto', 'depot', 'athena'])
  assert.ok(s.every(x => !x.erledigt))
  assert.deepEqual(fortschritt(s), { erledigt: 0, gesamt: 4, prozent: 0 })
  assert.equal(naechsterSchritt(s)?.id, 'konto')
})

test('Erste Schritte: haken sich aus den Zaehlwerten ab', () => {
  const s = ersteSchritte(z({ konten: 1, buchungen: 12, kategorien: 5, sparziele: 1 }))
  assert.deepEqual(s.filter(x => x.erledigt).map(x => x.id), ['konto', 'buchungen', 'kategorien', 'planung'])
  assert.equal(fortschritt(s).prozent, 100)
  // sind die Grundlagen fertig, ist der erste offene optionale Schritt der naechste: die Bank
  assert.equal(naechsterSchritt(s)?.id, 'bank')
})

test('Erste Schritte: Vertrag ODER Sparziel erledigt den Planungsschritt; Athena zaehlt nicht zum Fortschritt', () => {
  assert.ok(ersteSchritte(z({ vertraege: 1 })).find(x => x.id === 'planung')?.erledigt)
  assert.ok(ersteSchritte(z({ sparziele: 2 })).find(x => x.id === 'planung')?.erledigt)
  const s = ersteSchritte(z({ athenaChats: 3 }))
  assert.ok(s.find(x => x.id === 'athena')?.erledigt)
  assert.equal(fortschritt(s).erledigt, 0)
})

test('Erste Schritte: ganz fertig -> kein naechster Schritt', () => {
  const s = ersteSchritte(z({
    konten: 1, buchungen: 1, kategorien: 1, vertraege: 1, athenaChats: 1,
    bankVerbindungen: 1, kryptoKonten: 1, depots: 1,
  }))
  assert.equal(naechsterSchritt(s), null)
})

test('Erste Schritte: Anbindungen sind optional und zaehlen nicht zum Fortschritt', () => {
  const s = ersteSchritte(z({ bankVerbindungen: 1, kryptoKonten: 1, depots: 1, inventar: 2 }))
  assert.equal(fortschritt(s).erledigt, 0)
  for (const id of ['bank', 'krypto', 'depot', 'athena'] as const) {
    const x = s.find(y => y.id === id)
    assert.equal(x?.optional, true, id)
    assert.equal(x?.gruppe, 'anbindungen', id)
  }
  for (const id of ['konto', 'buchungen', 'kategorien', 'planung'] as const) {
    assert.equal(s.find(y => y.id === id)?.gruppe, 'grundlagen', id)
    assert.equal(s.find(y => y.id === id)?.optional, false, id)
  }
})

test('Erste Schritte: Bank gilt mit eigener Verbindung ODER einem Konto mit IBAN als erledigt, Link fuehrt in die Integrationen', () => {
  assert.ok(ersteSchritte(z({ bankVerbindungen: 1 })).find(x => x.id === 'bank')?.erledigt)
  assert.ok(ersteSchritte(z({ bankVerbunden: true })).find(x => x.id === 'bank')?.erledigt)
  const offen = ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'bank')
  assert.equal(offen?.erledigt, false)
  assert.equal(offen?.href, EINSTELLUNGEN_INTEGRATIONEN)
  assert.equal(offen?.href, '/settings?tab=integrationen')
})

test('Erste Schritte: Krypto erledigt mit Boersen-Schluessel ODER Krypto-Assets; offen fuehrt in die Integrationen', () => {
  assert.ok(ersteSchritte(z({ kryptoKonten: 1 })).find(x => x.id === 'krypto')?.erledigt)
  assert.ok(ersteSchritte(z({ kryptoAssets: 3 })).find(x => x.id === 'krypto')?.erledigt)
  assert.equal(ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'krypto')?.href, EINSTELLUNGEN_INTEGRATIONEN)
  // verbunden: der Link geht zur Krypto-Seite statt noch einmal zu den Einstellungen
  assert.equal(ersteSchritte(z({ kryptoKonten: 1 })).find(x => x.id === 'krypto')?.href, '/crypto')
})

test('Erste Schritte: Depot ODER Wertgegenstaende erledigen den Schritt', () => {
  assert.ok(ersteSchritte(z({ depots: 1 })).find(x => x.id === 'depot')?.erledigt)
  assert.ok(ersteSchritte(z({ inventar: 1 })).find(x => x.id === 'depot')?.erledigt)
  assert.equal(ersteSchritte(z({ depots: 1 })).find(x => x.id === 'depot')?.href, '/inventar')
  assert.equal(ersteSchritte(LEERE_ZAEHLER).find(x => x.id === 'depot')?.href, '/depot')
})

test('Erste Schritte: Partner-Schritt nur fuer den Haushalts-Eigentuemer ohne Partner oder wenn schon einer da ist', () => {
  // kein Haushalt oder Mitglied: kein Schritt
  assert.equal(ersteSchritte(LEERE_ZAEHLER).some(x => x.id === 'haushalt'), false)
  // Eigentuemer allein: offen, Link in den Haushalt-Reiter
  const offen = ersteSchritte(z({ partnerEinladbar: true })).find(x => x.id === 'haushalt')
  assert.equal(offen?.erledigt, false)
  assert.equal(offen?.href, EINSTELLUNGEN_HAUSHALT)
  assert.equal(offen?.href, '/settings?tab=haushalt')
  // Partner vorhanden: abgehakt
  assert.equal(ersteSchritte(z({ partnerVorhanden: true })).find(x => x.id === 'haushalt')?.erledigt, true)
})

test('Erste Schritte: Partner-Schritt steht zwischen Depot und Athena', () => {
  const ids = ersteSchritte(z({ partnerEinladbar: true })).map(x => x.id)
  assert.ok(ids.indexOf('haushalt') > ids.indexOf('depot') && ids.indexOf('haushalt') < ids.indexOf('athena'))
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
